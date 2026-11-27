"""Downloads (Normal): "Playlist 500" downloaded from its page.
1. total time for 500 songs; frame times while flinging Albums during it
2. network lost mid-download (Wi-Fi + data off 20 s): does it resume / finish?
3. the app killed (kill -9 as root) mid-download: does it resume after restart?
4. storage full (a big file fills /data as root): what happens, and after freeing space?
Progress is read from Library → Downloads ("N songs"), and Media3's download index via dumpsys-free
counting of the songs listed offline is avoided: the server's stream requests at the proxy count too.
Usage: ANDROID_SERIAL=... python3 downloads.py
"""
import json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402
import big_open as b  # noqa: E402

APP = f.APP


def streams():
    return f.proxy("/__fault/log").get("requests", {}).get("stream", 0)


def downloaded_count():
    """Songs fully downloaded, from the Downloads tab's header ("N songs · M MB" or similar)."""
    out = ui.shell(f"run-as {APP} ls files 2>/dev/null; ls /data/data/{APP}/files/downloads 2>/dev/null | wc -l", check=False)
    return out


def storage_used():
    return ui.shell(f"du -sk /data/data/{APP}/files /data/data/{APP}/no_backup /data/data/{APP}/cache 2>/dev/null", check=False).strip()


def open_playlist_500():
    f.library_albums()
    f.show_tab("Playlists")
    item = ui.scroll_to("Playlist 500", exact=True, tries=90)
    ui.tap_xy(*item["center"])
    ui.wait("PLAYLIST", timeout=30)
    time.sleep(2)


def wait_streams(target, timeout):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if streams() >= target:
            return time.time() - t0
        time.sleep(2)
    return None


def main():
    ui.adb("root", check=False)
    time.sleep(2)
    res = {}
    f.clear()
    open_playlist_500()
    t0 = time.time()
    ui.tap("Download", exact=True)
    # 1. frames while it downloads
    time.sleep(5)
    f.library_albums()
    b.gfx_reset()
    for _ in range(6):
        ui.swipe(ui.sx(540), ui.sy(1800), ui.sx(540), ui.sy(400), 150)
        time.sleep(0.6)
    res["fling Albums during the download"] = b.gfx()
    # 2. network lost mid-download
    n_before = streams()
    ui.shell("svc wifi disable; svc data disable")
    time.sleep(20)
    ui.shell("svc wifi enable; svc data enable")
    res["stream requests before the network went"] = n_before
    # 3. killed mid-download
    time.sleep(15)
    n_kill = streams()
    pid = ui.shell(f"pidof {APP}").strip()
    ui.shell(f"kill -9 {pid}", check=False)
    time.sleep(3)
    ui.shell(f"am start -n {f.ACTIVITY}")
    res["stream requests when killed"] = n_kill
    took = wait_streams(500, 1800)
    res["500 stream requests reached after (s, from the tap)"] = round(time.time() - t0) if took is not None else None
    res["stream requests total"] = streams()
    time.sleep(10)
    res["storage after"] = storage_used()
    # The Downloads tab's own count.
    f.library_albums()
    f.show_tab("Downloads")
    time.sleep(3)
    res["Downloads tab"] = [t for t in ui.texts() if re.search(r"\d+ (songs?|albums?|MB)", t)][:4]
    print(json.dumps(res, indent=1))
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
