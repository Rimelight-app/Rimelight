"""Frame times of the song menu (1.6.1): opens it (long-press a song on an album page) and closes it
(tap the scrim) 10 times, with live blur on and off, and reports dumpsys gfxinfo's percentiles.

Usage: ANDROID_SERIAL=emulator-5554 APP=com.tonihk00.clearplay.rtest python3 menu_frames.py [rounds]
The app must be signed in. Use a release-speed build (-PcpReleaseSuffix=.rtest): debug is too slow.
"""
import json, os, re, sys, time
import ui

APP = os.environ.get("APP", "com.tonihk00.clearplay.rtest")
ACTIVITY = f"{APP}/com.tonihk00.clearplay.MainActivity"
ALBUM = "Neon Tides"


def open_tab(name):
    nodes = ui.dump()
    tabs = [n for n in nodes if n["text"] == name and n["center"][1] > 1900]
    ui.tap_xy(*(tabs[-1]["center"] if tabs else ui.wait(name, exact=True)["center"]))
    time.sleep(1.5)


def set_blur(on):
    open_tab("Settings")
    ui.scroll_to("Live glass blur", exact=True)
    checked, row = ui.switch_state("Live glass blur")
    if checked != on:
        ui.tap_xy(*row["center"])
        time.sleep(1)
    assert ui.switch_state("Live glass blur")[0] == on


def show_albums_tab():
    """The Library's tab row remembers its scroll; swipe it back until Albums shows."""
    for _ in range(4):
        if ui.find("Albums", exact=True):
            break
        tab = ui.find("Songs", exact=True) or ui.find("Playlists", exact=True) or ui.find("Favorites", exact=True)
        ui.swipe(tab["center"][0], tab["center"][1], 1000, tab["center"][1], 300)
        time.sleep(1)
    ui.tap("Albums", exact=True)


def open_album():
    open_tab("Library")
    show_albums_tab()
    time.sleep(1)
    ui.scroll_to(ALBUM, exact=True, tries=4)
    ui.tap(ALBUM, exact=True)
    ui.wait("ALBUM", timeout=15)
    time.sleep(1.5)


def gfx():
    out = ui.shell(f"dumpsys gfxinfo {APP}")
    get = lambda k: (re.search(rf"{k}: ?([\d.]+)", out) or [None, None])[1]
    return {"frames": get("Total frames rendered"), "janky": (re.search(r"Janky frames: (\d+ \([\d.]+%\))", out) or [None, None])[1],
            "p50": get("50th percentile"), "p90": get("90th percentile"), "p95": get("95th percentile"), "p99": get("99th percentile")}


def run(rounds, blur):
    set_blur(blur)
    open_album()
    more = [n for n in ui.dump() if n["desc"] == "More"]
    x, y = 400, more[1]["center"][1]
    time.sleep(2)
    ui.shell(f"dumpsys gfxinfo {APP} reset")
    for _ in range(rounds):
        ui.swipe(x, y, x, y, 700)  # long-press: menu slides up
        time.sleep(1.2)
        ui.tap_xy(540, 250)  # the scrim: slides down
        time.sleep(1.2)
    g = gfx()
    ui.key("KEYCODE_BACK")
    return g


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    ui.shell(f"am start -n {ACTIVITY}")
    ui.wait("Library", timeout=40)
    res = {"blur on": run(rounds, True), "blur off": run(rounds, False)}
    print(json.dumps(res, indent=1))
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
