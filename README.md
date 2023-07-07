# Quoridor

## Változók a játék állásának követésére
    {
        players: {playerID: int, name: string}[],
        board: {rows: int, cols: int},
        tick: {
        currentPlayer: int,
        pawnPos: {playerID: int, x: int, y: int}[]
        walls: {x, y, isVertical, who}[]
    }

## Változók a visualizernek

    {
        init: {
            players: {playerID: int, name: string}[],
            board: {rows: int, cols: int},
            numOfWalls: int
        },
        tick: {
            currentPlayer: int,
            Action: OneOf: {
                “type”: move;
                “Properties”: {
                    “x”:number;
                    “Y”:number;
                };
                {
                “type”: place;
                “Properties”: {
                    “x”:number;
                    “Y”:number;
                    “isVertical”: number;
                }
            }
            pawnPos: {playerID: int, x: int, y: int}[] // Ez még nem tartalmazza a mostani bábulépést.
            walls: {x, y, isVertical, who}[] // Ez még nem tartalmazza a most lehelyezett falat.
        }[]

    }

## Paraméterek

Játékosszám: 2 vagy 4
Falak száma: pl. 20
Játéktábla mérete: n×k (n,k páratlan)
