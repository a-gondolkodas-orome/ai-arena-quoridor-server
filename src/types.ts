import * as t from "io-ts";

export type PlayerID = number;

export type PawnPos = {
  // If the player fell out, then their value will be (-1,-1)
  x: number;
  y: number;
};

export type WallPos = {
  x: number;
  y: number;
  isVertical: 0 | 1;
};

export type Wall = {
  x: number;
  y: number;
  isVertical: 0 | 1;
  who: PlayerID;
};

export type WallsByCell = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
  wallVertical: boolean;
  wallHorizontal: boolean;
}[][];

export type Tick = {
  id: number;
  currentPlayer: PlayerID;
  pawnPos: PawnPos[];
  walls: Wall[];
  wallsByCell: WallsByCell;
  ownedWalls: number[];
};

export type TickVisualizer = {
  currentPlayer: PlayerID;
  pawnPos: PawnPos[];
  walls: Wall[];
  ownedWalls: number[];
  action: UserStep;
  bots: (TickCommLog & { id: string; index: number; offline?: true })[]; // Only one bot is active at every tick, so only one bot is not offline at every tick.
};

export type TickCommLog = {
  received: { message: string; timestamp: number }[];
  sent: { message: string; timestamp: number }[];
  commandError?: string;
  botLog?: string;
};

export type UserStep =
  | { type: "move"; x: number; y: number }
  | { type: "place"; x: number; y: number; isVertical: 0 | 1 }
  | { type: "start" }
  | { type: "cannotmove" };

export type GameState = {
  numOfPlayers: number;
  maxTicks: number;
  boardSize: number;
  tick: Tick;
};

export const quoridorMapCodec = t.type({
  playerCount: t.number,
  maxTicks: t.number,
  boardSize: t.number,
  pawnPos: t.array(
    t.type({
      x: t.number,
      y: t.number,
    }),
  ),
  ownedWalls: t.number,
});

export type GameStateVis = {
  init: {
    players: { id: string; name: string }[];
    boardSize: number;
    numOfWalls: number;
  };
  ticks: TickVisualizer[];
};
