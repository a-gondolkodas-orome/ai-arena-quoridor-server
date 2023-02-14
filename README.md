# Quoridor

## Leírás

A Quoridor absztrakt stratégiai táblás játék 2, esetleg 4 személy részére. A játékos célja, hogy bábuját elsőként juttassa el a túloldalra, ellenfelét pedig megakadályozza ugyanebben.

## Játékszabályok

A tábla 9×9 egyforma mezőből áll. A játékhoz tartozik összesen 20 fal-elem, kis lapok, amelyek hossza 2 mező szélességével egyenlő. A tábla úgy van kialakítva, hogy ezek a lapocskák a mezők közötti vájatba állíthatók, tetszés szerint.

![example](https://upload.wikimedia.org/wikipedia/commons/e/ef/Quidor_Wall.jpg)

A játékosok az üres tábla hozzájuk legközelebbi sorának középső mezőjére állítják a saját bábujukat, és egyenlően elosztják egymás között a falakat. Az a játékos célja, hogy a bábujával a túlsó oldali kezdősor valamelyik mezőjére léphessen, ezzel a játékos megnyeri a játszmát. A játékosok falak felállításával akadályozzák ellenfelüket.

A játékosok felváltva következnek. A játékos vagy egyet lép a bábujával, vagy felhelyez egy fal-elemet. Ha nincs több eleme, akkor lépni köteles. A falat mindig úgy kell elhelyezni, hogy pontosan két mező mellé, tehát két-két mező közé tesszük, az elemek értelemszerűen nem képesek egymást keresztezni. Falat letenni a táblán bárhová szabad, ahol és ahogy az lehetséges. Letett falat a játék során már nem lehet eltávolítani vagy áthelyezni.

Tilos olyan falat felépíteni, amely teljesen elzárja a célhoz vezető összes utat a másik bábu elől.

A bábu egyet léphet a négy szomszédos mező valamelyikére, ha fal nem állja útját. Ha az egyik mezőn egy másik bábu áll, akkor azt át lehet ugrani, ha mögötte szabad és fallal el nem zárt mező van. Ha a bábut átugrani nem lehet, mert fal vagy a játék széle van ott, akkor a játékos a bábu két másik oldalán levő mező közül választhat.

Több bábut nem lehet átugrani, így (négy játékos esetén) előfordulhat, hogy egy játékos nem tud lépni. Ekkor ő veszített, a bábuja pedig lekerül a tábláról.

Forrás: [Wikipédia](https://hu.wikipedia.org/wiki/Quoridor)

## Példák

![example](https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Quoridor%2C_mogelijke_zetten.jpg/347px-Quoridor%2C_mogelijke_zetten.jpg)

## Kommunikációs protokoll

A standard inputról kell olvasni, és standard outputra írni (azaz pl. cin és cout).
Fontos, hogy mindig megfelelő formátumban írjunk ki, azaz egy sorban szóközzel elválasztva, ahol kell.
Az is fontos, hogy használjatok 'endl'-t vagy flush-oljátok mindig az output-ot.
Kezdeti üzenetváltás

    Bemenet: "START"
    Kimenet: "OK"

A játék megkezdése előtt kaptok egy üzenetet a szervertől, amit ki kell olvasnotok, majd válaszolni rá.
("OK"-ot kell a standard outputra írni.)

## Pálya adatok (csak Bemenet):

`N`: játékosok száma

`playerID`: egész szám 0 és N-1 között, a játékos azonosítója

`c r`: 2 egész szám, oszlopok és sorok száma

Bábuk kezdeti pozíciója (N sor)
`x y f`: 3 egész szám, első kettő a bábu pozíciói, harmadik a játékos falainak száma.

## Körönkénti üzenetek

### Bemenet

`tick`: egész, az adott lépés sorszáma. (Minden lépés során egyesével nő.)

Bábuk pozíciója (N sor):
`x y f`: 3 egész szám, első kettő az i-ik játékos bábu pozíciója, harmadik pedig a játékos megmaradt falainak száma.
 Ha egy játékos kiesett, mert valamikor nem tudott lépni, akkor (-1,-1)-et küldünk az ő pozíciójára.

`F`: egész szám, lerakott falak száma.

Falak pozíciói (F sor):
`x y isVertical who`: 4 természetes szám, első három szám a falat írja le (részletek lent), negyedik szám pedig a játékos ID-jét, aki lerakta a falat.

### Kimenet

`x y`: Bábuddal melyik mezőre szeretnél lépni
    vagy
`x y isVertical`: Hova szeretnéd lehelyezni a falat (részletek lent).

## Indexelés

### Tábla
(0,0) jelöli a tábla bal felső mezőjét, (8,0) a jobb felső, (8,8) a jobb alsó, (0,8) a bal alsó mezőjét.

### Falak
Egy falat meghatározza a (0,0)-hoz legközelebbi mező, illetve az, hogy függőleges vagy vízszintes fal-e. Így `0<=x,y<=7`, továbbá az `isVertical` változó `0` vagy `1`.

TODO: kép az indexelésről

## Példák
TODO


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
