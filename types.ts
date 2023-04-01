export type PlayerID = number;

type Player = {
	name: string;
};

export type PawnPos = {
	// If the player fell out, then their value will be (-1,-1)
	x: number,
	y: number
}

export type WallPos = {
	x: number,
	y: number,
	isVertical: 0 | 1
}

export type Wall = {
	x: number,
	y: number,
	isVertical: 0 | 1,
	who: PlayerID
}

export type WallsByCell = { top: boolean, right: boolean, bottom: boolean, left: boolean, wallVertical: boolean, wallHorizontal: boolean }[][]

export type Tick = {
	id: number,
	currentPlayer: PlayerID,
	pawnPos: PawnPos[],
	walls: Wall[],
	wallsByCell: WallsByCell,
	ownedWalls: number[]
}


export type TickVisualizer = {
	currentPlayer: PlayerID,
	pawnPos: PawnPos[],
	walls: Wall[],
	ownedWalls: number[],
	action: UserStep
}

export type UserStep = { type: "move", x: number, y: number } | { type: "place", x: number, y: number, isVertical: 0 | 1 } | { type: "start" } | { type: "cannotmove" }

export type GameState = {
	numOfPlayers: number,
	board: { rows: number, cols: number },
	tick: Tick
}

export type GameStateVis = {
	players: Player[],
	board: { rows: number, cols: number },
	tick: Tick
}
