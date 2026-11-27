"""Fault cases for the 1.6.1 audit (known suspects A, C, F), driven through the app's UI on an
emulator, with the desktop's fault proxy (git show v0.6.2:tools/dev-rig/perf/fault-proxy.mjs)
between the app and the big rig. Each case prints what happened and PASS / FAIL against the
expected behaviour (the same as desktop 0.6.1). Run it before and after the fixes.

Usage: ANDROID_SERIAL=emulator-5556 python3 fault_cases.py [case ...]
Env: APP (package, default com.tonihk00.clearplay), PROXY (host URL of the proxy, default
http://127.0.0.1:4534), ND (rig, default http://127.0.0.1:4545), RESULTS (JSON file to write).
The app must be signed in to http://10.0.2.2:4534 (the proxy).
"""
import json, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402

APP = os.environ.get("APP", "com.tonihk00.clearplay")
ACTIVITY = f"{APP}/com.tonihk00.clearplay.MainActivity"
PROXY = os.environ.get("PROXY", "http://127.0.0.1:4534")
ND = os.environ.get("ND", "http://127.0.0.1:4545")
ALBUM = "Fault Test"


def nd(ep, **p):
    q = {"u": "admin", "p": "test1234", "v": "1.16.1", "c": "audit", "f": "json", **p}
    return json.load(urllib.request.urlopen(f"{ND}/rest/{ep}?{urllib.parse.urlencode(q)}", timeout=20))["subsonic-response"]


def proxy(path, body=None):
    req = urllib.request.Request(PROXY + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"}, method="POST" if body is not None or path.endswith(("clear", "reset")) else "GET")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r) if r.headers.get("Content-Type", "").startswith("application/json") else r.read()


def rules(rs):
    proxy("/__fault/rules", rs)


def clear():
    proxy("/__fault/clear", [])
    proxy("/__fault/log/reset", [])


def stream_count(song_id):
    log = proxy("/__fault/log")
    return sum(1 for r in log.get("recent", []) if r.get("endpoint") == "stream" and r.get("id") == song_id)


SONGS = None


def songs():
    global SONGS
    if SONGS is None:
        al = nd("search3", query=ALBUM, albumCount=5, songCount=0, artistCount=0)["searchResult3"]["album"][0]
        SONGS = nd("getAlbum", id=al["id"])["album"]["song"]
    return SONGS


def state():
    return ui.media_state(APP)


def wait_state(pred, timeout):
    end = time.time() + timeout
    s = state()
    while time.time() < end:
        s = state()
        if s and pred(s):
            return s
        time.sleep(0.4)
    return s


def watch_messages(seconds):
    """Texts that look like playback messages, seen in the UI over [seconds]."""
    seen = []
    end = time.time() + seconds
    while time.time() < end:
        for t in ui.texts():
            if t.startswith("Couldn't") or "in a row" in t or "Playback stopped" in t or "can't be reached" in t.lower():
                if t not in seen:
                    seen.append(t)
        time.sleep(0.3)
    return seen


def open_album(name=ALBUM, wait_for="ALBUM"):
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(2)
    texts = ui.texts()
    if name == ALBUM and "ALBUM" in texts and ALBUM in texts:
        ui.scroll_to(songs()[0]["title"], exact=True, up=True, tries=3)
        return
    for _ in range(3):  # back to a tab's first page
        if "ALBUM" not in ui.texts() and "Couldn't load" not in ui.texts():
            break
        ui.key("KEYCODE_BACK")
        time.sleep(1)
    nodes = ui.dump()
    tabs = [n for n in nodes if n["text"] == "Search" and n["center"][1] > ui.sy(1900)]
    ui.tap_xy(*(tabs[-1]["center"] if tabs else ui.wait("Search", exact=True)["center"]))
    time.sleep(1.5)
    field = [n for n in ui.dump() if "Search" in (n["text"] or "") and n["center"][1] < ui.sy(600)]
    if field:
        ui.tap_xy(*field[0]["center"])
    if ui.find("Clear", exact=True):
        ui.tap("Clear", exact=True)
        time.sleep(0.5)
        field = [n for n in ui.dump() if "Search" in (n["text"] or "") and n["center"][1] < ui.sy(600)]
        if field:
            ui.tap_xy(*field[0]["center"])
    ui.type_text(name)
    end = time.time() + 15
    hits = []
    while time.time() < end and not hits:
        # A result, not the search field (which holds the same text).
        hits = [n for n in ui.dump() if n["text"] == name and n["center"][1] > ui.sy(450)]
        time.sleep(0.5)
    if not hits:
        raise TimeoutError(f"no search result {name!r}: {ui.texts()[:20]}")
    ui.tap_xy(*hits[0]["center"])
    if wait_for:
        ui.wait(wait_for, timeout=15)
    time.sleep(1.5)


def play_row(n):
    """Taps the album's song row n (1-based)."""
    title = songs()[n - 1]["title"]
    row = ui.scroll_to(title, exact=True, tries=4)
    if row["center"][1] > ui.sy(1750):  # under the mini player / tab bar
        ui.swipe(ui.sx(540), ui.sy(1500), ui.sx(540), ui.sy(900), 400)
        time.sleep(1)
        row = ui.wait(title, exact=True, timeout=5)
    ui.tap_xy(*row["center"])


def pause():
    ui.shell("cmd media_session dispatch pause")
    time.sleep(1)


def media(cmd):
    ui.shell(f"cmd media_session dispatch {cmd}")


def result(name, ok, detail):
    print(("PASS " if ok else "FAIL ") + name + ": " + detail, flush=True)
    return {"ok": ok, "detail": detail}


# ---------------------------------------------------------------- A. a song that fails to load

def a1_404_next():
    """Song 3 of 5 returns 404; Next from song 2 → retried once, "Couldn't play …", plays song 4."""
    s = songs()
    clear()
    rules([f"stream:id={s[2]['id']}:404"])
    open_album()
    play_row(2)
    wait_state(lambda x: x["state"] == "PLAYING", 20)
    media("next")
    msgs = watch_messages(10)
    st = wait_state(lambda x: x["state"] == "PLAYING" and x["title"] == s[3]["title"], 10)
    tries = stream_count(s[2]["id"])
    pause()
    ok = st and st["title"] == s[3]["title"] and st["state"] == "PLAYING" and any("Couldn't play" in m for m in msgs) and tries >= 2
    return result("a1_404_next", bool(ok), f"after Next: {st}; messages {msgs}; stream requests for song 3: {tries}")


def a2_three_in_a_row():
    """Songs 2, 3, 4 return 404; play song 1, Next → stops after 3 failures with the message."""
    s = songs()
    clear()
    rules([f"stream:id={x['id']}:404" for x in s[1:4]])
    open_album()
    play_row(1)
    wait_state(lambda x: x["state"] == "PLAYING", 20)
    media("next")
    msgs = watch_messages(15)
    st = state()
    pause()
    ok = st and st["state"] != "PLAYING" and any("3 songs in a row" in m for m in msgs)
    return result("a2_three_in_a_row", bool(ok), f"after 15 s: {st}; messages {msgs}")


def a3_last_song_fails():
    """Song 5 (last) returns 404; Next from song 4 → stops with a message."""
    s = songs()
    clear()
    rules([f"stream:id={s[4]['id']}:404"])
    open_album()
    play_row(4)
    wait_state(lambda x: x["state"] == "PLAYING", 20)
    media("next")
    msgs = watch_messages(10)
    st = state()
    pause()
    ok = st and st["state"] != "PLAYING" and any("Couldn't play" in m for m in msgs)
    return result("a3_last_song_fails", bool(ok), f"after 10 s: {st}; messages {msgs}")


def a4_server_down():
    """The server can't be reached; play a song that isn't downloaded → pause and stay on it (no
    skipping through the queue). Play works again once the server answers. (Taken down before the
    tap: Media3 buffers the next 20-second song ahead, so going down mid-song tests nothing.)"""
    s = songs()
    clear()
    open_album()
    rules(["*:down"])
    play_row(1)
    msgs = watch_messages(15)
    st = state()
    clear()
    time.sleep(2)
    media("play")
    st2 = wait_state(lambda x: x["state"] == "PLAYING", 30)
    pause()
    ok = st and st["title"] == s[0]["title"] and st["state"] != "PLAYING" and st2 and st2["state"] == "PLAYING" and st2["title"] == s[0]["title"]
    return result("a4_server_down", bool(ok), f"down, after Next: {st}; messages {msgs}; server back, Play: {st2}")


def a5_offline_not_downloaded():
    """Wi-Fi and data go off while song 1 plays; Next to song 2 (not downloaded) → pause and stay on
    it, no skipping; online again, Play works. (Song 2's stream hangs at the proxy until then, so
    Media3 can't have buffered it ahead.)"""
    s = songs()
    clear()
    rules([f"stream:id={s[1]['id']}:hang:times=1"])
    open_album()
    play_row(1)
    wait_state(lambda x: x["state"] == "PLAYING", 20)
    time.sleep(2)
    ui.shell("svc wifi disable; svc data disable")
    time.sleep(3)
    media("next")
    msgs = watch_messages(15)
    st = state()
    clear()
    ui.shell("svc wifi enable; svc data enable")
    time.sleep(10)
    media("play")
    st2 = wait_state(lambda x: x["state"] == "PLAYING", 30)
    pause()
    ok = st and st["title"] == s[1]["title"] and st["state"] != "PLAYING" and st2 and st2["state"] == "PLAYING" and st2["title"] == s[1]["title"]
    return result("a5_offline_not_downloaded", bool(ok), f"offline, after Next: {st}; messages {msgs}; online, Play: {st2}")


# ---------------------------------------------------------------- C. end of the queue

def c1_end_of_queue():
    """Last song ends (repeat off) → paused on it at 0, queue kept; after am kill, Resume/PLAY play it from 0."""
    s = songs()
    clear()
    open_album()
    play_row(5)
    st = wait_state(lambda x: x["state"] == "PLAYING", 20)
    # Seek near the end (20 s songs): 17 s in.
    ui.shell("cmd media_session dispatch play")
    end = time.time() + 40
    while time.time() < end:
        st = state()
        if st and st["state"] != "PLAYING":
            break
        time.sleep(1)
    time.sleep(2)
    after = state()
    fgs = "isForeground=true" in ui.shell(f"dumpsys activity services {APP}")
    ui.key("KEYCODE_HOME")
    time.sleep(2)
    ui.shell(f"am kill {APP}")
    time.sleep(2)
    ui.shell(f"am force-stop {APP}")
    time.sleep(2)
    ui.shell("input keyevent KEYCODE_MEDIA_PLAY")
    resumed = wait_state(lambda x: x["state"] == "PLAYING", 25)
    pause()
    ok = (after and after["title"] == s[4]["title"] and after["state"] in ("PAUSED", "STOPPED") and after["position"] < 1500
          and resumed and resumed["title"] == s[4]["title"] and resumed["position"] < 6000)
    return result("c1_end_of_queue", bool(ok), f"after the end: {after} (foreground service {fgs}); after am kill + MEDIA_PLAY: {resumed}")


# ---------------------------------------------------------------- B. Statistics with a failed page

STATS_DIR = f"/data/data/{APP}/files/stats"


def root_sh(cmd):
    ui.adb("root", check=False)
    time.sleep(1)
    return ui.shell(cmd, check=False)


def snapshot_sum():
    return root_sh(f"md5sum {STATS_DIR}/*.json 2>/dev/null").strip()


def open_stats():
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(2)
    nodes = ui.dump()
    tabs = [n for n in nodes if n["text"] == "Stats" and n["center"][1] > ui.sy(1900)]
    ui.tap_xy(*tabs[-1]["center"])


def search3_count():
    return proxy("/__fault/log").get("requests", {}).get("search3", 0)


def stats_texts(seconds):
    seen = []
    end = time.time() + seconds
    while time.time() < end:
        for t in ui.texts():
            if (t.startswith("Couldn't") or "Last synced" in t or "songs played" in t or "Reading" in t) and t not in seen:
                seen.append(t)
        time.sleep(0.5)
    return seen


def b1_failed_page_cold():
    """No snapshot; search3 is dropped after 40 pages → an error, no numbers, nothing saved."""
    clear()
    ui.shell(f"am force-stop {APP}")
    root_sh(f"rm -f {STATS_DIR}/*")
    rules(["search3:drop:after=40"])
    open_stats()
    seen = stats_texts(40)
    saved = snapshot_sum()
    ok = any(t.startswith("Couldn't") for t in seen) and not any("songs played" in t for t in seen) and not saved
    return result("b1_failed_page_cold", bool(ok), f"seen {seen}; snapshot on disk: {saved or 'none'}; search3 requests {search3_count()}")


def b2_full_load_then_failed_refresh():
    """A full cold load (timed); then a refresh with a dropped page → old numbers kept, snapshot unchanged."""
    clear()
    ui.shell(f"am force-stop {APP}")
    root_sh(f"rm -f {STATS_DIR}/*")
    open_stats()
    t0 = time.time()
    end = t0 + 240
    while time.time() < end and not any("songs played" in t for t in ui.texts()):
        time.sleep(0.5)
    took = time.time() - t0
    pages = search3_count()
    time.sleep(2)
    before = snapshot_sum()
    clear()
    rules(["search3:drop:after=20"])
    ref = [n for n in ui.dump() if n["desc"] in ("Refresh", "Refresh statistics")]
    ui.tap_xy(*ref[0]["center"])
    seen = stats_texts(30)
    after = snapshot_sum()
    ok = bool(before) and before == after and any("songs played" in t for t in seen)
    return result("b2_full_load_then_failed_refresh", ok,
                  f"cold load {took:.1f} s, {pages} search3 pages; after failed refresh: seen {seen}; snapshot unchanged {before == after}")


def b3_left_for_good():
    """A cold load starts; the user leaves the app (Back out of it) → no more search3 requests after ~2 s."""
    clear()
    ui.shell(f"am force-stop {APP}")
    root_sh(f"rm -f {STATS_DIR}/*")
    rules(["search3:delay=1000"])  # about 26 s for the whole library: still loading when the user leaves
    open_stats()
    time.sleep(4)
    ui.key("KEYCODE_BACK")  # Stats is a tab root: Back leaves the app (the activity finishes)
    time.sleep(2)
    n1 = search3_count()
    time.sleep(15)
    n2 = search3_count()
    ok = n2 - n1 <= 4
    return result("b3_left_for_good", ok, f"search3 requests 2 s after leaving: {n1}; 15 s later: {n2} (+{n2 - n1})")


# ---------------------------------------------------------------- F. server down at start, errors on a page

def page_texts(seconds=6):
    time.sleep(seconds)
    return ui.texts()


def f1_page_errors():
    """getAlbum fails four ways. Expected: 500 / bad JSON / timeout → an error with Retry (not
    "not found"); 70 → not found; 40 → an offer to log in again. Retry works once the server answers."""
    out = {}
    for action in ("500", "badjson", "error70", "error40", "hang"):
        clear()
        rules([f"getAlbum:{action}"])
        ui.shell(f"am force-stop {APP}")
        time.sleep(1)
        open_album("Big Album", wait_for=None)
        texts = page_texts(25 if action == "hang" else 6)
        out[action] = [t for t in texts if t not in ("Library", "Search", "Stats", "Settings", "Back")][:6]
        clear()
        retry = ui.find("Retry", exact=True)
        if retry:
            ui.tap_xy(*retry["center"])
            time.sleep(4)
            out[action + " → Retry"] = "Track 001" in ui.texts()
        ui.key("KEYCODE_BACK")
        time.sleep(1)
    def has(k, *words):
        return any(any(w in t for w in words) for t in out.get(k, []))
    ok = (all(out.get(k + " → Retry") for k in ("500", "badjson", "hang"))
          and has("error70", "not found", "Not found") and not has("500", "not found", "Not found", "isn't a Navidrome")
          and has("error40", "log in", "Log in", "Sign in"))
    return result("f1_page_errors", bool(ok), json.dumps(out, ensure_ascii=False))


def hide_keyboard():
    """A soft keyboard covers the tab bar (Gboard comes back by itself on these images)."""
    if "mInputShown=true" in ui.shell("dumpsys input_method | grep mInputShown", check=False):
        ui.key("KEYCODE_BACK")
        time.sleep(0.8)


def dismiss_anr():
    """A system "isn't responding" dialog (the launcher or System UI on the slow Weak profile): Wait."""
    for _ in range(3):
        nodes = ui.dump()
        if not any(n["text"].endswith("responding") for n in nodes):
            return
        w = [n for n in nodes if n["text"] == "Wait"]
        if w:
            ui.tap_xy(*w[0]["center"])
        time.sleep(2)


def library_albums():
    """Library at its first page (tapping the current tab pops to it), Albums tab selected."""
    dismiss_anr()
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(1.5)
    dismiss_anr()
    hide_keyboard()
    if "Close sheet" in ui.texts():  # a song menu / sleep timer is open
        ui.key("KEYCODE_BACK")
        time.sleep(1)
    texts = ui.texts()
    if "Lyrics" in texts and "Queue" in texts:  # the full player
        ui.key("KEYCODE_BACK")
        time.sleep(1.5)
    for _ in range(2):
        lib = [n for n in ui.dump() if n["text"] == "Library" and n["center"][1] > ui.sy(1900)]
        ui.tap_xy(*lib[-1]["center"])
        time.sleep(1.2)
    show_tab("Albums")


def show_tab(tab):
    """The Library's tab row remembers its scroll: swipe it back until [tab] shows, then tap it."""
    for _ in range(5):
        if ui.find(tab, exact=True):
            break
        t = ui.find("Songs", exact=True) or ui.find("Favorites", exact=True) or ui.find("Artists", exact=True) or ui.find("Playlists", exact=True)
        if t is None:
            raise TimeoutError(f"no Library tab row: {ui.texts()[:20]}")
        ui.swipe(t["center"][0], t["center"][1], ui.sx(1000), t["center"][1], 300)
        time.sleep(1)
    ui.tap(tab, exact=True)
    time.sleep(1.5)


def library_root():
    ui.shell(f"am start -n {ACTIVITY}")
    time.sleep(1.5)
    for _ in range(3):
        if "ALBUM" not in ui.texts() and "PLAYLIST" not in ui.texts() and "Couldn't load" not in ui.texts():
            break
        ui.key("KEYCODE_BACK")
        time.sleep(1)
    lib = [n for n in ui.dump() if n["text"] == "Library" and n["center"][1] > ui.sy(1900)]
    ui.tap_xy(*lib[-1]["center"])
    time.sleep(1.5)


def f2_server_down_at_start():
    """The server is off when the app starts: no logout / login screen; the app opens with what's on
    the device, says the server can't be reached, and comes back by itself when it answers."""
    clear()
    ui.shell(f"am force-stop {APP}")
    rules(["*:down"])
    ui.shell(f"am start -n {ACTIVITY}")
    texts = page_texts(12)
    login = "Connect" in texts
    offline = "Offline" in texts
    clear()
    t0 = time.time()
    back = False
    while time.time() - t0 < 45:
        if "Offline" not in ui.texts():
            back = True
            break
        time.sleep(2)
    ok = not login and offline and back
    return result("f2_server_down_at_start", ok, f"login screen {login}; 'Offline' shown {offline}; first texts {texts[:10]}; back online by itself {back} after {time.time() - t0:.0f} s")


CASES = {f.__name__: f for f in (a1_404_next, a2_three_in_a_row, a3_last_song_fails, a4_server_down,
                                  a5_offline_not_downloaded, c1_end_of_queue,
                                  b1_failed_page_cold, b2_full_load_then_failed_refresh, b3_left_for_good,
                                  f1_page_errors, f2_server_down_at_start)}


def main():
    names = sys.argv[1:] or list(CASES)
    res = {}
    for n in names:
        try:
            res[n] = CASES[n]()
        except Exception as e:
            res[n] = result(n, False, f"error {type(e).__name__}: {e}")
        finally:
            try:
                clear()
                ui.shell("svc wifi enable; svc data enable")
            except Exception:
                pass
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
