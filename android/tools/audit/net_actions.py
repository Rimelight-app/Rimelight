"""Requests per user action at the fault proxy (Normal): open an album, start a song, Statistics
cold, back to Albums after scrolling 5 pages, a LibraryCache refresh (cold start). Duplicates show
as counts > 1 for the same endpoint + id.
Usage: ANDROID_SERIAL=... python3 net_actions.py
"""
import collections, json, os, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402

APP = f.APP


def counted(label, action, settle=4):
    f.proxy("/__fault/log/reset", [])
    action()
    time.sleep(settle)
    log = f.proxy("/__fault/log")
    per = log.get("requests", {})
    dup = collections.Counter((r["endpoint"], r.get("id")) for r in log.get("recent", []) if r.get("id"))
    dups = {f"{e}:{i}": n for (e, i), n in dup.items() if n > 1}
    sizes = sorted({r.get("size") for r in log.get("recent", []) if r["endpoint"] == "getCoverArt" and r.get("size")}, key=str)
    r = {"requests": per, "duplicates": dups, "cover sizes": sizes}
    print(label, json.dumps(r), flush=True)
    return r


def open_album():
    f.library_albums()
    al = ui.scroll_to("Big Album", exact=True, tries=5)
    ui.tap_xy(*al["center"])
    ui.wait("ALBUM", timeout=15)


def start_song():
    rows = [n for n in ui.dump() if n["text"] == "Track 003"]
    ui.tap_xy(*rows[0]["center"])
    f.wait_state(lambda x: x["state"] == "PLAYING", 20)


def stats_cold():
    ui.adb("root", check=False)
    time.sleep(1)
    ui.shell(f"rm -f /data/data/{APP}/files/stats/*", check=False)
    ui.shell(f"am force-stop {APP}")
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(4)
    t = [n for n in ui.dump() if n["text"] == "Stats" and n["center"][1] > ui.sy(1900)]
    ui.tap_xy(*t[-1]["center"])
    end = time.time() + 120
    while time.time() < end and not any("songs played" in x for x in ui.texts()):
        time.sleep(1)


def albums_back_after_scrolling():
    f.library_albums()
    for _ in range(5):
        ui.swipe(ui.sx(540), ui.sy(1800), ui.sx(540), ui.sy(300), 150)
        time.sleep(1)
    tiles = [n for n in ui.dump() if n["text"].startswith(("Cold ", "Neon ", "Paper ", "Silver ", "Quiet ")) and 400 < n["center"][1] < ui.sy(1700)]
    ui.tap_xy(*tiles[0]["center"])
    ui.wait("ALBUM", timeout=15)
    time.sleep(1)
    ui.key("KEYCODE_BACK")


def cold_start_cache_refresh():
    ui.shell(f"am force-stop {APP}")
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(3)


def main():
    res = {}
    names = sys.argv[1:]
    if not names or "album" in names:
        res["open album"] = counted("open album", open_album)
        res["start a song"] = counted("start a song", start_song)
        ui.shell("cmd media_session dispatch pause")
    if not names or "stats" in names:
        res["Statistics cold"] = counted("Statistics cold", stats_cold, settle=3)
    res["Albums, 5 pages down, open an album, Back"] = counted("Albums, 5 pages down, open an album, Back", albums_back_after_scrolling)
    res["cold start (LibraryCache refresh)"] = counted("cold start (LibraryCache refresh)", cold_start_cache_refresh, settle=6)
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
