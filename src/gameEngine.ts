import { Cell, Stone, GameState, Player, HistoryEntry } from './types';

export const BOARD_SIZE = 15;
export const INITIAL_ENERGY = 3;
export const MAX_ENERGY = 5;

export function createInitialState(): GameState {
  const board: Cell[][] = Array.from({ length: BOARD_SIZE }, (_, x) =>
    Array.from({ length: BOARD_SIZE }, (_, y) => ({
      x, y,
      stone: null,
      tags: new Set<string>(),
      props: new Map<string, any>(),
      triggers: new Map<string, Function>(),
    }))
  );

  return {
    board,
    currentPlayer: 'black',
    turnCount: 0,
    history: [],
    globalTags: new Set<string>(),
    globalProps: new Map<string, any>(),
    globalTriggers: new Map<string, Function[]>(),
    delayedEffects: [],
    ongoingEffects: [],
    energy: { black: INITIAL_ENERGY, white: INITIAL_ENERGY },
    skillCache: new Map(),
    skillCooldowns: { black: new Map(), white: new Map() },
    winner: null,
    gameOver: false,
    extraTurns: { black: 0, white: 0 },
    skipNextTurn: { black: false, white: false },
  };
}

export function deepCopyBoard(board: Cell[][]): Cell[][] {
  return board.map(row =>
    row.map(cell => ({
      ...cell,
      stone: cell.stone
        ? {
            ...cell.stone,
            tags: new Set(cell.stone.tags),
            props: new Map(cell.stone.props),
            triggers: new Map(cell.stone.triggers),
          }
        : null,
      tags: new Set(cell.tags),
      props: new Map(cell.props),
      triggers: new Map(cell.triggers),
    }))
  );
}

export function checkWinner(board: Cell[][], x: number, y: number, player: Player): boolean {
  const stone = board[x]?.[y]?.stone;
  if (!stone || stone.owner !== player) return false;

  const directions: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

  for (const [dx, dy] of directions) {
    let count = 1;
    for (let i = 1; i < 5; i++) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
      const s = board[nx][ny].stone;
      if (!s || s.owner !== player) break;
      count++;
    }
    for (let i = 1; i < 5; i++) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
      const s = board[nx][ny].stone;
      if (!s || s.owner !== player) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

/**
 * 纯函数：落子 + 判胜，不做回合切换。
 * 返回 null 表示不合法（格子被占/blocked/越界）。
 */
export function applyPlaceStone(
  state: GameState,
  x: number,
  y: number,
  owner?: Player,
  stoneOpts?: Partial<Stone>,
): GameState | null {
  if (state.gameOver) return null;
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
  if (state.board[x][y].stone !== null) return null;
  if (state.board[x][y].tags.has('blocked')) return null;

  const player = owner ?? state.currentPlayer;
  const newBoard = deepCopyBoard(state.board);
  const stone: Stone = {
    owner: player,
    visibleAs: player,
    tags: new Set(stoneOpts?.tags),
    props: new Map(stoneOpts?.props),
    triggers: new Map(stoneOpts?.triggers),
  };
  newBoard[x][y].stone = stone;

  const winner = checkWinner(newBoard, x, y, player) ? player : null;
  const historyEntry: HistoryEntry = {
    player,
    x,
    y,
    snapshot: deepCopyBoard(newBoard),
  };

  return {
    ...state,
    board: newBoard,
    history: [...state.history, historyEntry],
    winner,
    gameOver: winner !== null,
  };
}

/**
 * 纯函数：回合结算。
 * 处理 extraTurns / skipNextTurn / 冷却递减 / 能量回复 / turnCount++
 * 不处理 delayed/ongoing effects（这些有副作用，在 hook 里处理）。
 */
export function applyTurnEnd(state: GameState): GameState {
  if (state.gameOver) return state;

  const cur = state.currentPlayer;
  const opp: Player = cur === 'black' ? 'white' : 'black';

  // 决定下一个行动方
  let nextPlayer: Player;
  const newExtraTurns = { ...state.extraTurns };
  const newSkip = { ...state.skipNextTurn };

  if (newExtraTurns[cur] > 0) {
    nextPlayer = cur;
    newExtraTurns[cur]--;
  } else if (newSkip[opp]) {
    nextPlayer = cur;
    newSkip[opp] = false;
  } else {
    nextPlayer = opp;
  }

  // 冷却递减（当前玩家本回合行动完毕）
  const newCooldowns = {
    black: new Map(state.skillCooldowns.black),
    white: new Map(state.skillCooldowns.white),
  };
  for (const [key, val] of newCooldowns[cur]) {
    if (val <= 1) newCooldowns[cur].delete(key);
    else newCooldowns[cur].set(key, val - 1);
  }

  // 下一玩家能量回复
  const newEnergy = { ...state.energy };
  newEnergy[nextPlayer] = Math.min(MAX_ENERGY, newEnergy[nextPlayer] + 1);

  return {
    ...state,
    currentPlayer: nextPlayer,
    turnCount: state.turnCount + 1,
    extraTurns: newExtraTurns,
    skipNextTurn: newSkip,
    skillCooldowns: newCooldowns,
    energy: newEnergy,
  };
}

/**
 * 纯函数：消耗能量。返回 null 表示能量不足。
 */
export function applyConsumeEnergy(state: GameState, player: Player, cost: number): GameState | null {
  if (state.energy[player] < cost) return null;
  return {
    ...state,
    energy: { ...state.energy, [player]: state.energy[player] - cost },
  };
}

/**
 * 纯函数：设置技能冷却。
 */
export function applySetCooldown(state: GameState, player: Player, idiom: string, cooldown: number): GameState {
  const newCooldowns = {
    black: new Map(state.skillCooldowns.black),
    white: new Map(state.skillCooldowns.white),
  };
  newCooldowns[player].set(idiom, cooldown);
  return { ...state, skillCooldowns: newCooldowns };
}
