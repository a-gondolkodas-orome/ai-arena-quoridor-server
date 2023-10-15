import { GameState } from "./types";

const BOARD_SIZE = 9;

export const initStateFour: GameState = {
  numOfPlayers: 4,
  maxTicks: 200,
  boardSize: BOARD_SIZE,
  tick: {
    id: 0,
    currentPlayer: -1,
    pawnPos: [
      { x: 4, y: 0 },
      { x: 8, y: 4 },
      { x: 4, y: 8 },
      { x: 0, y: 4 },
    ],
    walls: [],
    ownedWalls: [5, 5, 5, 5],
    // First index is x, second is y
    wallsByCell: Array.from({ length: BOARD_SIZE }, (_, x) =>
      Object(
        Array.from({ length: BOARD_SIZE }, (_, y) => {
          const res = {
            top: false,
            right: false,
            bottom: false,
            left: false,
            wallVertical: false,
            wallHorizontal: false,
          };
          if (x === 0) res.left = true;
          if (x === BOARD_SIZE - 1) res.right = true;
          if (y === 0) res.top = true;
          if (y === BOARD_SIZE - 1) res.bottom = true;
          return res;
        }),
      ),
    ),
  },
};

export const initStateTwo: GameState = {
  numOfPlayers: 2,
  maxTicks: 100,
  boardSize: BOARD_SIZE,
  tick: {
    id: 0,
    currentPlayer: -1,
    pawnPos: [
      { x: 4, y: 0 },
      { x: 4, y: 8 },
    ],
    walls: [],
    ownedWalls: [10, 10],
    // First index is x, second is y
    wallsByCell: Array.from({ length: BOARD_SIZE }, (_, x) =>
      Object(
        Array.from({ length: BOARD_SIZE }, (_, y) => {
          const res = {
            top: false,
            right: false,
            bottom: false,
            left: false,
            wallVertical: false,
            wallHorizontal: false,
          };
          if (x === 0) res.left = true;
          if (x === BOARD_SIZE - 1) res.right = true;
          if (y === 0) res.top = true;
          if (y === BOARD_SIZE - 1) res.bottom = true;
          return res;
        }),
      ),
    ),
  },
};

export const botsTwo = [
  { id: "1234", name: "bot_a", runCommand: "./bots/test.out" },
  { id: "abcd", name: "bot_b", runCommand: "./bots/test.out" },
];
