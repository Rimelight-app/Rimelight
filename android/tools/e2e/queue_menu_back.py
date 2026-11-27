"""Song menu over the full player's queue: Back closes the menu, a second Back the player (1.6.1: the page
transition handler used to take Back while a page under the player had not settled).
Album page -> Play -> Back -> full player -> Queue -> hold row 2 -> Back.
Usage: ANDROID_SERIAL=... APP=... python3 queue_menu_back.py [tries]"""
import sys, time
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import ui, sheet_places as sp

N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
res = []
for k in range(N):
    sp.home()
    sp.open_tab("Library"); ui.tap("Albums", exact=True); ui.tap("Neon Tides", exact=True)
    ui.wait("ALBUM", timeout=15); ui.tap("Play", exact=True); time.sleep(3)
    ui.shell("cmd media_session dispatch pause"); ui.key("KEYCODE_BACK"); time.sleep(1)
    nxt = [n for n in ui.dump() if n["desc"] == "Next" and 1500 < n["center"][1] < 2150][-1]
    ui.tap_xy(300, nxt["center"][1]); time.sleep(2)
    ui.tap("Queue", exact=True); time.sleep(1.5)
    ys = [n["center"][1] for n in ui.dump() if n["desc"] == "Remove"]
    ui.swipe(500, ys[1], 500, ys[1], 900); time.sleep(1.5)
    opened = "Go to artist" in ui.texts()
    ui.key("KEYCODE_BACK"); time.sleep(1.5)
    t = ui.texts()
    closed = "Go to artist" not in t
    player = "Lyrics" in t and "Sleep timer" in t  # the full player is still there behind it
    # a second Back must then close the full player
    ui.key("KEYCODE_BACK"); time.sleep(2)
    t2 = ui.texts()
    player_closed = "Sleep timer" not in t2
    print(f"try {k+1}: opened={opened} back_closed_menu={closed} player_still_open={player} 2nd_back_closed_player={player_closed} behind={t2[:5]}", flush=True)
    res.append(closed and player and player_closed)
    if "Go to artist" in ui.texts():
        ui.tap_xy(540, 200); time.sleep(1.5)
print("PASS" if all(res) else "FAIL", sum(res), "of", len(res))
