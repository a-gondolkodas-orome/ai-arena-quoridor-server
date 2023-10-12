## Leírás

A Quoridor absztrakt stratégiai táblás játék 2, esetleg 4 személy részére. A játékos célja, hogy bábuját elsőként juttassa el a túloldalra, ellenfelét pedig megakadályozza ugyanebben.

## Játékszabályok

A tábla 9×9 egyforma mezőből áll. A játékhoz tartozik összesen 20 fal-elem, kis lapok, amelyek hossza 2 mező szélességével egyenlő. A falakat két-két mező közé lehet letenni. Az ábrán az _A_ fal megengedett, viszont a _B_ fal nem.

![example](https://upload.wikimedia.org/wikipedia/commons/e/ef/Quidor_Wall.jpg)

A játékosok az üres tábla hozzájuk legközelebbi sorának középső mezőjére állítják a saját bábujukat, és egyenlően elosztják egymás között a falakat. Az a játékos célja, hogy a bábujával a túlsó oldali kezdősor valamelyik mezőjére léphessen, ezzel a játékos megnyeri a játszmát. A játékosok falak felállításával akadályozzák ellenfelüket.

A játékosok felváltva következnek. A játékos vagy egyet lép a bábujával, vagy felhelyez egy fal-elemet. Ha nincs több eleme, akkor lépni köteles. A falat mindig úgy kell elhelyezni, hogy pontosan két mező mellé, tehát két-két mező közé tesszük, az elemek értelemszerűen nem képesek egymást keresztezni, továbbá nem lóghatnak ki a pályáról. Falat letenni a táblán bárhová szabad, ahol és ahogy az lehetséges. Letett falat a játék során már nem lehet eltávolítani vagy áthelyezni.

Tilos olyan falat felépíteni, amely teljesen elzárja a célhoz vezető összes utat valamelyik bábu elől.

A bábu egyet léphet a négy szomszédos mező valamelyikére, ha fal nem állja útját. Ha az egyik mezőn egy másik bábu áll, akkor azt át lehet ugrani, ha mögötte szabad és fallal el nem zárt mező van. Ha a bábut átugrani nem lehet, mert fal vagy a játék széle van ott, akkor a játékos a bábu két másik oldalán levő mező közül választhat.

Több bábut nem lehet átugrani, így (négy játékos esetén) előfordulhat, hogy egy játékos nem tud lépni. Ekkor ő veszített, a bábuja pedig lekerül a tábláról.

Forrás: [Wikipédia](https://hu.wikipedia.org/wiki/Quoridor)

## Példa

Egy példa a megengedett lépésekre, továbbá az indexelésről.

![Kép](/public/games/quoridor/example_indeces.png)

## Kommunikációs protokoll

A standard inputról kell olvasni, és standard outputra írni (azaz pl. cin és cout).
Fontos, hogy mindig megfelelő formátumban írjunk ki, azaz egy sorban szóközzel elválasztva, ahol kell.
Az is fontos, hogy használjatok 'endl'-t vagy flush-oljátok mindig az output-ot.

### Kezdeti üzenetváltás

    Bemenet: "START"
    Kimenet: "OK"

A játék megkezdése előtt kaptok egy üzenetet a szervertől, amit ki kell olvasnotok, majd válaszolni rá.
("OK"-ot kell a standard outputra írni.)

## Pálya adatok (csak Bemenet):

`N`: (2 vagy 4) játékosok száma

`playerID`: (0 ≤ _playerID_ ≤ N-1) egész szám, a játékos azonosítója

`c r`: (Alapértelmezetten c=r=9) 2 egész szám, oszlopok és sorok száma

Bábuk kezdeti pozíciója (N sor)\
`x y f`: 3 egész szám, első kettő a bábu pozíciói, harmadik a játékos falainak száma. (Alapértelmezetten összesen 20 fal van.)

## Körönkénti üzenetek

### Bemenet

`tick`: egész, az adott lépés sorszáma. (Minden lépés során egyesével nő.)

Bábuk pozíciója (N sor):\
`x y f`: 3 egész szám, első kettő az i-ik játékos bábu pozíciója, harmadik pedig a játékos megmaradt falainak száma.
Ha egy játékos kiesett, mert valamikor nem tudott lépni, akkor (-1,-1)-et küldünk az ő pozíciójára.

`F`: egész szám, lerakott falak száma.

Falak pozíciói (F sor):\
`x y isVertical who`: 4 egész szám, első három szám a falat írja le (részletek lent), negyedik szám pedig a játékos ID-jét, aki lerakta a falat.

### Kimenet

`x y`: Bábuddal melyik mezőre szeretnél lépni
vagy
`x y isVertical`: Hova szeretnéd lehelyezni a falat (részletek lent).

## Indexelés

### Tábla

(0,0) jelöli a tábla bal felső mezőjét, (8,0) a jobb felső, (8,8) a jobb alsó, (0,8) a bal alsó mezőjét. Kezdetben a játékosok bábui 4 játékos esetén a (4,0), (8,4), (4,8), (0,4) mezőkön, míg 2 játékos esetén (4,0), (0,4) mezőkön vannak, továbbá ugyanebben a sorrendben jönnek sorra a játékosok.

### Falak

Egy falat meghatározza a (0,0)-hoz legközelebbi mező, illetve az, hogy függőleges vagy vízszintes fal-e. Így `0<=x,y<=7`, továbbá az `isVertical` változó `0` vagy `1`.
