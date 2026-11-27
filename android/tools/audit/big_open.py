"""Known suspect E (big library), on an emulator signed in to the big rig through the fault proxy:
- open "Big Playlist 10000" and "Big Album" (500): time from the tap until the first song rows show
  (uiautomator polling, so ±0.5 s), the requests it took, PSS / Java heap before and after
  (dumpsys meminfo), frame times (gfxinfo) over 8 flings down the list
- covers: getCoverArt requests at the proxy over 10 play/pauses (does the media session reload artwork?)

Usage: ANDROID_SERIAL=emulator-5556 python3 big_open.py [playlist|album|covers ...]
"""
import json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402

APP = f.APP


def meminfo():
    out = ui.shell(f"dumpsys meminfo {APP}")
    get = lambda pat: int((re.search(pat, out) or [0, "0"])[1])
    return {"pss_kb": get(r"TOTAL PSS:\s+(\d+)") or get(r"TOTAL\s+(\d+)"), "java_kb": get(r"Java Heap:\s+(\d+)"),
            "native_kb": get(r"Native Heap:\s+(\d+)"), "graphics_kb": get(r"Graphics:\s+(\d+)")}


def gfx_reset():
    ui.shell(f"dumpsys gfxinfo {APP} reset")


def gfx():
    out = ui.shell(f"dumpsys gfxinfo {APP}")
    g = lambda k: (re.search(rf"{k}: ?([\d.]+)", out) or [None, None])[1]
    return {"frames": g("Total frames rendered"), "janky": (re.search(r"Janky frames: (\d+ \([\d.]+%\))", out) or [None, None])[1],
            "p50": g("50th percentile"), "p90": g("90th percentile"), "p99": g("99th percentile")}


def library_tab(tab):
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(1.5)
    for _ in range(3):
        if "ALBUM" not in ui.texts() and "PLAYLIST" not in ui.texts():
            break
        ui.key("KEYCODE_BACK")
        time.sleep(1)
    nodes = ui.dump()
    lib = [n for n in nodes if n["text"] == "Library" and n["center"][1] > ui.sy(1900)]
    ui.tap_xy(*lib[-1]["center"])
    time.sleep(1.5)
    for _ in range(4):
        if ui.find(tab, exact=True):
            break
        t = ui.find("Songs", exact=True) or ui.find("Favorites", exact=True) or ui.find("Artists", exact=True)
        ui.swipe(t["center"][0], t["center"][1], ui.sx(1000), t["center"][1], 300)
        time.sleep(1)
    ui.tap(tab, exact=True)
    time.sleep(2)


def open_and_measure(name, tab, first_row):
    library_tab(tab)
    item = ui.scroll_to(name, exact=True, tries=40)
    f.clear()
    m0 = meminfo()
    t0 = time.time()
    ui.tap_xy(*item["center"])
    shown = None
    while time.time() - t0 < 30:
        if ui.find(first_row, exact=True):
            shown = time.time() - t0
            break
        time.sleep(0.2)
    reqs = f.proxy("/__fault/log").get("requests", {})
    time.sleep(2)
    m1 = meminfo()
    gfx_reset()
    for _ in range(8):
        ui.swipe(ui.sx(540), ui.sy(1800), ui.sx(540), ui.sy(300), 120)
        time.sleep(0.6)
    time.sleep(1)
    g = gfx()
    m2 = meminfo()
    return {"name": name, "first_rows_s": round(shown, 1) if shown else None, "requests": reqs,
            "mem_before": m0, "mem_open": m1, "mem_after_scroll": m2, "fling": g}


def playlist():
    return open_and_measure("Big Playlist 10000", "Playlists", None or first_playlist_song())


def first_playlist_song():
    pl = [p for p in f.nd("getPlaylists")["playlists"]["playlist"] if p["name"] == "Big Playlist 10000"][0]
    return f.nd("getPlaylist", id=pl["id"])["playlist"]["entry"][0]["title"]


def album():
    return open_and_measure("Big Album", "Albums", "Track 001")


def covers():
    """Something plays; 10 play/pauses; getCoverArt requests counted at the proxy."""
    ui.shell("cmd media_session dispatch play")
    f.wait_state(lambda x: x["state"] == "PLAYING", 20)
    time.sleep(3)
    f.clear()
    for _ in range(10):
        ui.shell("cmd media_session dispatch pause")
        time.sleep(1.5)
        ui.shell("cmd media_session dispatch play")
        time.sleep(1.5)
    reqs = f.proxy("/__fault/log")
    ui.shell("cmd media_session dispatch pause")
    cov = [r for r in reqs.get("recent", []) if r.get("endpoint") == "getCoverArt"]
    return {"getCoverArt": len(cov), "sizes": sorted({r.get("size") for r in cov if r.get("size")}, key=str), "all": reqs.get("requests")}


def main():
    names = sys.argv[1:] or ["album", "playlist", "covers"]
    res = {n: globals()[n]() for n in names}
    print(json.dumps(res, indent=1))
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
