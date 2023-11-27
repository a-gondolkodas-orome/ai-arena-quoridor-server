import { Bot, BotPool } from "./BotWrapper";
import * as fs from "fs";
import {
  GameState,
  PlayerID,
  PawnPos,
  Wall,
  WallPos,
  WallsByCell,
  TickCommLog,
  quoridorMapCodec,
} from "./types";
import { botsTwo, initStateTwo } from "./initStates";
import { decodeJson } from "./codec";
import { matchConfigCodec } from "./common";
import * as t from "io-ts";
import { notNull } from "./utils";
import { Match, Tick } from "./protobuf/match_log";

type Action = Tick["action"];

const BOT_LOG__MAX_LENGTH = 2000;

const scores = new Map<string, number>();
const tickLog: Tick[] = [];
let botCommLog: TickCommLog[] = [];

function resetBotCommLog(length: number) {
  botCommLog = [];
  for (let i = 0; i < length; ++i) botCommLog.push({ received: [], sent: [] });
}

function mapToGameState(map: t.TypeOf<typeof quoridorMapCodec>): GameState {
  return {
    numOfPlayers: map.playerCount,
    maxTicks: map.maxTicks,
    boardSize: map.boardSize,
    tick: {
      id: 0,
      currentPlayer: map.startingPlayer - 1,
      pawnPos: map.pawnPos,
      walls: [],
      ownedWalls: new Array(map.playerCount).fill(map.ownedWalls),
      // First index is x, second is y
      wallsByCell: Array.from({ length: map.boardSize }, (_, x) =>
        Object(
          Array.from({ length: map.boardSize }, (_, y) => {
            const res = {
              top: false,
              right: false,
              bottom: false,
              left: false,
              wallVertical: false,
              wallHorizontal: false,
            };
            if (x === 0) res.left = true;
            if (x === map.boardSize - 1) res.right = true;
            if (y === 0) res.top = true;
            if (y === map.boardSize - 1) res.bottom = true;
            return res;
          }),
        ),
      ),
    },
  };
}

if (process.argv.length < 3) {
  console.warn("Running in test mode with default match config");
  makeMatch(new BotPool(botsTwo), initStateTwo).catch((error) => {
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
  makeMatch(bots, mapToGameState(map)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function makeMatch(botPool: BotPool, state: GameState) {
  console.log("starting match at", new Date().toLocaleString());
  resetBotCommLog(botPool.bots.length);
  for (const [i, bot] of botPool.bots.entries()) {
    scores.set(bot.id, 0);
    const sendingData = startingPosToString(state, i);
    await sendMessage(bot, sendingData);
  }

  tickToVisualizer(botPool, state, [{ oneofKind: "start", start: true }]); // Save init state for visualizer
  while (!getEndStatus(botPool, state)) {
    state.tick.id++;
    state.tick.currentPlayer = nextPlayer(state);
    const userSteps = await getUserSteps(botPool, state);
    // Update the state
    state = updateState(state, userSteps);
    // Save for visualizer
    tickToVisualizer(botPool, state, userSteps);
    console.log(visualizeBoard(state));
  }
  for (let i = 0; i < state.numOfPlayers; ++i) {
    if (state.tick.pawnPos[i].x !== -1 && !botPool.bots[i].error) {
      await sendMessage(botPool.bots[i], "-1\n");
    }
  }
  console.log(`${formatTime()} match finished`);
  stateToVisualizer(botPool, state);
  botPool.stopAll();
}

async function getUserSteps(botPool: BotPool, state: GameState): Promise<Action[]> {
  const currentBot = botPool.bots[state.tick.currentPlayer];
  if (!canCurrentPlayerMove(state)) {
    // User cannot move, send -1, skip the turn and the player will lose.
    await sendMessage(currentBot, "-1\n");
    return [{ oneofKind: "stuck", stuck: true }];
  }
  if (currentBot.error) {
    console.log(
      `${formatTime()}: Bot ${currentBot.name} (index: #${currentBot.index}, id: ${
        currentBot.id
      }) is in error state, skipping`,
    );
    return [defaultUserStep(state)];
  }
  await sendMessage(currentBot, tickToString(state));
  // User can move, call the bot
  const step = await receiveMessage(currentBot, 1);

  let botLog = currentBot.std_err.join("\n");
  currentBot.std_err = [];
  if (botLog.length > BOT_LOG__MAX_LENGTH) {
    botLog = botLog.substring(0, BOT_LOG__MAX_LENGTH) + "...\n[[bot log trimmed to 2KB]]";
  }
  const commLog = botCommLog[currentBot.index];
  commLog.botLog = botLog || undefined;

  if (step.error) {
    setBotError(currentBot, step.error.message);
    return [defaultUserStep(state)];
  }
  // Validate the user's input
  const validatedStep = validateStep(state, step.data);
  if ("error" in validatedStep) {
    // User's input is invalid, log the error and do a default move
    setBotError(currentBot, validatedStep.error);
    return [defaultUserStep(state)];
  }
  return [validatedStep];
}

/*
  If the user cannot move, do not call the bot, just skip the turn and the player will lose.
*/
function canCurrentPlayerMove(state: GameState): boolean {
  if (state.numOfPlayers === 4 && possibleMoves(state).length === 0 && randomWall(state) === null) {
    currentPlayerOutOfGame(state);
    return false;
  }
  return true;
}

function updateState(state: GameState, userSteps: Action[]): GameState {
  const step = userSteps[0]; // There is always only one step
  if (step.oneofKind === "move") {
    moveWithPawn(state, { x: step.move.x, y: step.move.y });
  } else if (step.oneofKind === "place") {
    placeWall(state, {
      x: step.place.x,
      y: step.place.y,
      isVertical: step.place.isVertical as 0 | 1,
    });
  }
  return state;
}

/*
  Checks if some has reached the opposite side (Note: there are always at least two players alive, so we don't have to check that one)
  It also updates the scores.
*/
function getEndStatus(botPool: BotPool, state: GameState): boolean {
  const distances = getPlayersDistanceFromGoal(state);
  if (
    state.tick.id >= state.maxTicks ||
    distances.find((distance) => distance === 0) !== undefined
  ) {
    const minDistance = Math.min(...distances);
    const minDistanceBotCount = distances.reduce(
      (count, distance) => count + (distance === minDistance ? 1 : 0),
      0,
    );
    for (let i = 0; i < state.numOfPlayers; i++) {
      scores.set(botPool.bots[i].id, distances[i] === minDistance ? 1 / minDistanceBotCount : 0);
    }
    return true;
  }
  return false;
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
function defaultUserStep(state: GameState): Action {
  // check if we can move in any direction: there is no walls in the way and there are no two pawn in that direction
  const moves = possibleMoves(state);
  if (moves.length > 0) {
    // we can move, so we will move
    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    const x = randomMove.x;
    const y = randomMove.y;
    return { oneofKind: "move", move: { x, y } };
  } else {
    // we can't move, so we will place a wall, if we can
    const wallPos = randomWall(state);
    if (wallPos !== null) {
      return { oneofKind: "place", place: wallPos };
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
  if (wall.x < 0 || wall.x >= state.boardSize - 1 || wall.y < 0 || wall.y >= state.boardSize - 1) {
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
  // Does the new wall cut off the only remaining path of a pawn to the side of the board it must reach?
  // Check it with BFS for all players.
  if (
    state.tick.pawnPos[0].x >= 0 &&
    bfsForPlayers(
      state.boardSize,
      newWallsByCell,
      state.tick.pawnPos[0].x,
      state.tick.pawnPos[0].y,
      (x, y) => y === state.boardSize - 1,
    ) === -1
  ) {
    return {
      result: false,
      reason:
        "The new wall cuts off the the only remaining path of pawn starting from top reaching the bottom side.",
    };
  }
  if (
    state.tick.pawnPos[1].x >= 0 &&
    bfsForPlayers(
      state.boardSize,
      newWallsByCell,
      state.tick.pawnPos[1].x,
      state.tick.pawnPos[1].y,
      (x, y) => (state.numOfPlayers === 4 ? x === 0 : y === 0),
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
      state.tick.pawnPos[2].x >= 0 &&
      bfsForPlayers(
        state.boardSize,
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
      state.tick.pawnPos[3].x >= 0 &&
      bfsForPlayers(
        state.boardSize,
        newWallsByCell,
        state.tick.pawnPos[3].x,
        state.tick.pawnPos[3].y,
        (x, y) => x === state.boardSize - 1,
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
  boardSize: number,
  wallsByCell: WallsByCell,
  starting_x: number,
  starting_y: number,
  goalReached: (x: number, y: number) => boolean,
): number {
  if (starting_x < 0) return -1;
  const visited = Array(boardSize)
    .fill(0)
    .map(() => new Array(boardSize).fill(false));
  let currentQueue = new Array<[number, number]>();
  let nextQueue = new Array<[number, number]>();
  currentQueue.push([starting_x, starting_y]);
  visited[starting_x][starting_y] = true;
  let depth = 0;
  const maxDepth = boardSize * boardSize;

  while (currentQueue.length > 0) {
    if (depth > maxDepth) {
      throw new Error("Internal Game Server Error! Max depth is reached in BFS.");
    }

    while (currentQueue.length > 0) {
      const [x, y] = notNull(currentQueue.shift());
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
    currentQueue = nextQueue;
    nextQueue = new Array<[number, number]>();
  }
  return -1;
}

function getPlayersDistanceFromGoal(state: GameState): number[] {
  const distances = new Array<number>(state.numOfPlayers);
  distances[0] = bfsForPlayers(
    state.boardSize,
    state.tick.wallsByCell,
    state.tick.pawnPos[0].x,
    state.tick.pawnPos[0].y,
    (x, y) => y === state.boardSize - 1,
  );
  distances[1] = bfsForPlayers(
    state.boardSize,
    state.tick.wallsByCell,
    state.tick.pawnPos[1].x,
    state.tick.pawnPos[1].y,
    (x, y) => (state.numOfPlayers === 4 ? x === 0 : y === 0),
  );
  if (state.numOfPlayers === 4) {
    distances[2] = bfsForPlayers(
      state.boardSize,
      state.tick.wallsByCell,
      state.tick.pawnPos[2].x,
      state.tick.pawnPos[2].y,
      (x, y) => y === 0,
    );
    distances[3] = bfsForPlayers(
      state.boardSize,
      state.tick.wallsByCell,
      state.tick.pawnPos[3].x,
      state.tick.pawnPos[3].y,
      (x, y) => x === state.boardSize - 1,
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
      Math.floor(Math.random() * (state.boardSize - 1)),
      Math.floor(Math.random() * (state.boardSize - 1)),
    ];
    const isVertical = Math.random() < 0.5 ? 0 : 1;
    const wall = wallIsValid(state, { x, y, isVertical, who: state.tick.currentPlayer });
    if (wall.result) {
      return { x, y, isVertical };
    }
  }
  return null;
}

function startingPosToString(state: GameState, player: PlayerID): string {
  let result = `${state.numOfPlayers}\n${player}\n${state.boardSize}`;

  for (let i = 0; i < state.numOfPlayers; i++) {
    result += `\n${state.tick.pawnPos[i].x} ${state.tick.pawnPos[i].y} ${state.tick.ownedWalls[i]}`;
  }
  return result;
}

function tickToVisualizer(botPool: BotPool, state: GameState, userSteps: Action[]): void {
  const distances = getPlayersDistanceFromGoal(state);
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
      offline: !!bot.error || undefined,
      distance: distances[index],
    })),
  });
  resetBotCommLog(botPool.bots.length);
}

function stateToVisualizer(botPool: BotPool, state: GameState): void {
  const stateVis: Match = {
    init: {
      players: botPool.bots.map((bot) => ({
        id: bot.id,
        index: bot.index,
        name: bot.name,
      })),
      boardSize: state.boardSize,
      numOfWalls: state.tick.ownedWalls.reduce((a, b) => a + b, 0),
    },
    ticks: tickLog,
  };
  fs.writeFileSync("match.log", Match.toBinary(stateVis));
  fs.writeFileSync(
    "score.json",
    JSON.stringify(Object.fromEntries(scores.entries()), undefined, 2),
    "utf-8",
  );
}

function validateStep(state: GameState, input: string): Action | { error: string } {
  let inputArray = [];
  try {
    inputArray = input.split(" ").map((x) => myParseInt(x, { throwError: true }));
  } catch (e) {
    return { error: "Invalid input! You should send two or three numbers separated by spaces." };
  }
  if (inputArray.length === 2) {
    // Move
    const [x, y] = inputArray;
    if (!(x >= 0 && x < state.boardSize && y >= 0 && y < state.boardSize)) {
      return { error: "Invalid input! The coordinates are outside the board." };
    }
    if (possibleMoves(state).find((move) => move.x === x && move.y === y) === undefined) {
      return { error: "Invalid input! You can't move to this position." };
    }
    return { oneofKind: "move", move: { x, y } };
  }
  if (inputArray.length === 3) {
    // Place wall
    const [x, y, isVertical] = inputArray;
    if (
      !(
        x >= 0 &&
        x < state.boardSize - 1 &&
        y >= 0 &&
        y < state.boardSize - 1 &&
        (isVertical === 0 || isVertical === 1)
      )
    ) {
      return { error: "Invalid input! The coordinates are outside the board." };
    }
    const wallIsValidOutput = wallIsValid(state, {
      x,
      y,
      isVertical,
      who: state.tick.currentPlayer,
    });
    if (!wallIsValidOutput.result) {
      return { error: "Invalid input! Reason: " + wallIsValidOutput.reason };
    }
    return { oneofKind: "place", place: { x, y, isVertical } };
  }
  return { error: "Invalid input! You should send two or three numbers separated by spaces." };
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
  if (bot.error) {
    setBotError(bot, "Nothing sent to bot, it's in error state.");
    return;
  }
  const now = new Date();
  botCommLog[bot.index].received.push({ message, timestamp: now.getTime() });
  console.log(
    `${formatTime(now)}: Bot ${bot.name} (index: #${bot.index}, id: ${
      bot.id
    }) received\n${message}`,
  );
  try {
    await bot.send(message);
  } catch (error) {
    setBotError(bot, error.message);
  }
}

async function receiveMessage(bot: Bot, numberOfLines?: number) {
  const message = await bot.ask(numberOfLines);
  const now = new Date();
  console.log(
    `${formatTime(now)}: Bot ${bot.name} (index: #${bot.index}, id: ${bot.id}) sent\n${
      message.data
    }` + (message.error ? `\n${message.error}` : ""),
  );
  if (message.data !== null) {
    botCommLog[bot.index].sent.push({ message: message.data, timestamp: now.getTime() });
  }
  return message;
}

function setBotError(bot: Bot, error: string) {
  botCommLog[bot.index].error = error;
  console.log(`Bot ${bot.name} (index: #${bot.index}, id: ${bot.id}) error: ${error}`);
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
  const boardSize = state.boardSize;
  const walls = state.tick.wallsByCell;
  const ownedWalls = state.tick.ownedWalls;
  const currentPlayer = state.tick.currentPlayer;
  const boardString = Array.from({ length: state.boardSize }, () =>
    Object(Array.from({ length: state.boardSize }, () => ["+", " ", " ", "."])),
  );
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
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
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      res += boardString[x][y][0] + boardString[x][y][1];
    }
    res += "+\n";
    for (let x = 0; x < boardSize; x++) {
      res += boardString[x][y][2] + boardString[x][y][3];
    }
    res += "|\n";
  }
  for (let x = 0; x < boardSize; x++) {
    res += "+-";
  }
  res += "+\n";
  res += "Current player: " + currentPlayer.toString() + "\n";
  res += "Owned walls: " + ownedWalls[currentPlayer].toString();
  return res;
}
