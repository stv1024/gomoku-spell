import { BoardAPI, Cell, GameState, Player } from './types';
import { BOARD_SIZE, checkWinner, deepCopyBoard } from './gameEngine';

export type SetStateCallback = (updater: (prev: GameState) => GameState) => void;
export type ShowMessageCallback = (msg: string) => void;
export type ShowEffectCallback = (x: number, y: number, type: string, opts?: any) => void;
export type RequestChoiceCallback = (player: Player, prompt: string, filter?: (cell: Cell) => boolean) => Promise<[number, number]>;

export function createBoardAPI(
  stateRef: { current: GameState },
  setState: SetStateCallback,
  showMessage: ShowMessageCallback,
  showEffect: ShowEffectCallback,
  requestChoice: RequestChoiceCallback,
): BoardAPI {
  function getState() { return stateRef.current; }

  const api: BoardAPI = {
    getCell(x, y) {
      const s = getState();
      if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
      return s.board[x][y];
    },
    getStone(x, y) {
      return api.getCell(x, y)?.stone ?? null;
    },
    findCells(filter) {
      const s = getState();
      const results: Cell[] = [];
      for (let x = 0; x < BOARD_SIZE; x++)
        for (let y = 0; y < BOARD_SIZE; y++)
          if (filter(s.board[x][y])) results.push(s.board[x][y]);
      return results;
    },
    getNeighbors(x, y, range = 1) {
      const cells: Cell[] = [];
      const s = getState();
      for (let dx = -range; dx <= range; dx++)
        for (let dy = -range; dy <= range; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE)
            cells.push(s.board[nx][ny]);
        }
      return cells;
    },
    getLine(x, y, dir, len) {
      const cells: Cell[] = [];
      const s = getState();
      for (let i = 0; i < len; i++) {
        const nx = x + dir[0] * i, ny = y + dir[1] * i;
        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
        cells.push(s.board[nx][ny]);
      }
      return cells;
    },
    getConnections(player, minLen = 2) {
      const s = getState();
      const directions: [number, number][] = [[1,0],[0,1],[1,1],[1,-1]];
      const connections: Cell[][] = [];
      const visited = new Set<string>();
      for (let x = 0; x < BOARD_SIZE; x++)
        for (let y = 0; y < BOARD_SIZE; y++) {
          const stone = s.board[x][y].stone;
          if (!stone || stone.owner !== player) continue;
          for (const [dx, dy] of directions) {
            const key = `${x},${y},${dx},${dy}`;
            if (visited.has(key)) continue;
            const line: Cell[] = [];
            let cx = x, cy = y;
            while (cx >= 0 && cx < BOARD_SIZE && cy >= 0 && cy < BOARD_SIZE && s.board[cx][cy].stone?.owner === player) {
              line.push(s.board[cx][cy]);
              visited.add(`${cx},${cy},${dx},${dy}`);
              cx += dx; cy += dy;
            }
            if (line.length >= minLen) connections.push(line);
          }
        }
      return connections;
    },
    getBoardSize() { return BOARD_SIZE; },

    placeStone(x, y, owner, opts) {
      let success = false;
      setState(prev => {
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return prev;
        if (prev.board[x][y].stone || prev.board[x][y].tags.has('blocked')) return prev;
        const newBoard = deepCopyBoard(prev.board);
        newBoard[x][y].stone = {
          owner,
          visibleAs: owner,
          tags: new Set(opts?.tags),
          props: new Map(opts?.props),
          triggers: new Map(opts?.triggers),
        };
        success = true;
        // Check win
        const winner = checkWinner(newBoard, x, y, owner) ? owner : prev.winner;
        return { ...prev, board: newBoard, winner, gameOver: winner !== null };
      });
      return success;
    },
    removeStone(x, y, _reason) {
      let success = false;
      setState(prev => {
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return prev;
        if (!prev.board[x][y].stone) return prev;
        const newBoard = deepCopyBoard(prev.board);
        // Fire onRemoved trigger
        const trigger = newBoard[x][y].stone?.triggers.get('onRemoved');
        newBoard[x][y].stone = null;
        if (trigger) trigger(newBoard[x][y]);
        success = true;
        return { ...prev, board: newBoard };
      });
      return success;
    },
    moveStone(fx, fy, tx, ty) {
      let success = false;
      setState(prev => {
        if (!prev.board[fx]?.[fy]?.stone) return prev;
        if (prev.board[tx]?.[ty]?.stone) return prev;
        const newBoard = deepCopyBoard(prev.board);
        newBoard[tx][ty].stone = newBoard[fx][fy].stone;
        newBoard[fx][fy].stone = null;
        success = true;
        return { ...prev, board: newBoard };
      });
      return success;
    },
    transformStone(x, y, changes) {
      let success = false;
      setState(prev => {
        if (!prev.board[x]?.[y]?.stone) return prev;
        const newBoard = deepCopyBoard(prev.board);
        Object.assign(newBoard[x][y].stone!, changes);
        success = true;
        return { ...prev, board: newBoard };
      });
      return success;
    },
    modifyCell(x, y, changes) {
      setState(prev => {
        const newBoard = deepCopyBoard(prev.board);
        const cell = newBoard[x][y];
        if (changes.tags) changes.tags.forEach(t => cell.tags.add(t));
        if (changes.props) changes.props.forEach((v, k) => cell.props.set(k, v));
        if (changes.triggers) changes.triggers.forEach((v, k) => cell.triggers.set(k, v));
        return { ...prev, board: newBoard };
      });
    },
    modifyArea(cx, cy, range, shape, changes) {
      setState(prev => {
        const newBoard = deepCopyBoard(prev.board);
        for (let x = 0; x < BOARD_SIZE; x++)
          for (let y = 0; y < BOARD_SIZE; y++) {
            const dist = shape === 'diamond' ? Math.abs(x - cx) + Math.abs(y - cy) : Math.max(Math.abs(x - cx), Math.abs(y - cy));
            if (dist > range) continue;
            const cell = newBoard[x][y];
            changes.cellTags?.forEach(t => cell.tags.add(t));
            if (cell.stone) changes.stoneTags?.forEach(t => cell.stone!.tags.add(t));
          }
        return { ...prev, board: newBoard };
      });
    },

    addDelayedEffect({ delayTurns, effect, desc }) {
      setState(prev => ({
        ...prev,
        delayedEffects: [...prev.delayedEffects, {
          triggerTurn: prev.turnCount + delayTurns,
          effect,
          description: desc,
        }],
      }));
    },
    addOngoingEffect({ duration, onEachTurn, onExpire, desc }) {
      setState(prev => ({
        ...prev,
        ongoingEffects: [...prev.ongoingEffects, {
          remainingTurns: duration,
          onEachTurn,
          onExpire,
          description: desc,
        }],
      }));
    },
    registerGlobalTrigger(event, callback, _duration) {
      setState(prev => {
        const newTriggers = new Map(prev.globalTriggers);
        const existing = newTriggers.get(event) ?? [];
        newTriggers.set(event, [...existing, callback]);
        return { ...prev, globalTriggers: newTriggers };
      });
    },

    grantExtraTurn(n = 1) {
      setState(prev => ({
        ...prev,
        extraTurns: { ...prev.extraTurns, [prev.currentPlayer]: (prev.extraTurns[prev.currentPlayer] || 0) + n },
      }));
    },
    skipNextTurn(player) {
      setState(prev => ({
        ...prev,
        skipNextTurn: { ...prev.skipNextTurn, [player]: true },
      }));
    },
    forceNextMove(_player, _positions) {
      // V1: not fully implemented, stored as global prop
      setState(prev => {
        const newProps = new Map(prev.globalProps);
        newProps.set('forcedPositions', _positions);
        return { ...prev, globalProps: newProps };
      });
    },
    modifyWinCondition(_changes) {
      // V1: placeholder
    },

    getCurrentPlayer() { return getState().currentPlayer; },
    getOpponentPlayer() { const p = getState().currentPlayer; return p === 'black' ? 'white' : 'black'; },
    getTurnCount() { return getState().turnCount; },
    getHistory(n) { const h = getState().history; return n ? h.slice(-n) : h; },
    hasGlobalTag(tag) { return getState().globalTags.has(tag); },
    getGlobalProp(key) { return getState().globalProps.get(key); },

    showMessage,
    showEffect,
    requestPlayerChoice: requestChoice,
  };

  return api;
}
