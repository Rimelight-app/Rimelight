"""Update test (1.6.1): install ClearPlay for Android 1.6.0, use it, then install Rimelight for Android
1.6.1 over it (adb install -r, same key) and check nothing was lost.

Usage: ANDROID_SERIAL=emulator-5554 python3 update_test.py <old.apk> <new.apk> [phase]
  phase: all (default), before (install the old APK and use it), after (install the new one and check).
Env: ND_DEVICE (rig as seen from the device), RESULTS (JSON file to write), SHOTS (screenshots).
Both APKs must be signed with the same key and have applicationId com.tonihk00.clearplay.
"""
import json, os, re, sys, tempfile, time
import ui

APP = "com.tonihk00.clearplay"
ACTIVITY = f"{APP}/com.tonihk00.clearplay.MainActivity"
ND_DEVICE = os.environ.get("ND_DEVICE", "10.0.2.2:4544")
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
STATE = os.path.join(SHOTS, f"update-state-{ui.SERIAL}.json")
ALBUM = "Neon Tides"


def log(*a):
    print(*a, flush=True)


def package_info():
    out = ui.shell(f"dumpsys package {APP}")
    get = lambda k: (re.search(rf"{k}=(\S+)", out) or [None, None])[1]
    return {"versionName": get("versionName"), "versionCode": get("versionCode"),
            "firstInstallTime": (re.search(r"firstInstallTime=([^\n]+)", out) or [None, None])[1],
            "lastUpdateTime": (re.search(r"lastUpdateTime=([^\n]+)", out) or [None, None])[1],
            "dataDir": get("dataDir")}


def wait_state(state, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        s = ui.media_state(APP)
        if s and s["state"] == state:
            return s
        time.sleep(0.4)
    raise TimeoutError(f"player not {state}: {ui.media_state(APP)}")


def open_tab(name):
    nodes = ui.dump()
    tabs = [n for n in nodes if n["text"] == name and n["center"][1] > 1900]
    ui.tap_xy(*(tabs[-1]["center"] if tabs else ui.wait(name, exact=True)["center"]))
    time.sleep(1.5)


def open_album():
    open_tab("Library")
    ui.tap("Albums", exact=True)
    time.sleep(1)
    ui.scroll_to(ALBUM, exact=True, tries=4)
    ui.tap(ALBUM, exact=True)
    ui.wait("ALBUM", timeout=15)
    time.sleep(1)


def song_rows():
    """The album page's song rows: (title, node) for rows that have a ⋯ (More) button."""
    nodes = ui.dump()
    more = [n for n in nodes if n["desc"] == "More"]
    return nodes, more


def switch(label, on=None):
    ui.scroll_to(label, exact=True)
    checked, row = ui.switch_state(label)
    if on is not None and checked != on:
        ui.tap_xy(*row["center"])
        time.sleep(1)
        checked, row = ui.switch_state(label)
    return checked


# ---------------------------------------------------------------- launcher

def launcher_home():
    ui.key("KEYCODE_HOME")
    time.sleep(1.5)
    ui.key("KEYCODE_HOME")
    time.sleep(1)


def app_icon(nodes=None):
    """The app's icon on the home screen or in the hotseat (by its label)."""
    nodes = nodes if nodes is not None else ui.dump()
    for n in nodes:
        if (n["desc"] in ("ClearPlay", "Rimelight") or n["text"] in ("ClearPlay", "Rimelight")) and n["center"][1] > 300:
            return n
    return None


def pin_shortcut(label="Shuffle library"):
    """Long-presses the app's icon and taps "Add to home screen" next to its [label] shortcut."""
    launcher_home()
    icon = app_icon()
    if not icon:
        raise RuntimeError(f"app icon not on the home screen: {ui.texts()[:60]}")
    x, y = icon["center"]
    item = None
    for _ in range(3):  # a slow (software-rendered) launcher sometimes misses the long-press
        ui.swipe(x, y, x, y, 1200)  # long-press: shortcut popup
        time.sleep(2)
        nodes = ui.dump()
        item = ui.find(label, exact=True, nodes=nodes)
        if item:
            break
        launcher_home()
    assert item, f"no {label!r} in the popup: {ui.texts(nodes)}"
    adds = [n for n in nodes if n["text"] == "Add to home screen" or n["desc"] == "Add to home screen"]
    if adds:
        add = min(adds, key=lambda n: abs(n["center"][1] - item["center"][1]))
        ui.tap_xy(*add["center"])
    else:  # Pixel Launcher on API 36: no button, drag the shortcut onto an empty part of the home screen
        x, y = item["center"]
        ui.shell(f"input draganddrop {x} {y} 300 700 1500")
    time.sleep(2.5)
    launcher_home()
    pinned = [n for n in ui.dump() if n["text"] == label or n["desc"] == label]
    if not pinned:
        raise RuntimeError(f"shortcut {label!r} not on the home screen: {ui.texts()[:40]}")
    return pinned[0]


def pinned_shortcuts():
    out = ui.shell("dumpsys shortcut")
    i = out.find(f"Package: {APP}  UID")
    j = out.find("Package: ", i + 10)
    block = out[i:j if j > 0 else i + 8000]
    pins = []
    for m in re.finditer(r"ShortcutInfo \{id=([^,]+), flags=0x[0-9a-f]+ \[([^\]]*)\].*?shortLabel=([^,\n]+)", block, re.S):
        if "Pin" in m.group(2).split("|") or "Pin" in m.group(2):
            pins.append({"id": m.group(1), "flags": m.group(2), "label": m.group(3)})
    return pins


def launcher_label():
    launcher_home()
    icon = app_icon()
    if icon:
        return icon["text"] or icon["desc"]
    # Pixel Launcher (API 36) only suggests the app in the bottom row: read it in the app drawer.
    ui.swipe(540, 1800, 540, 400, 300)
    time.sleep(2)
    names = [n["text"] or n["desc"] for n in ui.dump() if (n["text"] or n["desc"]) in ("ClearPlay", "Rimelight")]
    launcher_home()
    return names[0] if names else None



# ---------------------------------------------------------------- phases

def before(old_apk):
    r = {}
    ui.adb("uninstall", APP, check=False)
    ui.adb("install", old_apk, timeout=180)
    r["installed"] = package_info()
    ui.shell("ime disable com.android.inputmethod.latin/.LatinIME", check=False)
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(5)
    if ui.find("Allow", exact=True):
        ui.tap("Allow", exact=True)
    import login
    login.login(ND_DEVICE)
    time.sleep(3)
    # A setting: Continue on other devices on (off by default), Scrobble plays off (on by default).
    open_tab("Settings")
    r["setting_continue"] = switch("Continue on other devices", True)
    r["setting_scrobble"] = switch("Scrobble plays", False)
    # Statistics (fills stats/).
    open_tab("Stats")
    time.sleep(6)
    r["stats_texts"] = [t for t in ui.texts() if re.search(r"\d", t)][:12]
    # Download a song (the album's third), from its ⋯ menu.
    open_album()
    nodes, more = song_rows()
    ui.tap_xy(*more[2]["center"])
    time.sleep(1.5)
    ui.tap("Download", exact=True)
    time.sleep(1)
    end = time.time() + 60
    done = False
    while time.time() < end and not done:
        ui.tap_xy(*song_rows()[1][2]["center"])
        time.sleep(1.2)
        done = ui.find("Remove download", exact=True) is not None
        ui.key("KEYCODE_BACK")
        time.sleep(2)
    assert done, "download didn't finish"
    titles = [n["text"] for n in ui.dump() if n["text"]]
    # Play the album from its second song, then pause at a known point.
    nodes, more = song_rows()
    rows_y = sorted(m["center"][1] for m in more)
    ui.tap_xy(400, rows_y[1])
    wait_state("PLAYING", 20)
    time.sleep(9)
    ui.shell("cmd media_session dispatch pause")
    s = wait_state("PAUSED", 10)
    time.sleep(2)
    r["queue"] = ui.media_state(APP)
    # What 1.6.0 itself shows after its process restarts (an update restarts it too): the
    # mini player with the saved song, or nothing until Play (playback resumption).
    ui.shell(f"am force-stop {APP}")
    time.sleep(1)
    ui.shell(f"am start -n {ACTIVITY}")
    ui.wait("Library", timeout=30)
    time.sleep(3)
    r["mini_player_after_restart"] = ui.find(r["queue"]["title"], exact=True) is not None
    ui.shell("cmd media_session dispatch play")
    s = wait_state("PLAYING", 20)
    ui.shell("cmd media_session dispatch pause")
    s = wait_state("PAUSED", 10)
    time.sleep(2)
    r["queue_after_restart_160"] = ui.media_state(APP)
    r["queue"] = r["queue_after_restart_160"]
    r["downloaded"] = "third song of " + ALBUM
    ui.key("KEYCODE_BACK")
    time.sleep(1)
    # Home-screen shortcut.
    pin_shortcut("Shuffle library")
    r["pinned_before"] = pinned_shortcuts()
    r["launcher_label_before"] = launcher_label()
    ui.screenshot(os.path.join(SHOTS, f"update-before-{ui.SERIAL}.png"))
    json.dump(r, open(STATE, "w"), indent=1)
    return r


def after(new_apk):
    b = json.load(open(STATE))
    r = {"before": b}
    out = ui.adb("install", "-r", new_apk, timeout=180)
    assert "Success" in out, out
    info = package_info()
    r["installed"] = info
    assert info["firstInstallTime"] == b["installed"]["firstInstallTime"], "the app was reinstalled, not updated"
    assert info["versionName"] != b["installed"]["versionName"], info
    r["launcher_label_after"] = launcher_label()
    assert r["launcher_label_after"] == "Rimelight", r["launcher_label_after"]
    r["pinned_after"] = pinned_shortcuts()
    assert [p["id"] for p in r["pinned_after"]] == [p["id"] for p in b["pinned_before"]], (b["pinned_before"], r["pinned_after"])
    # Start: still logged in (no login screen), queue and position kept.
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(6)
    assert not ui.find("Connect", exact=True), "login screen after the update"
    ui.wait("Library", timeout=30)
    q = b["queue"]
    time.sleep(3)
    r["mini_player_after_update"] = ui.find(q["title"], exact=True) is not None
    assert r["mini_player_after_update"] == b["mini_player_after_restart"], \
        f"mini player differs from 1.6.0 after a restart ({b['mini_player_after_restart']}): {ui.texts()[:30]}"
    ui.shell("cmd media_session dispatch play")
    s = wait_state("PLAYING", 20)
    time.sleep(1)
    s = ui.media_state(APP)
    r["queue_after"] = s
    assert s["title"] == q["title"] and s["item"] == q["item"], (q, s)
    assert abs(s["position"] - q["position"]) < 4000, f"position {s['position']} vs saved {q['position']}"
    ui.shell("cmd media_session dispatch pause")
    wait_state("PAUSED", 10)
    # Settings kept.
    open_tab("Settings")
    r["setting_continue_after"] = switch("Continue on other devices")
    r["setting_scrobble_after"] = switch("Scrobble plays")
    assert r["setting_continue_after"] is True and r["setting_scrobble_after"] is False, r
    # Statistics kept (the saved snapshot shows offline too).
    # The download plays offline.
    ui.shell("svc wifi disable; svc data disable")
    time.sleep(8)
    open_tab("Library")
    ui.wait("Offline", timeout=20, exact=True)
    # Offline, the library is the downloads (and phone music): the album of the downloaded song.
    ui.tap("Albums", exact=True)
    time.sleep(1)
    ui.tap(ALBUM, exact=True)
    ui.wait("ALBUM", timeout=15)
    time.sleep(1.5)
    rows = [n for n in ui.dump() if n["desc"] == "More"]
    r["offline_album_rows"] = len(rows)
    assert rows, f"no downloads listed: {ui.texts()[:30]}"
    ui.tap_xy(400, rows[0]["center"][1])
    s = wait_state("PLAYING", 20)
    time.sleep(4)
    s2 = ui.media_state(APP)
    assert s2["state"] == "PLAYING" and s2["position"] > s["position"], (s, s2)
    r["offline_play"] = s2
    ui.shell("cmd media_session dispatch pause")
    open_tab("Stats")
    time.sleep(4)
    r["stats_after_offline"] = [t for t in ui.texts() if re.search(r"\d", t)][:12]
    assert any("Last synced" in t for t in ui.texts()) or r["stats_after_offline"], ui.texts()[:30]
    ui.shell("svc wifi enable; svc data enable")
    time.sleep(6)
    # The pinned shortcut works.
    launcher_home()
    pin = [n for n in ui.dump() if n["text"] == "Shuffle library" or n["desc"] == "Shuffle library"]
    assert pin, "pinned shortcut gone from the home screen"
    ui.tap_xy(*pin[0]["center"])
    s = wait_state("PLAYING", 30)
    r["shortcut_played"] = s
    ui.screenshot(os.path.join(SHOTS, f"update-after-{ui.SERIAL}.png"))
    ui.shell("cmd media_session dispatch pause")
    return r


def main():
    old, new = sys.argv[1], sys.argv[2]
    phase = sys.argv[3] if len(sys.argv) > 3 else "all"
    res = {}
    if phase in ("all", "before"):
        res["before"] = before(old)
        log("BEFORE", json.dumps(res["before"], indent=1))
    if phase in ("all", "after"):
        res["after"] = after(new)
        log("AFTER", json.dumps(res["after"], indent=1))
        log("UPDATE TEST PASS")
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
