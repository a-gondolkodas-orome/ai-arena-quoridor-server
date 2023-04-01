#include <iostream>
#include <chrono>
#include <thread>

using namespace std;

int main(){
    string start;
    cin >> start;
    cout << "OK" << endl;
    std::this_thread::sleep_for(10ms);
    string name;
    int N, playerID, cols, rows, babu1, babu2, x, y, isVertical, who, babu1x, babu1y, babu1walls, babu2x, babu2y, babu2walls;
    cin >> N;
    cin >> playerID;
    cin >> cols >> rows;
    cin >> babu1y >> babu1x >> babu1walls;
    cin >> babu2y >> babu2x >> babu2walls;
    while (true) {
        int tick, F;
        cin >> tick;
        cin >> babu1y >> babu1x >> babu1walls;
        cin >> babu2y >> babu2x >> babu2walls;
        cin >> F;
        for (int i = 0; i < F; i++){
            int x, y, isVertical, who;
            cin >> x >> y >> isVertical >> who;
        }
        if (playerID == 0) {
            cout << "0 0 0" << endl;
        } else {
            cout << "0 0 1" << endl;
        }
    }
    return 0;
}