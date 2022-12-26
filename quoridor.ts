import { Bot, BotPool } from "./BotWraper";
import * as fs from "fs";
import { GameState, PlayerID, PawnPos, Wall, WallPos, TickVisualizer, UserStep, Tick } from "./types";
import { botsTwo as bots, initStateTwo as initState } from "./initStates";



const tickLog: TickVisualizer[] = [];

try {
  makeMatch(initState, bots);
} catch (error) {
  console.log(error);
}


/*if (process.argv.length > 2) {
  makeMatch(
    JSON.parse(fs.readFileSync(process.argv[2], { encoding: "utf-8" })) as GameState,
    new BotPool(process.argv.slice(3)),
  ).then(() => process.exit(0)); // TODO the exit shouldn't be necessary. I guess the running bots from initStates prevent exiting normally.
} else {
  makeMatch(initState, bots);
}
*/


async function makeMatch(state: GameState, bots: BotPool) {
  const workingBots = await testingBots(state, bots);
  for (let i = 0; i < workingBots.length; i++) {
    console.log("sending starting pos to bot " + i);
    await workingBots[i].send(startingPosToString(state, i));
  }

  tickToVisualizer(state, [{ type: "start" }]); // Save for visualizer
  while (!endIf(state)) {
    state.tick.id++;
    state.tick.currentPlayer = nextPlayer(state);
    const userSteps: UserStep[] = [];
    if (beforeCall(state)) {
      // User can move, call the bot
      const step = await workingBots[state.tick.currentPlayer].ask();
      // Validate the user's input
      const validatedStep = validateStep(state, step.data);
      //const validatedStep = {error: "bot not implemented"} as any;
      if (!validatedStep.hasOwnProperty("error")) {
        // User's input is valid
        userSteps.push(validatedStep as UserStep);
      } else {
        // User's input is invalid, do a default move
        const tmp = validatedStep as { error: string };
        console.log(tmp.error);
        userSteps.push(defaultUserStep(state));
      }
    } else {
      // User cannot move, do not call the bot, just skip the turn and the player will lose.
      userSteps.push({ type: "cannotmove" });
    }
    // Update the state
    state = updateState(state, userSteps);
    // Save for visualizer
    tickToVisualizer(state, userSteps);
    console.log(showBoard(state));
  }
  console.log("ENDED");
}

async function test() {
  const bp: BotPool = new BotPool(["./a.out", "./a.out"]);
  await bp.sendAll("Expample Name");
  let a = await bp.askAll(2);
  console.log("anwser:", a);
  initState.tick.currentPlayer = 0;
  placeWall(initState, { x: 5, y: 5, isVertical: 0 });
  moveWithPawn(initState, { x: 5, y: 5 });
  console.log(showBoard(initState));
  //a = await bp.askAll();
  //console.log("anwser:", a);
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
*/
function endIf(state: GameState): boolean {
  if (state.numOfPlayers === 2) {
    if (state.tick.id >= 30) return true
    if (state.tick.pawnPos[0].y === state.board.rows, state.tick.pawnPos[1].y === 0) return true
    return false
  } else if (state.numOfPlayers === 4) {
    if (state.tick.id >= 30) return true
    if (state.tick.pawnPos[0].y === state.board.rows || state.tick.pawnPos[1].x === 0 || state.tick.pawnPos[2].y === 0 || state.tick.pawnPos[3].x === state.board.cols) return true
    return false
  }
  throw new Error("Internal game server error! Number of players can be 2 or 4.")
}

/*
  Calculates the playerID of the next player
*/
function nextPlayer(state: GameState): PlayerID {
  let nextPlayer = 0;
  for (let i = state.tick.currentPlayer + 1; i <= state.tick.currentPlayer + state.numOfPlayers; i++) {
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
    return { type: "move", x, y }
  } else {
    // we can't move, so we will place a wall, if we can
    const wallPos = randomWall(state);
    if (wallPos !== null) {
      return { type: "place", ...wallPos };
    } else {
      // we can't place a wall, so we cannot do anything. It's an error, because it is checked at the beginning of the tick
      throw Error("Internal game server error! The current player cannot do anything, but the server thought he could.");
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
  if (wall.isVertical === 1) {
    state.tick.wallsByCell[wall.x][wall.y].wallVertical = true;
    state.tick.wallsByCell[wall.x][wall.y].right = true;
    state.tick.wallsByCell[wall.x][wall.y + 1].right = true;
    state.tick.wallsByCell[wall.x + 1][wall.y].left = true;
    state.tick.wallsByCell[wall.x + 1][wall.y + 1].left = true;
  } else {
    state.tick.wallsByCell[wall.x][wall.y].wallVertical = true;
    state.tick.wallsByCell[wall.x][wall.y].bottom = true;
    state.tick.wallsByCell[wall.x + 1][wall.y].bottom = true;
    state.tick.wallsByCell[wall.x][wall.y + 1].top = true;
    state.tick.wallsByCell[wall.x + 1][wall.y + 1].top = true;
  }
  state.tick.ownedWalls[state.tick.currentPlayer]--;
  state.tick.walls.push({ ...wall, who: state.tick.currentPlayer });
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

function wallIsValid(state: GameState, wall: Wall): { result: boolean, reason?: string } {
  // Player does not have enough walls
  if (state.tick.ownedWalls[state.tick.currentPlayer] === 0) {
    return { result: false, reason: "Player does not have enough walls." };
  }

  // Is wall out of bounds?
  if (wall.x < 0 || wall.x >= state.board.cols - 1 || wall.y < 0 || wall.y >= state.board.rows - 1) {
    return { result: false, reason: "Wall is out of bounds." };
  }

  // The new wall is horizontal and intersects a previous horizontal wall
  if (wall.isVertical === 0 && (!state.tick.wallsByCell[wall.x][wall.y].bottom || !state.tick.wallsByCell[wall.x + 1][wall.y].bottom)) {
    return { result: false, reason: "The new (horizontal) wall intersects a previous (horizontal) wall." };
  }
  // The new wall is vertical and intersects a previous vertical wall
  if (wall.isVertical === 1 && (!state.tick.wallsByCell[wall.x][wall.y].right || !state.tick.wallsByCell[wall.x][wall.y + 1].right)) {
    return { result: false, reason: "The new (vertical) wall intersects a previous (vertical) wall." };
  }
  // The new wall is horizontal and intersects a previous vertical wall
  if (wall.isVertical === 0 && state.tick.wallsByCell[wall.x][wall.y].wallVertical) {
    return { result: false, reason: "The new (horizontal) wall intersects a previous (vertical) wall." };
  }
  // The new wall is vertical and intersects a previous horizontal wall
  if (wall.isVertical === 1 && state.tick.wallsByCell[wall.x][wall.y].wallHorizontal) {
    return { result: false, reason: "The new (vertical) wall intersects a previous (horizontal) wall." };
  }

  // Does the new wall cuts off the the only remaining path of a pawn to the side of the board it must reach?
  // Check it with BFS for all players.
  if (!bfsForPlayers(state, state.tick.pawnPos[0].x, state.tick.pawnPos[0].y, (x, y) => y === state.board.rows - 1)) {
    return { result: false, reason: "The new wall cuts off the the only remaining path of pawn starting from top reaching the bottom side." };
  }
  if (!bfsForPlayers(state, state.tick.pawnPos[1].x, state.tick.pawnPos[1].y, (x, y) => x === 0)) {
    return { result: false, reason: "The new wall cuts off the the only remaining path of pawn starting from right reaching the left side." };
  }
  if (!bfsForPlayers(state, state.tick.pawnPos[2].x, state.tick.pawnPos[2].y, (x, y) => y === 0)) {
    return { result: false, reason: "The new wall cuts off the the only remaining path of pawn starting from bottom reaching the top side." };
  }
  if (!bfsForPlayers(state, state.tick.pawnPos[3].x, state.tick.pawnPos[3].y, (x, y) => x === state.board.cols - 1)) {
    return { result: false, reason: "The new wall cuts off the the only remaining path of pawn starting from left reaching the right side." };
  }

  return { result: true };
}


// Checks with BFS if the pawn can reach his goal
function bfsForPlayers(state: GameState, starting_x: number, starting_y: number, goalReached: (x: number, y: number) => boolean): boolean {
  const visited = Array(state.board.cols).fill(0).map(() => new Array(state.board.rows).fill(false));
  const queue = new Array<[number, number]>();
  queue.push([starting_x, starting_y]);
  visited[starting_x][starting_y] = true;
  const walls = state.tick.wallsByCell;
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    // Check if we reached our goal
    if (goalReached(x, y)) {
      return true;
    }
    // Check if we can move to the left
    if (!walls[x][y].left && !visited[x - 1][y]) {
      queue.push([x - 1, y]);
      visited[x - 1][y] = true;
    }
    // Check if we can move to the right
    if (!walls[x][y].right && !visited[x + 1][y]) {
      queue.push([x + 1, y]);
      visited[x + 1][y] = true;
    }
    // Check if we can move to the top
    if (!walls[x][y].top && !visited[x][y - 1]) {
      queue.push([x, y - 1]);
      visited[x][y - 1] = true;
    }
    // Check if we can move to the bottom
    if (!walls[x][y].bottom && !visited[x][y + 1]) {
      queue.push([x, y + 1]);
      visited[x][y + 1] = true;
    }
  }
  return false;
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
  for (let i = 0; i < 200; i++) { // TODO: this solution does not work always, but at least it is fast
    const [x, y] = [Math.floor(Math.random() * (state.board.cols - 1)), Math.floor(Math.random() * (state.board.rows - 1))];
    const isVertical = Math.random() < 0.5 ? 0 : 1;
    const wall = wallIsValid(state, { x, y, isVertical, who: state.tick.currentPlayer });
    if (wall.result) {
      return { x, y, isVertical };
    }
  }
  return null
}

async function testingBots(state: GameState, bots: BotPool): Promise<Bot[]> {
  console.log("before start")
  await bots.sendAll("START");
  console.log("after start")
  const botAnswers = await bots.askAll();
  console.log(botAnswers);
  const workingBots: Bot[] = bots.bots.filter((bot, index) => botAnswers[index].data === "OK");
  return workingBots;
}

function startingPosToString(state: GameState, player: PlayerID): string {
  return state.numOfPlayers.toString() + "\n" + player.toString(); //+ "\n" + state.board.cols.toString() + " " + state.board.rows.toString();
}

function tickToVisualizer(state: GameState, userSteps: UserStep[]): void {
  tickLog.push({
    currentPlayer: state.tick.currentPlayer,
    pawnPos: state.tick.pawnPos,
    walls: state.tick.walls,
    ownedWalls: state.tick.ownedWalls,
    action: userSteps[0] // There is only one player now
  })
}

function validateStep(state: GameState, input: string): UserStep | { error: string } {
  let inputArray = [];
  try {
    inputArray = input.split(" ").map(x => myParseInt(x, { throwError: true }));
  }
  catch (e) {
    return { error: "Invalid input! You should send two or three numbers separated by spaces." };
  }
  if (inputArray.length === 2) {
    const [x, y] = inputArray;
    if (x >= 0 && x < state.board.cols && y >= 0 && y < state.board.rows) {
      return { type: "move", x, y };
    }
    return { error: "Invalid input! The two numbers are not in the correct interavals." };
  }
  if (inputArray.length === 3) {
    const [x, y, isVertical] = inputArray;
    if (x >= 0 && x < state.board.cols - 1 && y >= 0 && y < state.board.rows - 1 && (isVertical === 0 || isVertical === 1)) {
      return { type: "place", x, y, isVertical };
    }
    return { error: "Invalid input! The three numbers are not in the correct interavals." };
  }
  return { error: "Invalid input! You should send two or three numbers separated by spaces." };
}

function myParseInt(value: string, { min = -Infinity, max = Infinity, defaultValue = 0, throwError = false }): number {
  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed >= min && parsed <= max) {
    return parsed;
  }
  if (throwError) {
    throw new Error(`Invalid number: ${value}`);
  }
  return defaultValue;
}

function showBoard(state: GameState): void {
  const board = state.board;
  const walls = state.tick.wallsByCell;
  const ownedWalls = state.tick.ownedWalls;
  const currentPlayer = 0;
  let boardString = Array.from({length: state.board.cols}, () => Object(Array.from({length: state.board.rows}, () => new Array("+", " ", " ", "."))));
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
  console.log(res);
}