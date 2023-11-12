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
            add_wall(wall);
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

    void add_wall(const Wall &wall) {
        set_wall_state(wall, true);
    }

    void remove_wall(const Wall &wall) {
        set_wall_state(wall, false);
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

    void set_wall_state(const Wall &wall, bool state) {
        if (wall.is_vertical) {
            borders[wall.x][wall.y].right = borders[wall.x][wall.y + 1].right = state;
            borders[wall.x + 1][wall.y].left = borders[wall.x + 1][wall.y + 1].left = state;
        } else {
            borders[wall.x][wall.y].bottom = borders[wall.x + 1][wall.y].bottom = state;
            borders[wall.x][wall.y + 1].top = borders[wall.x + 1][wall.y + 1].top = state;
        }
    }
};

pair<Pos, int> get_next_step(const GameState &my_state) {
    vector<vector<Pos>> parent(my_state.m, vector<Pos>(my_state.m, {-1, -1}));
    parent[my_state.my_pos.x][my_state.my_pos.y] = {-2, -2};
    Pos start = my_state.my_pos;
    queue<pair<Pos, int>> queue;
    queue.push({my_state.my_pos, 0});
    vector<vector<bool>> player_pos(my_state.m, vector<bool>(my_state.m, false));
    for (const Player &player: my_state.players) {
        player_pos[player.x][player.y] = true;
    }
    while (!queue.empty()) {
        Pos pos = queue.front().first;
        int dist = queue.front().second;
        queue.pop();
        if (pos.y == my_state.m - 1) {
            Pos step;
            for (step = pos; parent[step.x][step.y].x != start.x || parent[step.x][step.y].y != start.y; step = parent[step.x][step.y]);
            return {step, dist};
        }

        if (!my_state.borders[pos.x][pos.y].left && parent[pos.x - 1][pos.y].x == -1 && (dist > 0 || !player_pos[pos.x - 1][pos.y])) {
            queue.push({{pos.x - 1, pos.y}, dist + 1});
            parent[pos.x - 1][pos.y] = pos;
        }
        if (!my_state.borders[pos.x][pos.y].right && parent[pos.x + 1][pos.y].x == -1 && (dist > 0 || !player_pos[pos.x + 1][pos.y])) {
            queue.push({{pos.x + 1, pos.y}, dist + 1});
            parent[pos.x + 1][pos.y] = pos;
        }
        if (!my_state.borders[pos.x][pos.y].top && parent[pos.x][pos.y - 1].x == -1 && (dist > 0 || !player_pos[pos.x][pos.y - 1])) {
            queue.push({{pos.x, pos.y - 1}, dist + 1});
            parent[pos.x][pos.y - 1] = pos;
        }
        if (!my_state.borders[pos.x][pos.y].bottom && parent[pos.x][pos.y + 1].x == -1 && (dist > 0 || !player_pos[pos.x][pos.y + 1])) {
            queue.push({{pos.x, pos.y + 1}, dist + 1});
            parent[pos.x][pos.y + 1] = pos;
        }
        if (dist == 0) {
            if (!my_state.borders[pos.x][pos.y].left && player_pos[pos.x - 1][pos.y] && !my_state.borders[pos.x - 1][pos.y].left &&
                parent[pos.x - 2][pos.y].x == -1) {
                queue.push({{pos.x - 2, pos.y}, dist + 1});
                parent[pos.x - 2][pos.y] = pos;
            }
            if (!my_state.borders[pos.x][pos.y].right && player_pos[pos.x + 1][pos.y] && !my_state.borders[pos.x + 1][pos.y].right &&
                parent[pos.x + 2][pos.y].x == -1) {
                queue.push({{pos.x + 2, pos.y}, dist + 1});
                parent[pos.x + 2][pos.y] = pos;
            }
            if (!my_state.borders[pos.x][pos.y].top && player_pos[pos.x][pos.y - 1] && !my_state.borders[pos.x][pos.y - 1].top &&
                parent[pos.x][pos.y - 2].x == -1) {
                queue.push({{pos.x, pos.y - 2}, dist + 1});
                parent[pos.x][pos.y - 2] = pos;
            }
            if (!my_state.borders[pos.x][pos.y].bottom && player_pos[pos.x][pos.y + 1] && !my_state.borders[pos.x][pos.y + 1].bottom &&
                parent[pos.x][pos.y + 2].x == -1) {
                queue.push({{pos.x, pos.y + 2}, dist + 1});
                parent[pos.x][pos.y + 2] = pos;
            }
            // TODO implement turn-jumps
        }
    }
    return {{-1, -1}, 999999999};
}

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

        int x = my_state.my_pos.x, y = my_state.my_pos.y;
        auto step = get_next_step(my_state);
        Pos step_pos = step.first;
        int step_dist = step.second;

        if (step_pos.y == 8) {
            // just take the winning step
            my_state.step_command(step_pos.x, step_pos.y);
            continue;
        }

        // simulate step and evaluate the opponent's wall placement options
        my_state.my_pos = step_pos;
        my_state.players[my_state.player_id].x = step_pos.x;
        my_state.players[my_state.player_id].y = step_pos.y;
        set<tuple<int, int, bool>> existing_walls;
        for (const Wall &wall: my_state.walls)
            existing_walls.insert({wall.x, wall.y, wall.is_vertical});
        int worst_dist = step_dist;
        Wall worst_wall;
        for (int wx = 0; wx < m - 1; ++wx) {
            for (int wy = 0; wy < m - 1; ++wy) {
                for (bool is_vertical: {true, false}) {
                    Wall possible_wall = {wx, wy, is_vertical};
                    if (existing_walls.count(make_tuple(possible_wall.x, possible_wall.y, possible_wall.is_vertical)) ||
                        existing_walls.count(make_tuple(possible_wall.x, possible_wall.y, !possible_wall.is_vertical)))
                        continue;
                    if (possible_wall.is_vertical &&
                        (existing_walls.count(make_tuple(possible_wall.x, possible_wall.y - 1, possible_wall.is_vertical)) ||
                         existing_walls.count(make_tuple(possible_wall.x, possible_wall.y + 1, possible_wall.is_vertical))))
                        continue;
                    if (!possible_wall.is_vertical &&
                        (existing_walls.count(make_tuple(possible_wall.x - 1, possible_wall.y, possible_wall.is_vertical)) ||
                         existing_walls.count(make_tuple(possible_wall.x + 1, possible_wall.y, possible_wall.is_vertical))))
                        continue;
                    my_state.add_wall(possible_wall);
                    auto new_step = get_next_step(my_state);
                    if (new_step.first.x > -1 && new_step.second > worst_dist) {
                        worst_dist = new_step.second;
                        worst_wall = possible_wall;
                    }
                    my_state.remove_wall(possible_wall);

                }
            }
        }

        Wall counter_wall = {worst_wall.x, worst_wall.y, !worst_wall.is_vertical};
        bool can_counter = true;
        if (counter_wall.is_vertical &&
            (existing_walls.count(make_tuple(counter_wall.x, counter_wall.y - 1, counter_wall.is_vertical)) ||
             existing_walls.count(make_tuple(counter_wall.x, counter_wall.y + 1, counter_wall.is_vertical))))
            can_counter = false;
        if (!counter_wall.is_vertical &&
            (existing_walls.count(make_tuple(counter_wall.x - 1, counter_wall.y, counter_wall.is_vertical)) ||
             existing_walls.count(make_tuple(counter_wall.x + 1, counter_wall.y, counter_wall.is_vertical))))
            can_counter = false;
        if (worst_dist > step_dist + 3 && can_counter) {
            my_state.wall_command(counter_wall.x, counter_wall.y, counter_wall.is_vertical);
        } else if (step_pos.x == x && step_pos.y == y + 1 &&
                   any_of(my_state.players.begin(), my_state.players.end(),
                          [&](const Player &player) { return player.x == x && player.y == y + 2; })) {
            // don't create an opportunity for the opponent to jump over us
            my_state.wall_command(x, y - 1, false);
        } else {
            my_state.step_command(step_pos.x, step_pos.y);
        }
    }
}
