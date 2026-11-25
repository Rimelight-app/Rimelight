"""End-to-end "Continue on other devices" between ClearPlay Android (driven through its UI on a
device or emulator) and a pretend ClearPlay desktop (pretend_desktop.mjs: c=ClearPlay, the
desktop's own queue-handoff.ts rules from tag v0.6.0) against a real Navidrome 0.64.2.

Usage: ANDROID_SERIAL=emulator-5554 python3 handoff_e2e.py [case numbers...]
Env: ND (rig URL as seen from this machine), ND_DEVICE (as seen from the device), RULES, NODE,
     APP (package), RESULTS (JSON file to write).
"""
import hashlib, json, os, random, re, string, subprocess, sys, tempfile, time, urllib.parse, urllib.request
import ui

HERE = os.path.dirname(os.path.abspath(__file__))
ND = os.environ.get("ND", "http://127.0.0.1:4544")
ND_DEVICE = os.environ.get("ND_DEVICE", "10.0.2.2:4544")
NODE = os.environ.get("NODE", os.path.expanduser("~/clearplay-rig/node/current/bin/node"))
RULES = os.environ.get("RULES", os.path.expanduser("~/clearplay-rig/desktop-rules/queue-handoff.ts"))
APP = os.environ.get("APP", "com.tonihk00.clearplay.debug")
ACTIVITY = f"{APP}/com.tonihk00.clearplay.MainActivity"
MUSIC = os.environ.get("MUSIC", os.path.expanduser("~/clearplay-rig/music064"))
ND_DATA = os.environ.get("ND_DATA", os.path.expanduser("~/clearplay-rig/nd064"))
ANDROID = "ClearPlay-Android"
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
log_lines = []


def log(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    log_lines.append(line)


# ---------------------------------------------------------------- Navidrome as other clients

def nd(endpoint, params=None, client="e2e", post=None):
    salt = "".join(random.choice(string.ascii_lowercase) for _ in range(8))
    q = {"u": "admin", "t": hashlib.md5(("test1234" + salt).encode()).hexdigest(), "s": salt, "v": "1.16.1", "c": client, "f": "json"}
    q.update(params or {})
    if post is None:
        req = urllib.request.Request(f"{ND}/rest/{endpoint}?{urllib.parse.urlencode(q)}")
    else:
        body = urllib.parse.urlencode(list(q.items()) + post).encode()
        req = urllib.request.Request(f"{ND}/rest/{endpoint}", data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)["subsonic-response"]


def desktop(cmd, args=None):
    out = subprocess.run([NODE, os.path.join(HERE, "pretend_desktop.mjs"), cmd, json.dumps(args or {})],
                         capture_output=True, text=True, timeout=60, env={**os.environ, "RULES": RULES, "ND": ND})
    if out.returncode != 0:
        raise RuntimeError(out.stderr)
    return json.loads(out.stdout.strip().splitlines()[-1])


def album_songs(name):
    albums = nd("getAlbumList2", {"type": "alphabeticalByName", "size": 50})["albumList2"]["album"]
    a = next(x for x in albums if x["name"] == name)
    return nd("getAlbum", {"id": a["id"]})["album"]["song"]


def server_queue():
    return desktop("queue")


def wait_changed(prev, timeout=10):
    """Waits until Navidrome has stored a new save (changed moved on). A save that is sent isn't stored yet."""
    end = time.time() + timeout
    while time.time() < end:
        q = server_queue()
        if q and q["changed"] != prev:
            return q
        time.sleep(0.25)
    return None


def changed_now():
    q = server_queue()
    return q["changed"] if q else ""


# ---------------------------------------------------------------- the app through its UI

def app_logcat_clear():
    ui.adb("logcat", "-c", check=False)


def app_log(tag="Handoff"):
    return ui.adb("logcat", "-d", "-s", f"{tag}:*", check=False)


def start_fresh(wait_library=True):
    """Force-stops and starts the app (its 'look on app start' runs)."""
    ui.shell(f"am force-stop {APP}")
    time.sleep(0.5)
    ui.shell(f"am start -n {ACTIVITY}")
    if wait_library:
        ui.wait("Library", timeout=40)
        time.sleep(2.5)


def foreground():
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(2)


def background():
    ui.key("KEYCODE_HOME")
    time.sleep(1)


def ensure_signed_in():
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(4)
    if ui.find("Connect", exact=True):
        import login
        login.login(ND_DEVICE)


def open_tab(name):
    nodes = ui.dump()
    tabs = [n for n in nodes if n["text"] == name and n["center"][1] > 1900]
    ui.tap_xy(*(tabs[-1]["center"] if tabs else ui.wait(name, exact=True)["center"]))
    time.sleep(1.5)


def set_sync(on):
    open_tab("Settings")
    ui.scroll_to("Continue on other devices", exact=True)
    checked, row = ui.switch_state("Continue on other devices")
    if checked != on:
        ui.tap_xy(*row["center"])
        time.sleep(1)
    assert ui.switch_state("Continue on other devices")[0] == on
    open_tab("Library")


def play_album(name, song_index=0):
    open_tab("Library")
    ui.tap("Albums", exact=True)
    time.sleep(1)
    ui.scroll_to(name, exact=True, tries=4)
    ui.tap(name, exact=True)
    ui.wait("ALBUM", timeout=15)
    time.sleep(1)
    if song_index == 0:
        ui.tap("Play", exact=True)
    else:
        title = album_songs(name)[song_index]["title"]
        rows = [n for n in ui.dump() if n["text"] == title]
        ui.tap_xy(*rows[0]["center"])
    wait_state("PLAYING", 20)
    ui.key("KEYCODE_BACK")
    time.sleep(1)


def wait_state(state, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        s = ui.media_state(APP)
        if s and s["state"] == state:
            return s
        time.sleep(0.4)
    raise TimeoutError(f"player not {state}: {ui.media_state(APP)}")


def mini(button):
    """Taps the mini player's Pause / Play button (content description)."""
    nodes = ui.dump()
    hits = [n for n in nodes if n["desc"] == button and 1500 < n["center"][1] < 2150]
    if not hits:
        raise TimeoutError(f"mini player {button} not found")
    ui.tap_xy(*hits[-1]["center"])


PILL = re.compile(r"^(Playing on|Paused on|Saved by|Continued on) ")


def pill(timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        for t in ui.texts():
            if PILL.match(t):
                return t
        time.sleep(0.6)
    return None


def no_pill(seconds):
    end = time.time() + seconds
    while time.time() < end:
        for t in ui.texts():
            if PILL.match(t):
                return t
        time.sleep(1)
    return None


def tap_pill_button(label):
    nodes = ui.dump()
    hits = [n for n in nodes if n["text"] == label]
    ui.tap_xy(*hits[-1]["center"])


def dismiss_pill():
    nodes = ui.dump()
    hits = [n for n in nodes if n["desc"] == "Dismiss"]
    ui.tap_xy(*hits[-1]["center"])


def near(a, b, tol):
    return abs(a - b) <= tol


# ---------------------------------------------------------------- cases

def case1():
    s = album_songs("Neon Tides")
    ids = [s[0]["id"], s[1]["id"], s[2]["id"], s[1]["id"], s[3]["id"]]
    desktop("save", {"ids": ids, "index": 3, "position": 20000})
    desktop("report", {"id": s[1]["id"], "state": "paused", "positionMs": 20000})
    start_fresh()
    text = pill(15)
    want = f"Paused on ClearPlay desktop · {s[1]['title']} · just now"
    assert text == want, f"pill {text!r}, want {want!r}"
    before = changed_now()
    tap_pill_button("Continue")
    t0 = time.time()
    st = wait_state("PLAYING", 20)
    st = ui.media_state(APP)
    expect = 20000 + (time.time() - t0) * 1000
    assert st["item"] == 3, f"started at queue item {st['item']}, want 3 (the second copy)"
    assert st["title"] == s[1]["title"], st
    assert near(st["position"], expect, 2000), f"position {st['position']} vs {expect:.0f}"
    q = wait_changed(before, 10)
    assert q and q["changedBy"] == ANDROID, f"server after Continue: {q}"
    assert q["currentIndex"] == 3, q
    # Nothing offered again (the phone plays; and after a pause it is this app's own queue).
    background(); time.sleep(31); foreground()
    assert no_pill(5) is None, "offered again"
    return f"pill ok, item 3 at {st['position']} ms (want ~{expect:.0f}), changedBy {q['changedBy']}"


def case2():
    s = album_songs("Paper Lanterns")
    ids = [x["id"] for x in s[:5]]
    desktop("save", {"ids": ids, "index": 1, "position": 10000})
    desktop("report", {"id": s[1]["id"], "state": "playing", "positionMs": 15000})
    t_report = time.time()
    start_fresh()
    text = pill(15)
    want = f"Playing on ClearPlay desktop · {s[1]['title']}"
    assert text == want, f"pill {text!r}, want {want!r}"
    tap_pill_button("Continue here")
    t0 = time.time()
    wait_state("PLAYING", 20)
    st = ui.media_state(APP)
    live = 15000 + (t0 - t_report) * 1000 + (time.time() - t0) * 1000
    assert st["item"] == 1 and st["title"] == s[1]["title"], st
    assert near(st["position"], live, 3000), f"position {st['position']} vs live {live:.0f}"
    return f"pill ok, started at desktop's live second: {st['position']} ms vs {live:.0f}"


def case3():
    """Phone → desktop: the phone plays the desktop's queue with the same song twice, at the second copy."""
    # Its own setup: the desktop's queue with the same song twice, continued here (case 1).
    case1()
    st = wait_state("PLAYING", 5)
    before = changed_now()
    mini("Pause")
    t0 = time.time()
    q = wait_changed(before, 2.0)
    took = time.time() - t0
    st = ui.media_state(APP)
    assert q, "nothing stored within 2 s of the pause"
    assert q["changedBy"] == ANDROID
    assert q["currentIndex"] == st["item"], f"server index {q['currentIndex']} vs phone {st['item']}"
    assert near(q["positionMs"], st["position"], 1000), f"server {q['positionMs']} vs phone {st['position']}"
    o = desktop("offer", {"handledChanged": None, "playingHere": False})
    assert o and o["kind"] == "paused" and o["index"] == st["item"] and near(o["positionMs"], st["position"], 1000), o
    # While the phone plays: playing, at the live second.
    mini("Play")
    wait_state("PLAYING", 10)
    time.sleep(3)
    o2 = desktop("offer", {"handledChanged": None, "playingHere": False})
    st2 = ui.media_state(APP)
    assert o2 and o2["kind"] == "playing" and near(o2["positionMs"], st2["position"], 2000), (o2, st2)
    return f"stored {took:.1f} s after pause (index {q['currentIndex']}, {q['positionMs']} ms); desktop offer paused→{o['index']}/{o['positionMs']}, playing→{o2['positionMs']} vs phone {st2['position']}"


def case4():
    s = album_songs("Cold Harbour")
    ids = [x["id"] for x in s]
    desktop("save", {"ids": ids, "index": 0, "position": 5000})
    desktop("report", {"id": s[0]["id"], "state": "playing", "positionMs": 5000})
    start_fresh()
    assert (pill(15) or "").startswith("Playing on ClearPlay desktop"), "no offer"
    tap_pill_button("Continue here")
    wait_state("PLAYING", 20)
    q = wait_changed("", 10)
    # The desktop keeps playing (its Now Playing entry stays "playing"); the phone must not see
    # itself left behind, across its 60 s check and a song change.
    desktop("report", {"id": s[0]["id"], "state": "playing", "positionMs": 20000})
    end = time.time() + 75
    while time.time() < end:
        t = pill(1)
        assert not (t or "").startswith("Continued on"), f"phone shows {t!r}"
        time.sleep(4)
        desktop("report", {"id": s[0]["id"], "state": "playing", "positionMs": 20000})
    lb = desktop("leftBehind", {"queueIds": ids})
    assert lb["leftBehind"] and lb["leftBehind"]["device"] == "ClearPlay Android", lb
    return f"no pill on the phone for 75 s; desktop's leftBehind → {lb['leftBehind']}"


def case5():
    s = album_songs("Neon Tides")
    ids = [x["id"] for x in s]
    start_fresh()
    play_album("Neon Tides")
    time.sleep(5)  # let the phone save its queue
    st = wait_state("PLAYING", 5)
    # The desktop continues: saves the same queue and plays the phone's current song.
    cur = ids[st["item"]]
    desktop("save", {"ids": ids, "index": st["item"], "position": 1000})
    desktop("report", {"id": cur, "state": "playing", "positionMs": 1000})
    t = None
    end = time.time() + 140
    while time.time() < end and not t:
        desktop("report", {"id": cur, "state": "playing", "positionMs": 1000})
        t = pill(5)
    assert t == "Continued on ClearPlay desktop", f"pill {t!r}"
    stored = changed_now()
    # Over 6 s, and across a natural song change, the phone makes no save and keeps playing.
    first_item = ui.media_state(APP)["item"]
    end = time.time() + 75
    saw_change = False
    while time.time() < end:
        st = ui.media_state(APP)
        assert st["state"] == "PLAYING", f"phone paused by itself: {st}"
        assert changed_now() == stored, "the phone saved while left behind"
        if st["item"] != first_item:
            saw_change = True
            time.sleep(6)
            assert changed_now() == stored, "saved after the natural song change"
            break
        time.sleep(2)
    assert saw_change, "no natural song change seen"
    assert pill(2) == "Continued on ClearPlay desktop", "the pill closed on a natural song change"
    tap_pill_button("Pause here")
    wait_state("PAUSED", 5)
    time.sleep(3)
    assert changed_now() == stored, "Pause here saved"
    return "pill shown; no save over the natural song change; Pause here paused without saving; never paused by itself"


def case6():
    s = album_songs("Велосипед")
    ids = [x["id"] for x in s[:4]]
    nd("savePlayQueue", client="Symfonium", post=[("id", i) for i in ids] + [("current", ids[2]), ("position", "17000")])
    nd("scrobble", {"id": ids[0], "submission": "false"}, client="Symfonium")
    start_fresh()
    text = pill(15)
    want = f"Saved by Symfonium · {s[2]['title']} · just now"
    assert text == want, f"pill {text!r}, want {want!r}"
    tap_pill_button("Continue")
    t0 = time.time()
    wait_state("PLAYING", 20)
    st = ui.media_state(APP)
    expect = 17000 + (time.time() - t0) * 1000
    assert st["item"] == 2 and near(st["position"], expect, 2000), f"{st} vs {expect:.0f} (saved position, not Symfonium's live one)"
    return f"'{text}'; started at the saved song/position {st['position']} ms"


def scan(full=True):
    nd("startScan", {"fullScan": "true" if full else "false"})
    time.sleep(1)
    for _ in range(60):
        if not nd("getScanStatus")["scanStatus"]["scanning"]:
            return
        time.sleep(0.5)


def native_token():
    req = urllib.request.Request(f"{ND}/auth/login", data=json.dumps({"username": "admin", "password": "test1234"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["token"]


def purge_missing():
    tok = native_token()
    req = urllib.request.Request(f"{ND}/api/missing", method="DELETE", headers={"X-ND-Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status


def case7():
    s = album_songs("Cold Harbour")
    ids = [x["id"] for x in s[:4]]
    desktop("save", {"ids": ids, "index": 2, "position": 12000})
    desktop("report", {"id": ids[2], "state": "paused", "positionMs": 12000})
    # Delete the first song's file, rescan, purge missing files.
    path = os.path.join(MUSIC, s[0]["path"])
    moved = path + ".e2e-away"
    os.rename(path, moved)
    try:
        scan()
        status = purge_missing()
        q = server_queue()
        assert len(q["entries"]) == 3 and q["currentIndex"] == 2, f"server queue after purge: {q['currentIndex']} of {len(q['entries'])}"
        desktop("report", {"id": ids[2], "state": "paused", "positionMs": 12000})
        start_fresh()
        text = pill(15)
        want = f"Paused on ClearPlay desktop · {s[2]['title']} · just now"
        assert text == want, f"pill {text!r}, want {want!r}"
        tap_pill_button("Continue")
        t0 = time.time()
        wait_state("PLAYING", 20)
        st = ui.media_state(APP)
        assert st["title"] == s[2]["title"] and st["item"] == 1, f"started at {st}"
        assert near(st["position"], 12000 + (time.time() - t0) * 1000, 2000), st
        return f"purge HTTP {status}; server index 2 now pointed at {q['entries'][2]['title']!r}; phone started {st['title']!r} at {st['position']} ms"
    finally:
        os.rename(moved, path)
        scan()


def case8():
    s = album_songs("Paper Lanterns")
    ids = [x["id"] for x in s[:3]]
    desktop("save", {"ids": ids, "index": 0, "position": 3000})
    desktop("report", {"id": ids[0], "state": "paused", "positionMs": 3000})
    start_fresh()
    assert pill(15), "no offer"
    dismiss_pill()
    time.sleep(1)
    assert pill(2) is None
    start_fresh()
    assert no_pill(6) is None, "× didn't hide it"
    desktop("save", {"ids": ids, "index": 1, "position": 4000})
    start_fresh()
    assert pill(15), "not offered after the next save"
    # Playing something else here hides it for good.
    play_album("Cold Harbour")
    assert pill(3) is None
    mini("Pause")
    time.sleep(1)
    start_fresh()
    assert no_pill(6) is None, "offered again after playing here"
    return "× hid it until the next save; playing here hid it for good"


def set_clock(offset_s):
    """Moves the device clock (emulator, adb root)."""
    ui.adb("root", check=False)
    time.sleep(2)
    if offset_s == 0:
        ui.shell("settings put global auto_time 1")
        return
    ui.shell("settings put global auto_time 0")
    t = int(time.time()) + offset_s
    ui.shell("date @" + str(t))


def case9():
    results = []
    s = album_songs("Neon Tides")
    ids = [x["id"] for x in s[:3]]
    try:
        for offset, age in ((600, "10 min ago"), (-600, "just now")):
            set_clock(offset)
            time.sleep(2)
            desktop("save", {"ids": ids, "index": 1, "position": 8000})
            desktop("report", {"id": ids[1], "state": "paused", "positionMs": 8000})
            start_fresh()
            text = pill(15)
            want = f"Paused on ClearPlay desktop · {s[1]['title']} · {age}"
            assert text == want, f"clock {offset:+} s: pill {text!r}, want {want!r}"
            tap_pill_button("Continue")
            wait_state("PLAYING", 20)
            mini("Pause")
            time.sleep(2)
            start_fresh()
            assert no_pill(6) is None, f"clock {offset:+} s: offered again after Continue"
            results.append(f"{offset:+d} s → '{age}'")
    finally:
        set_clock(0)
    return "; ".join(results)


def case11():
    s = album_songs("Neon Tides")
    start_fresh()
    play_album("Neon Tides")
    time.sleep(6)
    # Background: saves at once.
    before = changed_now()
    background()
    q = wait_changed(before, 2.5)
    assert q and q["changedBy"] == ANDROID, "no save on going to the background"
    foreground()
    # Service stopping: pause (saved), a queue edit (saved 4 s later), then the task is removed
    # within those 4 s: the stop saves at once.
    mini("Pause")
    q = wait_changed(q["changed"], 3)
    before = q["changed"]
    n = len(q["entries"])
    open_full_queue_and_remove_last()
    t0 = time.time()
    remove_task()
    q2 = wait_changed(before, 3.5)
    assert q2 and len(q2["entries"]) == n - 1, f"no immediate save when the service stopped ({time.time() - t0:.1f} s)"
    took = time.time() - t0
    # Offline: nothing saved; back online: the first look runs.
    start_fresh()
    play_album("Neon Tides")
    time.sleep(5)
    stored = changed_now()
    app_logcat_clear()
    ui.shell("svc wifi disable; svc data disable")
    time.sleep(8)
    mini("Pause")
    time.sleep(3)
    mini("Play")
    time.sleep(2)
    background()
    time.sleep(2)
    assert changed_now() == stored, "saved while offline"
    ui.shell("svc wifi enable; svc data enable")
    end = time.time() + 60
    looked = False
    while time.time() < end and not looked:
        looked = "look:" in app_log()
        time.sleep(2)
    assert looked, "no look after coming back online"
    foreground()
    mini("Pause")
    return f"background save ok; service-stop save {took:.1f} s after the task went; offline: no save; online again: look ran"


def open_full_queue_and_remove_last():
    nodes = ui.dump()
    nxt = [n for n in nodes if n["desc"] == "Next" and 1500 < n["center"][1] < 2150][-1]
    ui.tap_xy(300, nxt["center"][1])
    ui.wait("Queue", timeout=10)
    ui.tap("Queue", exact=True)
    time.sleep(1.5)
    removes = [n for n in ui.dump() if n["desc"] == "Remove"]
    ui.tap_xy(*removes[-1]["center"])
    time.sleep(0.3)


def remove_task():
    out = ui.shell("am stack list")
    m = re.search(r"taskId=(\d+): " + re.escape(APP), out)
    if not m:
        ids = re.findall(r"taskId=(\d+):[^\n]*" + re.escape(APP), out)
        m = ids and re.match(r"(\d+)", ids[0])
    ui.shell(f"am stack remove {m.group(1)}")


def case10():
    """2 500 songs with phone songs mixed in, current at 1 510 → 1 000 songs, currentIndex 100, no local: ids."""
    songs = nd("search3", {"query": "", "songCount": 500, "albumCount": 0, "artistCount": 0})["searchResult3"]["song"]
    mp3 = [x for x in songs if x["suffix"] == "mp3"]
    marker = next(x for x in mp3 if x["title"] == "Ember")
    others = [x for x in mp3 if x["title"] != "Ember"]
    ids = [others[i % len(others)]["id"] for i in range(1510)] + [marker["id"]] + [others[i % len(others)]["id"] for i in range(989)]
    name = "E2E 2500"
    for p in nd("getPlaylists")["playlists"].get("playlist", []):
        if p["name"] == name:
            nd("deletePlaylist", {"id": p["id"]})
    nd("createPlaylist", client="e2e", post=[("name", name)] + [("songId", i) for i in ids])
    start_fresh()
    open_tab("Library")
    ui.tap("Playlists", exact=True)
    ui.tap(name, exact=True)
    time.sleep(3)
    # Find the one "Ember" row (row 1 511) and play from it.
    found = None
    for _ in range(400):
        rows = [n for n in ui.dump() if n["text"] == "Ember"]
        if rows:
            found = rows[0]
            break
        ui.swipe(540, 1800, 540, 400, 120)
        time.sleep(0.3)
    assert found, "row 1 511 not found"
    ui.tap_xy(*found["center"])
    wait_state("PLAYING", 20)
    st = ui.media_state(APP)
    assert st["item"] == 1510, f"current item {st['item']}"
    # Phone songs mixed in: offline, the phone's own music shows; play two of them next.
    ui.shell("svc wifi disable; svc data disable")
    time.sleep(8)
    ui.key("KEYCODE_BACK"); time.sleep(1)
    open_tab("Library")
    ui.tap("Songs", exact=True)
    time.sleep(2)
    phone_rows = [n for n in ui.dump() if n["desc"] == "More"][:2]
    for r in phone_rows:
        ui.tap_xy(*r["center"])
        ui.tap("Play next", exact=True)
        time.sleep(1)
    ui.shell("svc wifi enable; svc data enable")
    time.sleep(10)
    before = changed_now()
    mini("Pause")
    q = wait_changed(before, 5)
    assert q, "no save"
    local = [e for e in q["entries"] if e["id"].startswith("local:")]
    assert len(q["entries"]) == 1000 and q["currentIndex"] == 100 and not local, f"{len(q['entries'])} songs, index {q['currentIndex']}, {len(local)} local"
    assert q["entries"][100]["id"] == marker["id"]
    return f"server got {len(q['entries'])} songs, currentIndex {q['currentIndex']}, no local: ids (phone songs queued next: {len(phone_rows)})"


def case12():
    """Every read above waits for Navidrome to have stored the save (wait_changed)."""
    before = changed_now()
    desktop("save", {"ids": [album_songs("Neon Tides")[0]["id"]], "index": 0, "position": 0})
    q = wait_changed(before, 10)
    assert q and q["changed"] != before
    return "reads wait until changed has moved on (helper wait_changed)"


CASES = {1: case1, 2: case2, 3: case3, 4: case4, 5: case5, 6: case6, 7: case7, 8: case8, 9: case9, 10: case10, 11: case11, 12: case12}


def main():
    wanted = [int(x) for x in sys.argv[1:]] or list(CASES)
    ensure_signed_in()
    set_sync(True)
    results = {}
    for n in wanted:
        log(f"--- case {n}")
        t0 = time.time()
        try:
            detail = CASES[n]()
            results[n] = {"ok": True, "detail": detail, "seconds": round(time.time() - t0)}
            log(f"PASS case {n}: {detail}")
        except Exception as e:
            shot = os.path.join(SHOTS, f"e2e-case{n}-{int(time.time())}.png")
            try:
                ui.screenshot(shot)
            except Exception:
                pass
            results[n] = {"ok": False, "detail": f"{type(e).__name__}: {e}", "screenshot": shot}
            log(f"FAIL case {n}: {type(e).__name__}: {e}")
        try:
            ui.shell("svc wifi enable; svc data enable")
            st = ui.media_state(APP)
            if st and st["state"] == "PLAYING":
                ui.shell("cmd media_session dispatch pause")
                wait_state("PAUSED", 10)
            # Let the phone's own pause save land before the next case saves as the desktop.
            time.sleep(3)
        except Exception:
            pass
    out = os.environ.get("RESULTS")
    if out:
        json.dump(results, open(out, "w"), indent=1)
    ok = all(r["ok"] for r in results.values())
    log("ALL PASS" if ok else "SOME FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
