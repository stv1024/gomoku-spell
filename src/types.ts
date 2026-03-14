export interface Stone {
  owner: "black" | "white";
  visibleAs: "black" | "white" | null;
  tags: Set<string>;
  props: Map<string, any>;
  triggers: Map<string, Function>;
}

export interface RenderHint {
  backgroundColor?: string;
  borderColor?: string;
  icon?: string;
  opacity?: number;
  className?: string;
}

export interface Cell {
  x: number;
  y: number;
  stone: Stone | null;
  tags: Set<string>;
  props: Map<string, any>;
  triggers: Map<string, Function>;
}

export interface SkillDefinition {
  name: string;
  description: string;
  flavor: string;
  cost: number;
  cooldown: number;
  requiresTarget: boolean;
  execute: string;
  renderHints: Record<string, RenderHint>;
}

export interface DelayedEffect {
  triggerTurn: number;
  effect: Function;
  description: string;
}

export interface OngoingEffect {
  remainingTurns: number;
  onEachTurn: Function;
  onExpire: Function;
  description: string;
}

export type Player = "black" | "white";

export interface HistoryEntry {
  player: Player;
  x?: number;
  y?: number;
  skill?: string;
  snapshot: Cell[][];
}

export interface GameState {
  board: Cell[][];
  currentPlayer: Player;
  turnCount: number;
  history: HistoryEntry[];
  globalTags: Set<string>;
  globalProps: Map<string, any>;
  globalTriggers: Map<string, Function[]>;
  delayedEffects: DelayedEffect[];
  ongoingEffects: OngoingEffect[];
  energy: { black: number; white: number };
  skillCache: Map<string, SkillDefinition>;
  skillCooldowns: { black: Map<string, number>; white: Map<string, number> };
  winner: Player | null;
  gameOver: boolean;
  extraTurns: { black: number; white: number };
  skipNextTurn: { black: boolean; white: boolean };
}

export interface BoardAPI {
  // Spatial queries
  getCell(x: number, y: number): Cell | null;
  getStone(x: number, y: number): Stone | null;
  findCells(filter: (cell: Cell) => boolean): Cell[];
  getNeighbors(x: number, y: number, range?: number): Cell[];
  getLine(x: number, y: number, dir: [number, number], len: number): Cell[];
  getConnections(player: Player, minLen?: number): Cell[][];
  getBoardSize(): number;

  // Entity changes
  placeStone(x: number, y: number, owner: Player, opts?: Partial<Stone>): boolean;
  removeStone(x: number, y: number, reason?: string): boolean;
  moveStone(fx: number, fy: number, tx: number, ty: number): boolean;
  transformStone(x: number, y: number, changes: Partial<Stone>): boolean;
  modifyCell(x: number, y: number, changes: Partial<Pick<Cell, 'tags' | 'props' | 'triggers'>>): void;
  modifyArea(cx: number, cy: number, range: number, shape: 'square' | 'diamond', changes: { stoneTags?: string[]; cellTags?: string[] }): void;

  // Time control
  addDelayedEffect(opts: { delayTurns: number; effect: Function; desc: string }): void;
  addOngoingEffect(opts: { duration: number; onEachTurn: Function; onExpire: Function; desc: string }): void;
  registerGlobalTrigger(event: string, callback: Function, duration?: number): void;

  // Flow control
  grantExtraTurn(n?: number): void;
  skipNextTurn(player: Player): void;
  forceNextMove(player: Player, positions: [number, number][]): void;
  modifyWinCondition(changes: any): void;

  // Information
  getCurrentPlayer(): Player;
  getOpponentPlayer(): Player;
  getTurnCount(): number;
  getHistory(n?: number): HistoryEntry[];
  hasGlobalTag(tag: string): boolean;
  getGlobalProp(key: string): any;

  // UI
  showMessage(text: string): void;
  showEffect(x: number, y: number, type: string, opts?: any): void;
  requestPlayerChoice(player: Player, prompt: string, filter?: (cell: Cell) => boolean): Promise<[number, number]>;
}
