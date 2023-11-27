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

export type TickCommLog = {
  received: { message: string; timestamp: number }[];
  sent: { message: string; timestamp: number }[];
  error?: string;
  botLog?: string;
};

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
  startingPlayer: t.number,
  pawnPos: t.array(
    t.type({
      x: t.number,
      y: t.number,
    }),
  ),
  ownedWalls: t.number,
});
