"""Stuck page (1.6.1, B10): album -> Play -> 3 s -> pause -> Back; checks that the album page is gone.
Before the fix, a Back press here often left the page half-popped, and no later Back (key or swipe)
reached the app: the page transition handler in AppRoot switched itself on during NavHost's back.
Usage: ANDROID_SERIAL=... APP=... python3 album_back.py instant|press|gesture [tries]"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ui, sheet_places as sp

mode = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 3
res = []
for k in range(N):
    sp.home()
    sp.open_tab("Library"); ui.tap("Albums", exact=True); ui.tap("Neon Tides", exact=True)
    ui.wait("ALBUM", timeout=15); ui.tap("Play", exact=True); time.sleep(3)
    ui.shell("cmd media_session dispatch pause")
    if mode == "instant":
        ui.key("KEYCODE_BACK")
    elif mode == "press":  # about as long as a finger on the Back button
        ui.shell("input keyevent --duration 120 KEYCODE_BACK")
    else:
        ui.swipe(3, 1200, 500, 1200, 250)
    time.sleep(2.5)
    popped = "ALBUM" not in ui.texts()
    print(f"{mode} {k+1}: popped={popped}", flush=True)
    if not popped:  # does anything still reach the app?
        ui.key("KEYCODE_BACK"); time.sleep(2)
        print("   after a 2nd Back the album is still there:", "ALBUM" in ui.texts(), flush=True)
    res.append(popped)
print("PASS" if all(res) else "FAIL", sum(res), "of", len(res))
