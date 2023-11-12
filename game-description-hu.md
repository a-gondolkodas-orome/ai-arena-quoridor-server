## Példa kód

[quoridor_bot.cpp](/public/games/quoridor/quoridor_bot.cpp)

## Játékszabályok

A Quoridor absztrakt stratégiai táblás játék 2, esetleg 4 személy részére.
A játékos célja, hogy bábuját elsőként juttassa el a tábla túloldalára.


A tábla 9×9 egyforma mezőből áll.
A játékhoz tartozik összesen 20 fal-elem, kis lapok, amelyek hossza 2 mező szélességével egyenlő.
A falakat két-két mező közé lehet letenni.
Az ábrán az _A_ fal megengedett, viszont a _B_ fal nem.

![example](https://upload.wikimedia.org/wikipedia/commons/e/ef/Quidor_Wall.jpg)

A játékosok az üres tábla hozzájuk legközelebbi sorának középső mezőjére állítják a saját bábujukat, és egyenlően elosztják egymás között a falakat.
Az nyer, aki a bábujával először lép a túlsó oldali kezdősor valamelyik mezőjére.

A játékosok felváltva következnek.
A soron következő játékos vagy egyet lép a bábujával, vagy felhelyez egy falat.

Lépni a négy szomszédos mező valamelyikére lehet, ha fal nem állja útját.
Ha egy szomszédos mezőn egy másik bábu áll, akkor azt át lehet ugrani, de csak ha a másik bábu mögött szabad, fallal el nem zárt mező van.
Ha a bábut átugrani nem lehet, mert fal vagy a tábla széle van ott, akkor a játékos a másik bábu két másik oldalán levő mező közül választhat.
(Lásd 3. és 4. ábra lejjebb.)
Több bábut nem lehet átugrani, így (négy játékos esetén) előfordulhat, hogy egy játékos nem tud lépni. Ekkor ő veszített, a bábuja pedig lekerül a tábláról.

Falat mindig pontosan két-két mező közé lehet rakni.
A falak nem keresztezhetik egymást és nem lóghatnak ki a pályáról.
Letett falat a játék során már nem lehet eltávolítani vagy áthelyezni.
**Tilos olyan falat felépíteni, amely teljesen elzárja a célhoz vezető összes utat bármelyik bábu számára.**
Ha egy játékosnak nincs több fala, akkor lépni köteles.

Forrás: [Wikipédia](https://hu.wikipedia.org/wiki/Quoridor)

### Példa

Egy példa a megengedett lépésekre, továbbá az indexelésről.

![Kép](/public/games/quoridor/example_indices.png)

## Kommunikációs protokoll

A standard inputról kell olvasni, és standard outputra írni (azaz pl. cin és cout).
Fontos, hogy mindig megfelelő formátumban írjunk ki, azaz egy sorban szóközzel elválasztva, ahol kell.
Az is fontos, hogy használjatok 'endl'-t vagy flush-oljátok mindig az output-ot.

### Pálya adatok (csak Bemenet):

`N`: (2 vagy 4) játékosok száma

`player_id`: (0 ≤ _player_id_ ≤ N-1) egész szám, a játékos azonosítója

`M`: (Alapértelmezetten M=9) egész szám, a négyzet alakú tábla mérete

Bábuk kezdeti pozíciója (N sor)\
`x y f`: 3 egész szám, első kettő a bábu pozíciói, harmadik a játékos falainak száma. (Alapértelmezetten összesen 20 fal van.)

### Körönkénti üzenetek

#### Bemenet

`tick`: egész, az adott lépés sorszáma. Lépésenként eggyel nő.

Bábuk pozíciója (N sor):\
`x y f`: 3 egész szám, első kettő az i-ik játékos bábu pozíciója, harmadik pedig a játékos megmaradt falainak száma.
Ha egy játékos kiesett, mert valamikor nem tudott lépni, akkor (-1,-1)-et küldünk az ő pozíciójára.


`F`: egész szám, lerakott falak száma.

Falak pozíciói (F sor):\
`x y is_vertical who`: 4 egész szám, első három szám a falat írja le (részletek lent), negyedik szám pedig a falat lerakó játékos ID-ja.

Ha a játék egy bot számára véget ért (valaki nyert, vagy az adott bot nem tudott lépni),
akkor a fentiek helyett egyetlen `-1`-et kap bemenetként.
Erre ne válaszoljon, és érjen véget a program.

#### Kimenet

`x y`: Bábuddal melyik mezőre szeretnél lépni vagy\
`x y is_vertical`: Hova szeretnéd lehelyezni a falat (részletek lent).

### Indexelés

#### Tábla

(0,0) jelöli a tábla bal felső mezőjét, (8,0) a jobb felső, (8,8) a jobb alsó, (0,8) a bal alsó mezőjét.
Kezdetben a játékosok bábui 4 játékos esetén a (4,0), (8,4), (4,8), (0,4) mezőkön,
míg 2 játékos esetén (4,0), (4,8) mezőkön vannak, továbbá ugyanebben a sorrendben jönnek sorra a játékosok.

#### Falak

Egy falat meghatározza a (0,0)-hoz legközelebbi mező amivel szomszédos, illetve az, hogy függőleges vagy vízszintes fal-e.
Így (M=9 esetén) `0<=x,y<=7`, az `is_vertical` pedig `1` ha függőleges, `0` ha vízszintes a fal.

## A megjelenítő

A meccsek animált visszajátszása mellett első sorban a hibakeresést támogatja.
Ehhez a Player dobozban válaszd ki, hogy melyik bot kommunikációját szeretnéd követni.
Az üzenetek mezőben látod, hogy milyen játék állapotot kaptt a botod a tick elején, és erre mit válaszolt.
A megjelenített játék állapot az adott tick eseményeinek hatását már tartalmazza.

Ha a botod stratégiai döntéseit is szeretnéd látni, írj ki erre vonatkozó logot a standard errorra (c++-ban pl. `cerr << "megvizsgált lehetőségek száma: 42"`).
A megjelenítőben látni fogod az adott tickhez kiírt saját logodat, de tickenként max 2000 karaktert.

Ha egy ticknél piros hátterű szöveget látsz, az azt jelenti, hogy a botod abban a tickben hibás parancso(ka)t küldött, vagy crashelt.
Az utóbbi esetben a játék hátralévő részében nyilván nem csinál semmit, a játékos listában is ki lesz húzva.
