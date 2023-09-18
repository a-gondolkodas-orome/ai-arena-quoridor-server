import { BotPool } from "./BotWraper";
import { GameState } from "./types";

const BOARDROWS = 9;
const BOARDCOLS = 9;

export const initStateFour: GameState = {
	numOfPlayers: 4,
	board: {
		rows: BOARDROWS,
		cols: BOARDCOLS
	},
	tick: {
		id: 0,
		currentPlayer: -1,
		pawnPos: [
			{ x: 4, y: 0 },
			{ x: 8, y: 4 },
			{ x: 4, y: 8 },
			{ x: 0, y: 4 }
		],
		walls: [],
		ownedWalls: [5,5,5,5],
		// First index is x, second is y
		wallsByCell: Array.from({length: BOARDCOLS}, (_,x) => Object(Array.from({length: BOARDROWS}, (_,y) => {
			let res = {top: false, right: false, bottom: false, left: false, wallVertical: false, wallHorizontal: false};
			if (x === 0) res.left = true;
			if (x === BOARDCOLS - 1) res.right = true;
			if (y === 0) res.top = true;
			if (y === BOARDROWS - 1) res.bottom = true;
			return res;
		}))),
	}
}

export const initStateTwo: GameState = {
	numOfPlayers: 2,
	board: {
		rows: 9,
		cols: 9
	},
	tick: {
		id: 0,
		currentPlayer: -1,
		pawnPos: [
			{ x: 4, y: 0 },
			{ x: 4, y: 8 },
		],
		walls: [],
		ownedWalls: [10,10],
		// First index is x, second is y
		wallsByCell: Array.from({length: BOARDCOLS}, (_,x) => Object(Array.from({length: BOARDROWS}, (_,y) => {
			let res = {top: false, right: false, bottom: false, left: false, wallVertical: false, wallHorizontal: false};
			if (x === 0) res.left = true;
			if (x === BOARDCOLS - 1) res.right = true;
			if (y === 0) res.top = true;
			if (y === BOARDROWS - 1) res.bottom = true;
			return res;
		}))),
	}
}


export const botsTwo = new BotPool(["./bots/bot_a", "./bots/bot_b"]);
