import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cell, GameState, OngoingEffect, Player, RenderHint, SkillDefinition } from './types';
import {
  applyConsumeEnergy,
  applyPlaceStone,
  applySetCooldown,
  applyTurnEnd,
  createInitialState,
  deepCopyBoard,
} from './gameEngine';
import { createBoardAPI } from './boardApi';
import { generateSkill as aiGenerateSkill } from './aiService';

export interface VisualEffect {
  id: number;
  x: number;
  y: number;
  type: string;
  opts?: any;
}

let effectIdCounter = 0;

// ── 目标选择状态 ─────────────────────────────────────────────────────────────
export interface ChoiceRequest {
  player: Player;
  prompt: string;
  filter: ((cell: Cell) => boolean) | null;
  resolve: (pos: [number, number]) => void;
  reject: () => void;
}

export function useGameEngine() {
  // ── 核心状态 ────────────────────────────────────────────────────────────────
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  // stateRef 供 boardAPI 同步读取最新状态（不等 React re-render）
  const stateRef = useRef<GameState>(gameState);
  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  // 同步更新 ref + state 的辅助函数
  const commit = useCallback((newState: GameState) => {
    stateRef.current = newState;
    setGameState(newState);
  }, []);

  // ── UI 状态 ─────────────────────────────────────────────────────────────────
  const [message, setMessage] = useState('');
  const [effects, setEffects] = useState<VisualEffect[]>([]);
  const [renderHints, setRenderHints] = useState<Record<string, RenderHint>>({});
  const [lastMove, setLastMove] = useState<{ x: number; y: number } | null>(null);

  // ── 目标选择 ────────────────────────────────────────────────────────────────
  const [choiceRequest, setChoiceRequest] = useState<ChoiceRequest | null>(null);

  // ── BoardAPI 回调 ────────────────────────────────────────────────────────────
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  }, []);

  const showEffect = useCallback((x: number, y: number, type: string, opts?: any) => {
    const id = ++effectIdCounter;
    setEffects(prev => [...prev, { id, x, y, type, opts }]);
    setTimeout(() => setEffects(prev => prev.filter(e => e.id !== id)), 800);
  }, []);

  const requestPlayerChoice = useCallback(
    (player: Player, prompt: string, filter?: (cell: Cell) => boolean): Promise<[number, number]> =>
      new Promise((resolve, reject) => {
        setChoiceRequest({ player, prompt, filter: filter ?? null, resolve, reject });
      }),
    [],
  );

  // ── BoardAPI ────────────────────────────────────────────────────────────────
  const boardAPI = useMemo(
    () => createBoardAPI(stateRef, setGameState, showMessage, showEffect, requestPlayerChoice),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── effects 调度（回合结算时调用） ──────────────────────────────────────────
  /**
   * 执行所有已到期的 delayedEffects 和 ongoingEffects。
   * 使用传入的 state（最新的）以避免闭包过时问题。
   */
  const processEffects = useCallback(async (state: GameState) => {
    const currentTurn = state.turnCount;

    // 1. 延迟效果
    const due = state.delayedEffects.filter(e => e.triggerTurn <= currentTurn);
    const remaining = state.delayedEffects.filter(e => e.triggerTurn > currentTurn);
    if (due.length > 0) {
      setGameState(prev => ({ ...prev, delayedEffects: remaining }));
      stateRef.current = { ...stateRef.current, delayedEffects: remaining };
    }
    for (const ef of due) {
      try { await ef.effect(boardAPI); } catch (e) { console.error('[DelayedEffect]', e); }
    }

    // 2. 持续效果
    const nextOngoing: OngoingEffect[] = [];
    for (const ef of state.ongoingEffects) {
      try { await ef.onEachTurn(boardAPI); } catch (e) { console.error('[OngoingEffect.onEachTurn]', e); }
      if (ef.remainingTurns <= 1) {
        try { await ef.onExpire(boardAPI); } catch (e) { console.error('[OngoingEffect.onExpire]', e); }
      } else {
        nextOngoing.push({ ...ef, remainingTurns: ef.remainingTurns - 1 });
      }
    }
    if (state.ongoingEffects.length > 0) {
      setGameState(prev => ({ ...prev, ongoingEffects: nextOngoing }));
      stateRef.current = { ...stateRef.current, ongoingEffects: nextOngoing };
    }

    // 3. 全局 onTurnEnd 触发器
    const triggers = stateRef.current.globalTriggers.get('onTurnEnd') ?? [];
    for (const fn of triggers) {
      try { await fn(boardAPI); } catch (e) { console.error('[GlobalTrigger onTurnEnd]', e); }
    }
  }, [boardAPI]);

  // ── 回合结算 ─────────────────────────────────────────────────────────────────
  const endTurn = useCallback(async (stateAfterAction: GameState) => {
    if (stateAfterAction.gameOver) return;

    // 先执行 effects（它们可能修改 board）
    await processEffects(stateAfterAction);

    // 然后做纯函数回合切换
    setGameState(prev => {
      const next = applyTurnEnd(prev);
      stateRef.current = next;
      return next;
    });
  }, [processEffects]);

  // ── 落子 ────────────────────────────────────────────────────────────────────
  const handlePlaceStone = useCallback(async (x: number, y: number) => {
    // 如果正在等待玩家选择目标，把点击转发过去
    if (choiceRequest) {
      const cell = stateRef.current.board[x]?.[y];
      if (!cell) return;
      if (choiceRequest.filter && !choiceRequest.filter(cell)) {
        showMessage('请选择合法的目标格子');
        return;
      }
      const resolve = choiceRequest.resolve;
      setChoiceRequest(null);
      resolve([x, y]);
      return;
    }

    const state = stateRef.current;
    if (state.gameOver) return;

    const newState = applyPlaceStone(state, x, y);
    if (!newState) return; // 非法位置

    setLastMove({ x, y });
    commit(newState);

    if (newState.winner) {
      showMessage(`${newState.winner === 'black' ? '黑方' : '白方'} 获胜！`);
      return;
    }

    await endTurn(newState);
  }, [choiceRequest, commit, endTurn, showMessage]);

  // ── 使用技能 ────────────────────────────────────────────────────────────────
  const handleUseSkill = useCallback(async (
    idiom: string,
    skillDef: SkillDefinition,
  ) => {
    const state = stateRef.current;
    if (state.gameOver) return;

    const player = state.currentPlayer;

    // 能量/冷却校验（尚不消耗，等目标确认后再消耗）
    if (state.energy[player] < skillDef.cost) {
      showMessage(`能量不足（需要 ${skillDef.cost} 点，当前 ${state.energy[player]} 点）`);
      return;
    }
    const cd = state.skillCooldowns[player].get(idiom) ?? 0;
    if (cd > 0) {
      showMessage(`「${idiom}」冷却中，还需 ${cd} 回合`);
      return;
    }

    // 如果需要目标：让玩家点棋盘上任意一格，该格即为施法中心
    // 不高亮、不复杂——下一次点击就是目标，和落子完全一样的手感
    let resolvedTarget: [number, number] | undefined;
    if (skillDef.requiresTarget) {
      try {
        resolvedTarget = await requestPlayerChoice(
          player,
          `点击棋盘，选择「${idiom}」的施法中心`,
        );
      } catch {
        showMessage('已取消技能');
        return; // 未消耗任何资源，安全退出
      }
    }

    // 目标确认后再扣能量和设冷却
    const afterEnergy = applyConsumeEnergy(stateRef.current, player, skillDef.cost);
    if (!afterEnergy) return; // 极端情况兜底
    let newState = afterEnergy;
    if (skillDef.cooldown > 0) {
      newState = applySetCooldown(newState, player, idiom, skillDef.cooldown);
    }
    if (skillDef.renderHints) {
      setRenderHints(prev => ({ ...prev, ...skillDef.renderHints }));
    }
    commit(newState);

    // 执行技能
    try {
      const fn = new Function('api', 'target', skillDef.execute);
      await fn(boardAPI, resolvedTarget);
    } catch (e) {
      console.error('[SkillExecute]', e);
      showMessage(`技能执行出错：${(e as Error).message}`);
    }

    // 记录到历史
    setGameState(prev => ({
      ...prev,
      history: [
        ...prev.history,
        { player, skill: idiom, snapshot: deepCopyBoard(prev.board) },
      ],
    }));

    await endTurn(stateRef.current);
  }, [boardAPI, commit, endTurn, requestPlayerChoice, showMessage]);

  // ── 生成技能（带本局缓存） ─────────────────────────────────────────────────
  const generateSkillForGame = useCallback(async (idiom: string): Promise<SkillDefinition> => {
    // 本局 skillCache 命中，直接返回
    const cached = stateRef.current.skillCache.get(idiom);
    if (cached) return cached;

    const skill = await aiGenerateSkill(idiom);

    // 存入 skillCache（本局复用）
    setGameState(prev => {
      const newCache = new Map(prev.skillCache);
      newCache.set(idiom, skill);
      const next = { ...prev, skillCache: newCache };
      stateRef.current = next;
      return next;
    });

    return skill;
  }, []);

  // ── 取消目标选择 ─────────────────────────────────────────────────────────────
  const cancelChoice = useCallback(() => {
    if (choiceRequest) {
      choiceRequest.reject();
      setChoiceRequest(null);
    }
  }, [choiceRequest]);

  // ── 重新开始 ─────────────────────────────────────────────────────────────────
  const restart = useCallback(() => {
    const fresh = createInitialState();
    stateRef.current = fresh;
    setGameState(fresh);
    setLastMove(null);
    setMessage('');
    setEffects([]);
    setRenderHints({});
    setChoiceRequest(null);
  }, []);

  // ── 辅助：获取高亮格子（目标选择时） ─────────────────────────────────────────
  const highlightCells = useMemo<Set<string>>(() => {
    if (!choiceRequest?.filter) return new Set();
    const s = gameState;
    const set = new Set<string>();
    for (let x = 0; x < 15; x++)
      for (let y = 0; y < 15; y++)
        if (choiceRequest.filter(s.board[x][y])) set.add(`${x},${y}`);
    return set;
  }, [choiceRequest, gameState]);

  return {
    gameState,
    boardAPI,
    lastMove,
    message,
    effects,
    renderHints,
    choiceRequest,
    highlightCells,
    handlePlaceStone,
    handleUseSkill,
    generateSkillForGame,
    cancelChoice,
    restart,
    showMessage,
  };
}
