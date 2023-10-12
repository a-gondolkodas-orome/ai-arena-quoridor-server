import { Bot, BotPool } from "./BotWrapper";
import * as fs from "fs";
import {
  GameState,
  PlayerID,
  PawnPos,
  Wall,
  WallPos,
  TickVisualizer,
  UserStep,
  WallsByCell,
  TickCommLog,
  GameStateVis,
  quoridorMapCodec,
} from "./types";
import { botsTwo, initStateTwo } from "./initStates";
import { decodeJson } from "./codec";
import { matchConfigCodec } from "./common";
import * as t from "io-ts";

const scores = new Map<string, number>();
const tickLog: TickVisualizer[] = [];
let botCommLog: TickCommLog[] = [];

function resetBotCommLog(length: number) {
  botCommLog = [];
  for (let i = 0; i < length; ++i) botCommLog.push({ received: [], sent: [] });
}

function mapToGameState(map: t.TypeOf<typeof quoridorMapCodec>): GameState {
  return {
    numOfPlayers: map.playerCount,
    board: map.board,
    tick: {
      id: 0,
      currentPlayer: -1,
      pawnPos: map.pawnPos,
      walls: [],
      ownedWalls: new Array(map.playerCount).fill(map.ownedWalls),
      // First index is x, second is y
      wallsByCell: Array.from({ length: map.board.cols }, (_, x) =>
        Object(
          Array.from({ length: map.board.rows }, (_, y) => {
            const res = {
              top: false,
              right: false,
              bottom: false,
              left: false,
              wallVertical: false,
              wallHorizontal: false,
            };
            if (x === 0) res.left = true;
            if (x === map.board.cols - 1) res.right = true;
            if (y === 0) res.top = true;
            if (y === map.board.rows - 1) res.bottom = true;
            return res;
          }),
        ),
      ),
    },
  };
}

if (process.argv.length < 3) {
  console.warn("Running in test mode with default match config");
  makeMatch(initStateTwo, new BotPool(botsTwo)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  const matchConfig = decodeJson(
    matchConfigCodec,
    fs.readFileSync(process.argv[2], { encoding: "utf-8" }),
  );
  const map = decodeJson(quoridorMapCodec, fs.readFileSync(matchConfig.map, { encoding: "utf-8" }));
  const bots = new BotPool(matchConfig.bots);
  makeMatch(mapToGameState(map), bots).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function makeMatch(state: GameState, botPool: BotPool) {
  console.log("starting match at", new Date().toLocaleString());
  resetBotCommLog(botPool.bots.length);
  const workingBots = await testingBots(state, botPool);
  for (let i = 0; i < workingBots.length; i++) {
    const sendingData = startingPosToString(state, i);
    await sendMessage(workingBots[i], sendingData);
  }

  for (const bot of botPool.bots) {
    scores.set(bot.id, 0);
  }
  tickToVisualizer(botPool, state, [{ type: "start" }]); // Save init state for visualizer
  while (!getEndStatus(botPool, state)) {
    state.tick.id++;
    state.tick.currentPlayer = nextPlayer(state);
    const userSteps: UserStep[] = [];
    if (beforeCall(state)) {
      const sendingData = tickToString(state);
      await sendMessage(workingBots[state.tick.currentPlayer], sendingData);
      // User can move, call the bot
      const step = await receiveMessage(workingBots[state.tick.currentPlayer], 1);
      // Validate the user's input
      const validatedStep = validateStep(state, step.data);
      if ("error" in validatedStep) {
        // User's input is invalid, log the error and do a default move
        setCommandError(botPool.bots[state.tick.currentPlayer], validatedStep.error);
        userSteps.push(defaultUserStep(state));
      } else {
        // User's input is valid
        userSteps.push(validatedStep);
      }
    } else {
      // User cannot move, do not call the bot, just skip the turn and the player will lose.
      userSteps.push({ type: "cannotmove" });
    }
    // Update the state
    state = updateState(state, userSteps);
    // Save for visualizer
    tickToVisualizer(botPool, state, userSteps);
    console.log(visualizeBoard(state));
  }
  console.log(`${formatTime()} match finished`);
  stateToVisualizer(botPool, state);
  botPool.stopAll();
}

/*
  If the user cannot move, do not call the bot, just skip the turn and the player will lose.
*/
function beforeCall(state: GameState): boolean {
  if (state.numOfPlayers === 4 && possibleMoves(state).length === 0 && randomWall(state) === null) {
    currentPlayerOutOfGame(state);
    return false;
  }
  return true;
}

function updateState(state: GameState, userSteps: UserStep[]): GameState {
  const step = userSteps[0]; // There is always only one step
  if (step.type === "move") {
    moveWithPawn(state, { x: step.x, y: step.y });
  } else if (step.type === "place") {
    placeWall(state, { x: step.x, y: step.y, isVertical: step.isVertical });
  }
  return state;
}

/*
  Checks if some has reached the opposite side (Note: there are always at least two players alive, so we don't have to check that one)
  It also updates the scores.
*/
function getEndStatus(botPool: BotPool, state: GameState): boolean {
  if (state.numOfPlayers === 2) {
    if (state.tick.id >= 50) {
      const distances = getPlayersDistanceFromGoal(state).map((x) => 1 / x);
      const sumDistancePower = distances[0] ** 5 + distances[1] ** 5;
      const tieFactor = 0.33;
      for (let i = 0; i < 2; i++) {
        scores.set(botPool.bots[i].id, (tieFactor * distances[i] ** 5) / sumDistancePower);
      }
      return true;
    }
    if (state.tick.pawnPos[0].y === state.board.rows - 1) {
      scores.set(botPool.bots[0].id, 1);
      return true;
    }
    if (state.tick.pawnPos[1].y === 0) {
      scores.set(botPool.bots[1].id, 1);
      return true;
    }
    return false;
  } else if (state.numOfPlayers === 4) {
    if (state.tick.id >= 30) {
      const distances = getPlayersDistanceFromGoal(state).map((x) => 1 / x);
      const sumDistancePower = distances.map((x) => x ** 5).reduce((a, b) => a + b, 0);
      const tieFactor = 0.33;
      for (let i = 0; i < 4; i++) {
        scores.set(i.toString(), (tieFactor * distances[i] ** 5) / sumDistancePower);
      }
      return true;
    }
    if (state.tick.pawnPos[0].y === state.board.rows - 1) {
      scores.set(botPool.bots[0].id, 1);
      return true;
    }
    if (state.tick.pawnPos[1].x === 0) {
      scores.set(botPool.bots[1].id, 1);
      return true;
    }
    if (state.tick.pawnPos[2].y === 0) {
      scores.set(botPool.bots[2].id, 1);
      return true;
    }
    if (state.tick.pawnPos[3].x === state.board.cols - 1) {
      scores.set(botPool.bots[3].id, 1);
      return true;
    }
    return false;
  }

  throw new Error(
    `Internal game server error! Number of players can be 2 or 4, but it was ${state.numOfPlayers}.`,
  );
}

/*
  Calculates the playerID of the next player
*/
function nextPlayer(state: GameState): PlayerID {
  let nextPlayer = 0;
  for (
    let i = state.tick.currentPlayer + 1;
    i <= state.tick.currentPlayer + state.numOfPlayers;
    i++
  ) {
    nextPlayer = i % state.numOfPlayers;
    // Is the player alive?
    if (state.tick.pawnPos[nextPlayer].x !== -1) break;
  }
  if (nextPlayer === state.tick.currentPlayer) {
    throw Error("Internal game server error! The same player comes again.");
  }
  return nextPlayer;
}

/*
  If the bot's step was invalid, then do a random move, since it obligatory to do a step. If we cannot move with our pawn, we will place a wall. If we can't even place a wall, then the player is out of the game.
*/
function defaultUserStep(state: GameState): UserStep {
  // check if we can move in any direction: there is no walls in the way and there are no two pawn in that direction
  const moves = possibleMoves(state);
  if (moves.length > 0) {
    // we can move, so we will move
    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    const x = randomMove.x;
    const y = randomMove.y;
    return { type: "move", x, y };
  } else {
    // we can't move, so we will place a wall, if we can
    const wallPos = randomWall(state);
    if (wallPos !== null) {
      return { type: "place", ...wallPos };
    } else {
      // we can't place a wall, so we cannot do anything. It's an error, because it is checked at the beginning of the tick
      throw Error(
        "Internal game server error! The current player cannot do anything, but the server thought he could.",
      );
    }
  }
}

function moveWithPawn(state: GameState, move: PawnPos) {
  state.tick.pawnPos[state.tick.currentPlayer] = move;
}

function currentPlayerOutOfGame(state: GameState) {
  state.tick.pawnPos[state.tick.currentPlayer] = { x: -1, y: -1 };
}

function placeWall(state: GameState, wall: WallPos) {
  updateWallsByCell(state.tick.wallsByCell, wall);
  state.tick.ownedWalls[state.tick.currentPlayer]--;
  state.tick.walls.push({ ...wall, who: state.tick.currentPlayer });
}

function updateWallsByCell(wallsByCell: WallsByCell, wall: WallPos) {
  if (wall.isVertical === 1) {
    wallsByCell[wall.x][wall.y].wallVertical = true;
    wallsByCell[wall.x][wall.y].right = true;
    wallsByCell[wall.x][wall.y + 1].right = true;
    wallsByCell[wall.x + 1][wall.y].left = true;
    wallsByCell[wall.x + 1][wall.y + 1].left = true;
  } else {
    wallsByCell[wall.x][wall.y].wallHorizontal = true;
    wallsByCell[wall.x][wall.y].bottom = true;
    wallsByCell[wall.x + 1][wall.y].bottom = true;
    wallsByCell[wall.x][wall.y + 1].top = true;
    wallsByCell[wall.x + 1][wall.y + 1].top = true;
  }
}

/*
  Calculates all possible moves of pawn for the current player. Returns an array of all possible positions.
*/
function possibleMoves(state: GameState): PawnPos[] {
  const moves: PawnPos[] = [];
  const x = state.tick.pawnPos[state.tick.currentPlayer].x;
  const y = state.tick.pawnPos[state.tick.currentPlayer].y;
  const walls = state.tick.wallsByCell;
  // check if we can move in any direction: there is no walls in the way and there are no two pawn in that direction
  // check up
  if (!walls[x][y].top) {
    if (getPlayerByCell(state, x, y - 1) === null) {
      // There is no pawn above him, so we can move there
      moves.push({ x: x, y: y - 1 });
    } else if (!walls[x][y - 1].top) {
      // There is a pawn above him, but there is no wall above him, so we can jump over him, if there is no other pawn above him
      if (getPlayerByCell(state, x, y - 2) === null) {
        moves.push({ x: x, y: y - 2 });
      }
    } else {
      // There is a pawn above him, but there is a wall above that. We can jump over him to left or right if there is no wall and no pawn there
      if (!walls[x][y - 1].left && getPlayerByCell(state, x - 1, y - 1) === null) {
        moves.push({ x: x - 1, y: y - 1 });
      }
      if (!walls[x][y - 1].right && getPlayerByCell(state, x + 1, y - 1) === null) {
        moves.push({ x: x + 1, y: y - 1 });
      }
    }
  }
  // check down
  if (!walls[x][y].bottom) {
    if (getPlayerByCell(state, x, y + 1) === null) {
      // There is no pawn below him, so we can move there
      moves.push({ x: x, y: y + 1 });
    } else if (!walls[x][y + 1].bottom) {
      // There is a pawn below him, but there is no wall below him, so we can jump over him, if there is no other pawn below him
      if (getPlayerByCell(state, x, y + 2) === null) {
        moves.push({ x: x, y: y + 2 });
      }
    } else {
      // There is a pawn below him, but there is a wall below that. We can jump over him to left or right if there is no wall and no pawn there
      if (!walls[x][y + 1].left && getPlayerByCell(state, x - 1, y + 1) === null) {
        moves.push({ x: x - 1, y: y + 1 });
      }
      if (!walls[x][y + 1].right && getPlayerByCell(state, x + 1, y + 1) === null) {
        moves.push({ x: x + 1, y: y + 1 });
      }
    }
  }
  // check left
  if (!walls[x][y].left) {
    if (getPlayerByCell(state, x - 1, y) === null) {
      // There is no pawn left of him, so we can move there
      moves.push({ x: x - 1, y: y });
    } else if (!walls[x - 1][y].left) {
      // There is a pawn left of him, but there is no wall left of him, so we can jump over him, if there is no other pawn left of him
      if (getPlayerByCell(state, x - 2, y) === null) {
        moves.push({ x: x - 2, y: y });
      }
    } else {
      // There is a pawn left of him, but there is a wall left of that. We can jump over him to up or down if there is no wall and no pawn there
      if (!walls[x - 1][y].top && getPlayerByCell(state, x - 1, y - 1) === null) {
        moves.push({ x: x - 1, y: y - 1 });
      }
      if (!walls[x - 1][y].bottom && getPlayerByCell(state, x - 1, y + 1) === null) {
        moves.push({ x: x - 1, y: y + 1 });
      }
    }
  }
  // check right
  if (!walls[x][y].right) {
    if (getPlayerByCell(state, x + 1, y) === null) {
      // There is no pawn right of him, so we can move there
      moves.push({ x: x + 1, y: y });
    } else if (!walls[x + 1][y].right) {
      // There is a pawn right of him, but there is no wall right of him, so we can jump over him, if there is no other pawn right of him
      if (getPlayerByCell(state, x + 2, y) === null) {
        moves.push({ x: x + 2, y: y });
      }
    } else {
      // There is a pawn right of him, but there is a wall right of that. We can jump over him to up or down if there is no wall and no pawn there
      if (!walls[x + 1][y].top && getPlayerByCell(state, x + 1, y - 1) === null) {
        moves.push({ x: x + 1, y: y - 1 });
      }
      if (!walls[x + 1][y].bottom && getPlayerByCell(state, x + 1, y + 1) === null) {
        moves.push({ x: x + 1, y: y + 1 });
      }
    }
  }
  return moves;
}

function wallIsValid(state: GameState, wall: Wall): { result: boolean; reason?: string } {
  // Player does not have enough walls
  if (state.tick.ownedWalls[state.tick.currentPlayer] === 0) {
    return { result: false, reason: "Player does not have enough walls." };
  }

  // Is wall out of bounds?
  if (
    wall.x < 0 ||
    wall.x >= state.board.cols - 1 ||
    wall.y < 0 ||
    wall.y >= state.board.rows - 1
  ) {
    return { result: false, reason: "Wall is out of bounds." };
  }

  // The new wall is horizontal and intersects a previous horizontal wall
  if (
    wall.isVertical === 0 &&
    (state.tick.wallsByCell[wall.x][wall.y].bottom ||
      state.tick.wallsByCell[wall.x + 1][wall.y].bottom)
  ) {
    return {
      result: false,
      reason: "The new (horizontal) wall intersects a previous (horizontal) wall.",
    };
  }
  // The new wall is vertical and intersects a previous vertical wall
  if (
    wall.isVertical === 1 &&
    (state.tick.wallsByCell[wall.x][wall.y].right ||
      state.tick.wallsByCell[wall.x][wall.y + 1].right)
  ) {
    return {
      result: false,
      reason: "The new (vertical) wall intersects a previous (vertical) wall.",
    };
  }
  // The new wall is horizontal and intersects a previous vertical wall
  if (wall.isVertical === 0 && state.tick.wallsByCell[wall.x][wall.y].wallVertical) {
    return {
      result: false,
      reason: "The new (horizontal) wall intersects a previous (vertical) wall.",
    };
  }
  // The new wall is vertical and intersects a previous horizontal wall
  if (wall.isVertical === 1 && state.tick.wallsByCell[wall.x][wall.y].wallHorizontal) {
    return {
      result: false,
      reason: "The new (vertical) wall intersects a previous (horizontal) wall.",
    };
  }

  const newWallsByCell = state.tick.wallsByCell.map((row) => row.map((cell) => ({ ...cell })));
  updateWallsByCell(newWallsByCell, wall);
  // Does the new wall cuts off the the only remaining path of a pawn to the side of the board it must reach?
  // Check it with BFS for all players.
  if (
    bfsForPlayers(
      state.board,
      newWallsByCell,
      state.tick.pawnPos[0].x,
      state.tick.pawnPos[0].y,
      (x, y) => y === state.board.rows - 1,
    ) === -1
  ) {
    return {
      result: false,
      reason:
        "The new wall cuts off the the only remaining path of pawn starting from top reaching the bottom side.",
    };
  }
  if (
    bfsForPlayers(
      state.board,
      newWallsByCell,
      state.tick.pawnPos[1].x,
      state.tick.pawnPos[1].y,
      (x, y) => x === 0,
    ) === -1
  ) {
    return {
      result: false,
      reason:
        "The new wall cuts off the the only remaining path of pawn starting from right reaching the left side.",
    };
  }
  if (state.numOfPlayers === 4) {
    if (
      bfsForPlayers(
        state.board,
        newWallsByCell,
        state.tick.pawnPos[2].x,
        state.tick.pawnPos[2].y,
        (x, y) => y === 0,
      ) === -1
    ) {
      return {
        result: false,
        reason:
          "The new wall cuts off the the only remaining path of pawn starting from bottom reaching the top side.",
      };
    }
    if (
      bfsForPlayers(
        state.board,
        newWallsByCell,
        state.tick.pawnPos[3].x,
        state.tick.pawnPos[3].y,
        (x, y) => x === state.board.cols - 1,
      ) === -1
    ) {
      return {
        result: false,
        reason:
          "The new wall cuts off the the only remaining path of pawn starting from left reaching the right side.",
      };
    }
  }

  return { result: true };
}

/*
  Calculates the length of the shortest path from the player to the goal. If there is no path, it returns -1.
*/
function bfsForPlayers(
  board: { cols: number; rows: number },
  wallsByCell: WallsByCell,
  starting_x: number,
  starting_y: number,
  goalReached: (x: number, y: number) => boolean,
): number {
  const visited = Array(board.cols)
    .fill(0)
    .map(() => new Array(board.rows).fill(false));
  const currentQueue = new Array<[number, number]>();
  let nextQueue = new Array<[number, number]>();
  currentQueue.push([starting_x, starting_y]);
  visited[starting_x][starting_y] = true;
  let depth = 0;
  const maxDepth = board.cols * board.rows;

  while (currentQueue.length > 0) {
    if (depth > maxDepth) {
      throw new Error("Internal Game Server Error! Max depth is reached in BFS.");
    }

    while (currentQueue.length > 0) {
      const [x, y] = currentQueue.shift();
      // Check if we reached our goal
      if (goalReached(x, y)) {
        return depth;
      }
      // Check if we can move to the left
      if (!wallsByCell[x][y].left && !visited[x - 1][y]) {
        nextQueue.push([x - 1, y]);
        visited[x - 1][y] = true;
      }
      // Check if we can move to the right
      if (!wallsByCell[x][y].right && !visited[x + 1][y]) {
        nextQueue.push([x + 1, y]);
        visited[x + 1][y] = true;
      }
      // Check if we can move to the top
      if (!wallsByCell[x][y].top && !visited[x][y - 1]) {
        nextQueue.push([x, y - 1]);
        visited[x][y - 1] = true;
      }
      // Check if we can move to the bottom
      if (!wallsByCell[x][y].bottom && !visited[x][y + 1]) {
        nextQueue.push([x, y + 1]);
        visited[x][y + 1] = true;
      }
    }
    depth++;
    nextQueue.forEach((val) => currentQueue.push(val));
    nextQueue = new Array<[number, number]>();
  }
  return -1;
}

function getPlayersDistanceFromGoal(state: GameState): number[] {
  const distances = new Array<number>(state.numOfPlayers);
  distances[0] = bfsForPlayers(
    state.board,
    state.tick.wallsByCell,
    state.tick.pawnPos[0].x,
    state.tick.pawnPos[0].y,
    (x, y) => y === state.board.rows - 1,
  );
  distances[1] = bfsForPlayers(
    state.board,
    state.tick.wallsByCell,
    state.tick.pawnPos[1].x,
    state.tick.pawnPos[1].y,
    (x, y) => x === 0,
  );
  if (state.numOfPlayers === 4) {
    distances[2] = bfsForPlayers(
      state.board,
      state.tick.wallsByCell,
      state.tick.pawnPos[2].x,
      state.tick.pawnPos[2].y,
      (x, y) => y === 0,
    );
    distances[3] = bfsForPlayers(
      state.board,
      state.tick.wallsByCell,
      state.tick.pawnPos[3].x,
      state.tick.pawnPos[3].y,
      (x, y) => x === state.board.cols - 1,
    );
  }
  return distances;
}

function getPlayerByCell(state: GameState, x: number, y: number): number | null {
  for (let i = 0; i < state.numOfPlayers; i++) {
    if (state.tick.pawnPos[i].x === x && state.tick.pawnPos[i].y === y) {
      return i;
    }
  }
  return null;
}

/*
  Returns a random wall, where . If it is not possible to place a wall, then returns null.
*/
function randomWall(state: GameState): WallPos | null {
  for (let i = 0; i < 200; i++) {
    // TODO: this solution does not work always, but at least it is fast
    const [x, y] = [
      Math.floor(Math.random() * (state.board.cols - 1)),
      Math.floor(Math.random() * (state.board.rows - 1)),
    ];
    const isVertical = Math.random() < 0.5 ? 0 : 1;
    const wall = wallIsValid(state, { x, y, isVertical, who: state.tick.currentPlayer });
    if (wall.result) {
      return { x, y, isVertical };
    }
  }
  return null;
}

async function testingBots(state: GameState, bots: BotPool): Promise<Bot[]> {
  const workingBots = [];
  for (const bot of bots.bots) {
    await sendMessage(bot, "START");
    //if (bot.error) continue;
    if ((await receiveMessage(bot, 1)).data === "OK") {
      workingBots.push(bot);
    }
  }
  return workingBots;
}

function startingPosToString(state: GameState, player: PlayerID): string {
  let result = `${state.numOfPlayers.toString()}\n${player.toString()}\n${state.board.cols.toString()} ${state.board.rows.toString()}`;

  for (let i = 0; i < state.numOfPlayers; i++) {
    result += `\n${state.tick.pawnPos[i].x} ${state.tick.pawnPos[i].y} ${state.tick.ownedWalls[i]}`;
  }
  return result;
}

function tickToVisualizer(botPool: BotPool, state: GameState, userSteps: UserStep[]): void {
  tickLog.push({
    currentPlayer: state.tick.currentPlayer,
    pawnPos: [...state.tick.pawnPos],
    walls: [...state.tick.walls],
    ownedWalls: [...state.tick.ownedWalls],
    action: userSteps[0], // There is only one player now
    bots: botPool.bots.map((bot, index) => ({
      id: bot.id,
      index: bot.index,
      ...botCommLog[index],
    })),
  });
  resetBotCommLog(botPool.bots.length);
}

function stateToVisualizer(botPool: BotPool, state: GameState): void {
  const stateVis: GameStateVis = {
    init: {
      players: botPool.bots.map((bot) => ({
        id: bot.id,
        index: bot.index,
        name: bot.name,
      })),
      board: state.board,
      numOfWalls: state.tick.ownedWalls.reduce((a, b) => a + b, 0),
    },
    ticks: tickLog,
  };
  fs.writeFileSync("match.log", JSON.stringify(stateVis, undefined, 2), "utf-8");
  fs.writeFileSync(
    "score.json",
    JSON.stringify(Object.fromEntries(scores.entries()), undefined, 2),
    "utf-8",
  );
}

function validateStep(state: GameState, input: string): UserStep | { error: string } {
  let inputArray = [];
  try {
    inputArray = input.split(" ").map((x) => myParseInt(x, { throwError: true }));
  } catch (e) {
    return { error: "Invalid input! You should send two or three numbers separated by spaces." };
  }
  if (inputArray.length !== 2 && inputArray.length !== 3) {
    return { error: "Invalid input! You should send two or three numbers separated by spaces." };
  }
  if (inputArray.length === 2) {
    // Move
    const [x, y] = inputArray;
    if (!(x >= 0 && x < state.board.cols && y >= 0 && y < state.board.rows)) {
      return { error: "Invalid input! The two numbers are not in the correct interavals." };
    }
    if (possibleMoves(state).find((move) => move.x === x && move.y === y) === undefined) {
      return { error: "Invalid input! You can't move to this position." };
    }
    return { type: "move", x, y };
  }
  if (inputArray.length === 3) {
    // Place wall
    const [x, y, isVertical] = inputArray;
    if (
      !(
        x >= 0 &&
        x < state.board.cols - 1 &&
        y >= 0 &&
        y < state.board.rows - 1 &&
        (isVertical === 0 || isVertical === 1)
      )
    ) {
      return { error: "Invalid input! The three numbers are not in the correct interavals." };
    }
    const wallIsValidOutput = wallIsValid(state, {
      x,
      y,
      isVertical,
      who: state.tick.currentPlayer,
    });
    if (wallIsValidOutput.result === false) {
      return { error: "Invalid input! Reason: " + wallIsValidOutput.reason };
    }
    return { type: "place", x, y, isVertical };
  }
}

function tickToString(state: GameState): string {
  let result = "";
  result += state.tick.id.toString() + "\n";
  for (let i = 0; i < state.numOfPlayers; i++) {
    result += `${state.tick.pawnPos[i].x} ${state.tick.pawnPos[i].y} ${state.tick.ownedWalls[i]}\n`;
  }
  result += state.tick.walls.length.toString() + "\n";
  for (let i = 0; i < state.tick.walls.length; i++) {
    result += `${state.tick.walls[i].x} ${state.tick.walls[i].y} ${state.tick.walls[i].isVertical} ${state.tick.walls[i].who}\n`;
  }
  return result;
}

async function sendMessage(bot: Bot, message: string) {
  await bot.send(message);
  const now = new Date();
  console.log(`${formatTime(now)}: ${bot.id} (#${bot.id}) received\n${message}`);
  botCommLog[bot.index].received.push({ message, timestamp: now.getTime() });
}

async function receiveMessage(bot: Bot, numberOfLines?: number) {
  const message = await bot.ask(numberOfLines);
  const now = new Date();
  console.log(`${formatTime(now)}: ${bot.id} sent\n${message.data}`);
  if (message.data !== null) {
    botCommLog[bot.index].sent.push({ message: message.data, timestamp: now.getTime() });
  }
  return message;
}

function setCommandError(bot: Bot, error: string) {
  botCommLog[bot.index].commandError = error;
  console.log(`${bot.id} (#${bot.id}) command error: ${error}`);
}

function myParseInt(
  value: string,
  { min = -Infinity, max = Infinity, defaultValue = 0, throwError = false },
): number {
  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed >= min && parsed <= max) {
    return parsed;
  }
  if (throwError) {
    throw new Error(`Invalid number: ${value}`);
  }
  return defaultValue;
}

function formatTime(date: Date = new Date()) {
  return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}.${date.getMilliseconds()}`;
}

function visualizeBoard(state: GameState): string {
  const board = state.board;
  const walls = state.tick.wallsByCell;
  const ownedWalls = state.tick.ownedWalls;
  const currentPlayer = 0;
  const boardString = Array.from({ length: state.board.cols }, () =>
    Object(Array.from({ length: state.board.rows }, () => ["+", " ", " ", "."])),
  );
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (walls[x][y].top) {
        boardString[x][y][1] = "-";
      }
      if (walls[x][y].left) {
        boardString[x][y][2] = "|";
      }
      const player = getPlayerByCell(state, x, y);
      if (player !== null) {
        boardString[x][y][3] = player.toString();
      }
    }
  }
  let res = "";
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      res += boardString[x][y][0] + boardString[x][y][1];
    }
    res += "+\n";
    for (let x = 0; x < board.cols; x++) {
      res += boardString[x][y][2] + boardString[x][y][3];
    }
    res += "|\n";
  }
  for (let x = 0; x < board.cols; x++) {
    res += "+-";
  }
  res += "+\n";
  res += "Current player: " + currentPlayer.toString() + "\n";
  res += "Owned walls: " + ownedWalls[currentPlayer].toString();
  return res;
}
