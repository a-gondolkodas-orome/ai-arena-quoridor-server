#include <bits/stdc++.h>

using namespace std;

struct Pos {
    int x, y;

    /** Returns the new coordinates of this position after rotating the board counter clockwise by a number of quarter turns */
    Pos rotate(int m, int quarters) const {
        switch (quarters % 4) {
            case 0:
                return {x, y};
            case 1:
                return {y, m - 1 - x};
            case 2:
                return {m - 1 - x, m - 1 - y};
            case 3:
                return {m - 1 - y, x};
        }
    }
};

struct Player {
    int x, y;
    int walls;
};

struct Wall {
    int x, y;
    bool is_vertical;

    /** Returns the new representation of this wall after rotating the board counter clockwise by a number of quarter turns */
    Wall rotate(int m, int quarters) const {
        // The top-left corner of the original wall box. Which is not the top-left corner of the rotated box!
        Pos rotated_corner = Pos{x, y}.rotate(m, quarters);
        switch (quarters % 4) {
            case 0:
                return {x, y, is_vertical};
            case 1:
                return {rotated_corner.x, rotated_corner.y - 1, !is_vertical};
            case 2:
                return {rotated_corner.x - 1, rotated_corner.y - 1, is_vertical};
            case 3:
                return {rotated_corner.x - 1, rotated_corner.y, !is_vertical};
        }
    }
};

struct CellBorders {
    bool top, right, bottom, left;
};

class GameState {
public:
    GameState(int n, int player_id, int m, const vector<Player> &players, const vector<Wall> &walls, int rotated = 0) : n(n), player_id(player_id),
                                                                                                                        m(m),
                                                                                                                        players(players),
                                                                                                                        walls(walls),
                                                                                                                        rotated(rotated) {
        my_pos = {players[player_id].x, players[player_id].y};
        borders.assign(m, vector<CellBorders>(m));
        for (int i = 0; i < m; ++i)
            borders[i][0].top = borders[m - 1][i].right = borders[i][m - 1].bottom = borders[0][i].left = true;
        for (const Wall &wall: walls) {
            if (wall.is_vertical) {
                borders[wall.x][wall.y].right = borders[wall.x][wall.y + 1].right = true;
                borders[wall.x + 1][wall.y].left = borders[wall.x + 1][wall.y + 1].left = true;
            } else {
                borders[wall.x][wall.y].bottom = borders[wall.x + 1][wall.y].bottom = true;
                borders[wall.x][wall.y + 1].top = borders[wall.x + 1][wall.y + 1].top = true;
            }
        }
    }

    int n, player_id, m;
    vector<Player> players;
    vector<Wall> walls;
    vector<vector<CellBorders>> borders;
    Pos my_pos;

    GameState rotate_to_top() {
        int rotate_quarters = n == 2 ? 2 * player_id : player_id;
        vector<Player> rotated_players(players.size());
        transform(players.begin(), players.end(), rotated_players.begin(), [&](const Player &player) {
            Pos rotated_pos = Pos{player.x, player.y}.rotate(m, rotate_quarters);
            return Player{rotated_pos.x, rotated_pos.y, player.walls};
        });
        vector<Wall> rotated_walls(walls.size());
        transform(walls.begin(), walls.end(), rotated_walls.begin(), [&](const Wall &wall) {
            return wall.rotate(m, rotate_quarters);
        });
        return {n, player_id, m, rotated_players, rotated_walls, rotate_quarters};
    }

    string to_string() {
        vector<string> pixels(2 * m + 1, string(2 * m + 1, '.'));
        for (int i = 0; i < n; ++i) {
            pixels[2 * players[i].y + 1][2 * players[i].x + 1] = '0' + i;
        }
        for (int y = 0; y < m; ++y) {
            for (int x = 0; x < m; ++x) {
                pixels[2 * y][2 * x] = '+';
                pixels[2 * y][2 * x + 1] = borders[x][y].top ? '-' : ' ';
                pixels[2 * y + 1][2 * x] = borders[x][y].left ? '|' : ' ';
            }
            pixels[2 * y][2 * m] = '+';
            pixels[2 * y + 1][2 * m] = borders[m - 1][y].right ? '|' : ' ';
        }
        for (int x = 0; x < m; ++x) {
            pixels[2 * m][2 * x] = '+';
            pixels[2 * m][2 * x + 1] = borders[x][m - 1].bottom ? '-' : ' ';
        }
        pixels[2 * m][2 * m] = '+';
        string board;
        for (const string &line: pixels) {
            board += line + '\n';
        }
        return board;
    }

    void step_command(int x, int y) const {
        Pos pos = Pos{x, y}.rotate(m, 4 - rotated);
        cout << pos.x << ' ' << pos.y << endl;
    }

    void wall_command(int x, int y, bool is_vertical) const {
        Wall wall = Wall{x, y, is_vertical}.rotate(m, 4 - rotated);
        cout << wall.x << ' ' << wall.y << ' ' << (int) wall.is_vertical << endl;
    }

private:
    int rotated;
};

int main() {
    int n, player_id, m;
    cin >> n >> player_id >> m;
    vector<Player> players(n);
    for (int i = 0; i < n; i++)
        cin >> players[i].x >> players[i].y >> players[i].walls;
    int tick;
    for (cin >> tick; tick > -1; cin >> tick) {
        for (int i = 0; i < n; i++)
            cin >> players[i].x >> players[i].y >> players[i].walls;
        int f;
        cin >> f;
        vector<Wall> walls(f);
        int unused_who;
        for (int i = 0; i < f; ++i) {
            cin >> walls[i].x >> walls[i].y >> walls[i].is_vertical >> unused_who;
        }
        GameState global_state(n, player_id, m, players, walls);
        GameState my_state = global_state.rotate_to_top();

        if (tick <= 12) {
            if (tick < 3)
                my_state.step_command(4, 1);
            else if (tick < 5)
                my_state.wall_command(0, 0, false);
            else if (tick < 7)
                my_state.wall_command(2, 0, false);
            else if (tick < 9)
                my_state.wall_command(5, 1, true);
            else if (tick < 11)
                my_state.wall_command(5, 3, true);
            else
                my_state.wall_command(4, 0, false);
        } else {
            int x = my_state.my_pos.x, y = my_state.my_pos.y;
            bool pawn_in_front = false;
            for (const Player &player: my_state.players) {
                if (player.x == x && player.y == y + 1) {
                    pawn_in_front = true;
                    break;
                }
            }
            if (pawn_in_front) {
                my_state.step_command(x, y + 2);
                continue;
            }
            if (my_state.borders[x][y].bottom) {
                // there is a wall in front of us
                int left_dist, right_dist;
                for (left_dist = 1; left_dist <= x && my_state.borders[x - left_dist][y].bottom; ++left_dist);
                for (right_dist = 1; right_dist <= m - x - 1 && my_state.borders[x + right_dist][y].bottom; ++right_dist);
                if (left_dist <= x && (left_dist < right_dist || right_dist > m - x - 1)) {
                    my_state.step_command(x - 1, y);
                } else {
                    my_state.step_command(x + 1, y);
                }
            } else {
                my_state.step_command(x, y + 1);
            }
        }
    }
}
