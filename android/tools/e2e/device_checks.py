"""Device checks for ClearPlay Android 1.6.0 sections 0 (Android 17 background audio), A (saved
queue + playback resumption), C (app shortcuts) and D (Statistics refresh), driven through adb
and the app's UI. Usage: ANDROID_SERIAL=emulator-5554 python3 device_checks.py [names...]
"""
import json, os, re, subprocess, sys, tempfile, time
import ui
from handoff_e2e import (APP, ACTIVITY, album_songs, background, ensure_signed_in, foreground, log, mini,
                         open_tab, play_album, start_fresh, wait_state)

SHORTCUT = "com.tonihk00.clearplay.action."
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())


def state():
    return ui.media_state(APP)


def fgs():
    out = ui.shell(f"dumpsys activity services {APP}")
    return "isForeground=true" in out


# ---------------------------------------------------------------- 0. Android 17

def sleep_timer_resume():
    start_fresh()
    play_album("Neon Tides")
    nodes = ui.dump()
    nxt = [n for n in nodes if n["desc"] == "Next" and 1500 < n["center"][1] < 2150][-1]
    ui.tap_xy(300, nxt["center"][1])
    ui.tap("Sleep timer")
    ui.tap("End of this song", exact=True)
    s = wait_state("PAUSED", 90)
    background()
    time.sleep(20)
    ui.shell("cmd statusbar expand-notifications")
    time.sleep(2)
    play = [n for n in ui.dump() if n["desc"] == "Play" or n["text"] == "Play"]
    ui.tap_xy(*play[0]["center"])
    time.sleep(3)
    ui.shell("cmd statusbar collapse")
    s2 = state()
    assert s2["state"] == "PLAYING", s2
    ui.shell("cmd media_session dispatch pause")
    return f"paused at the end of '{s['title']}', resumed from the notification ({s2['title']})"


def media_button():
    s = state()
    if not s or s["state"] != "PLAYING":
        foreground(); mini("Play"); wait_state("PLAYING", 10)
    background()
    ui.key("KEYCODE_MEDIA_PLAY_PAUSE"); time.sleep(2)
    a = state()["state"]
    ui.key("KEYCODE_MEDIA_PLAY_PAUSE"); time.sleep(3)
    b = state()["state"]
    assert (a, b) == ("PAUSED", "PLAYING"), (a, b)
    ui.key("KEYCODE_MEDIA_PAUSE"); time.sleep(1)
    return "play/pause key: PAUSED then PLAYING"


def queue_end_leaves_foreground():
    """The queue plays out: the service leaves the foreground at once (not after 10 minutes)."""
    start_fresh()
    play_album("Neon Tides", song_index=6)  # the last song
    s = state()
    # Jump close to its end through the full player's seek bar is fiddly; wait for it instead.
    end = time.time() + 90
    while time.time() < end and state()["state"] == "PLAYING":
        time.sleep(2)
    time.sleep(3)
    assert not fgs(), "still a foreground service after the queue ended"
    return f"'{s['title']}' played out; service no longer in the foreground"


# ---------------------------------------------------------------- A. resumption

def kill_and_resume():
    start_fresh()
    play_album("Paper Lanterns", song_index=2)
    time.sleep(12)
    mini("Pause")
    time.sleep(2)
    before = state()
    background()
    time.sleep(1)
    # Media3 keeps a paused service in the foreground for 10 minutes; Android (and am kill) can
    # only kill the app after that. Wait for it, then kill it the way Android would.
    end = time.time() + 12 * 60
    while time.time() < end and fgs():
        time.sleep(15)
    ui.shell(f"am kill {APP}")
    time.sleep(3)
    pid = ui.shell(f"pidof {APP}", check=False).strip()
    # am kill only kills cached processes; a started (non-foreground) service process is what
    # the low-memory killer takes on a phone: kill it the same way (no callbacks).
    how = "am kill"
    if pid:
        ui.shell(f"run-as {APP} kill -9 {pid}", check=False)
        how = "am kill declined (started service); kill -9 like the low-memory killer"
        time.sleep(3)
        new_pid = ui.shell(f"pidof {APP}", check=False).strip()
        assert new_pid != pid, "process still alive"
    ui.key("KEYCODE_MEDIA_PLAY")
    s = wait_state("PLAYING", 20)
    s = state()
    assert s["title"] == before["title"], (before, s)
    assert abs(s["position"] - before["position"]) <= 1000 + 3000, (before, s)  # ±1 s plus start-up
    ui.shell("cmd media_session dispatch pause")
    return f"{how}, at '{before['title']}' {before['position']} ms → resumed at {s['position']} ms"


def reboot_resume_card():
    start_fresh()
    play_album("Cold Harbour", song_index=1)
    time.sleep(5)
    mini("Pause")
    time.sleep(2)
    title = state()["title"]
    restart = os.environ.get("EMU_RESTART")
    if restart:
        # Emulator: a cold boot (adb reboot can crash a software-rendered emulator).
        ui.adb("emu", "kill", check=False)
        time.sleep(8)
        subprocess.Popen(restart, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    else:
        ui.adb("reboot", check=False)
    time.sleep(10)
    ui.adb("wait-for-device", timeout=300)
    for _ in range(100):
        if ui.shell("getprop sys.boot_completed", check=False).strip() == "1":
            break
        time.sleep(3)
    time.sleep(25)
    out = ui.shell("dumpsys media_session")
    # The resume card: System UI asks the app's media browser for its recent item (Media3 →
    # onPlaybackResumption(isForPlayback = false)); dumpsys lists the app's session/recent item.
    found = title in out or title in ui.shell("dumpsys activity service com.android.systemui", check=False)
    ui.shell("cmd statusbar expand-notifications")
    time.sleep(3)
    shade = ui.texts()
    ui.shell("cmd statusbar collapse")
    assert found or title in " ".join(shade), f"'{title}' not in the resume card / media_session"
    return f"after reboot the resume card shows '{title}'"


def other_server_not_restored():
    """queue.json from another account: KEYCODE_MEDIA_PLAY after a kill doesn't restore it."""
    path = f"/data/data/{APP}/files/queue.json"
    raw = ui.shell(f"run-as {APP} cat files/queue.json")
    d = json.loads(raw)
    d2 = dict(d, server="someone@http://elsewhere:4533")
    tmp = "/data/local/tmp/q.json"
    open(os.path.join(SHOTS, "q.json"), "w").write(json.dumps(d2))
    ui.adb("push", os.path.join(SHOTS, "q.json"), tmp)
    ui.shell(f"am force-stop {APP}")
    ui.shell(f"chmod 644 {tmp}; run-as {APP} cp {tmp} files/queue.json")
    ui.key("KEYCODE_MEDIA_PLAY")
    time.sleep(8)
    s = state()
    assert not s or s["state"] != "PLAYING", f"restored another account's queue: {s}"
    # Put the real one back.
    open(os.path.join(SHOTS, "q.json"), "w").write(raw)
    ui.adb("push", os.path.join(SHOTS, "q.json"), tmp)
    ui.shell(f"am force-stop {APP}; run-as {APP} cp {tmp} files/queue.json")
    return "a queue saved for another server/account isn't restored"


def missing_id_dropped():
    """queue.json whose current song id the server doesn't have (pre-0.64 id): dropped, no crash."""
    raw = ui.shell(f"run-as {APP} cat files/queue.json")
    d = json.loads(raw)
    i = d["index"]
    nxt = d["songs"][i + 1]["title"] if i + 1 < len(d["songs"]) else None
    d["songs"][i]["id"] = "0123456789abcdef0123"  # an old-style id Navidrome 0.64 doesn't know
    p = os.path.join(SHOTS, "q.json")
    open(p, "w").write(json.dumps(d))
    ui.adb("push", p, "/data/local/tmp/q.json")
    ui.shell(f"am force-stop {APP}; chmod 644 /data/local/tmp/q.json; run-as {APP} cp /data/local/tmp/q.json files/queue.json")
    ui.adb("logcat", "-c", check=False)
    ui.key("KEYCODE_MEDIA_PLAY")
    s = wait_state("PLAYING", 25)
    crashed = "FATAL EXCEPTION" in ui.adb("logcat", "-d", "-b", "crash", check=False)
    assert not crashed, "crashed"
    assert s["title"] == nxt, f"started '{s['title']}', want the next song '{nxt}'"
    ui.shell("cmd media_session dispatch pause")
    return f"missing current id dropped; resumed at the next song '{nxt}', no crash"


# ---------------------------------------------------------------- C. shortcuts

def shortcut_labels():
    out = ui.shell("dumpsys shortcut")
    i = out.find(f"Package: {APP}")
    j = out.find("Package: ", i + 10)
    block = out[i:j if j > 0 else i + 6000]
    labels = re.findall(r"shortLabel=([^,\n]+)", block)
    return labels, block


def shortcuts():
    results = []
    labels, block = shortcut_labels()
    title = state()["title"] if state() else None
    assert "Shuffle library" in labels and "Downloads" in labels, labels
    resume = [l for l in labels if l.startswith("Resume")]
    assert resume and (title is None or resume[0] == f"Resume · {title}"), (labels, title)
    results.append(f"labels {labels}")
    for when in ("cold", "open"):
        for action, check in (("SHUFFLE", "shuffle"), ("RESUME", "resume"), ("DOWNLOADS", "downloads")):
            if when == "cold":
                ui.shell(f"am force-stop {APP}")
                time.sleep(1)
            ui.shell(f"am start -a {SHORTCUT}{action} -n {ACTIVITY}")
            time.sleep(6)
            if check == "downloads":
                ui.wait("Downloads", timeout=10)
                texts = ui.texts()
                assert any(t.startswith("No downloads yet") or " album" in t for t in texts), texts[:20]
            else:
                s = wait_state("PLAYING", 20)
                ui.shell("cmd media_session dispatch pause")
                time.sleep(1)
            results.append(f"{when}:{action} ok")
    # Resume after am kill.
    s = state()
    background()
    ui.shell(f"am kill {APP}")
    time.sleep(1)
    ui.shell(f"am force-stop {APP}")
    time.sleep(1)
    ui.shell(f"am start -a {SHORTCUT}RESUME -n {ACTIVITY}")
    s2 = wait_state("PLAYING", 25)
    assert s2["title"] == s["title"], (s, s2)
    ui.shell("cmd media_session dispatch pause")
    results.append("RESUME after kill ok")
    labels2, _ = shortcut_labels()
    results.append(f"labels now {labels2}")
    return "; ".join(results)


# ---------------------------------------------------------------- D. statistics

def tappable(node):
    """A Compose button: its icon carries the description, the clickable node around it is the button."""
    x, y = node["center"]
    for n in ui.dump():
        b = n["bounds"]
        if n["clickable"] and n["enabled"] and b[0] <= x <= b[2] and b[1] <= y <= b[3] and (b[2] - b[0]) < 300:
            return True
    return False

def stats_refresh():
    foreground()
    open_tab("Stats")
    b = ui.wait("Refresh statistics", timeout=15)
    assert tappable(b), "button not tappable online"
    ui.tap_xy(*b["center"])
    time.sleep(0.5)
    texts = " ".join(ui.texts())
    ui.wait("Hours listened", timeout=40) if "HOURS" not in texts.upper() else None
    open_tab("Library")
    assert ui.find("Shuffle library") and not ui.find("Refresh statistics"), "Library changed"
    ui.shell("svc wifi disable; svc data disable")
    time.sleep(25)
    open_tab("Stats")
    off = ui.wait("Refresh statistics", timeout=10)
    offline = ui.find("you're offline") is not None
    off_tappable = tappable(off)
    ui.shell("svc wifi enable; svc data enable")
    assert offline, "the app didn't go offline"
    assert not off_tappable, "tappable offline"
    return "button on Statistics (not Library); tap refreshes; disabled offline"


CHECKS = {
    "sleep_timer_resume": sleep_timer_resume, "media_button": media_button, "queue_end": queue_end_leaves_foreground,
    "kill_resume": kill_and_resume, "other_server": other_server_not_restored, "missing_id": missing_id_dropped,
    "reboot_card": reboot_resume_card, "shortcuts": shortcuts, "stats": stats_refresh,
}


def main():
    names = sys.argv[1:] or list(CHECKS)
    ensure_signed_in()
    results = {}
    for n in names:
        log(f"--- {n}")
        try:
            d = CHECKS[n]()
            results[n] = {"ok": True, "detail": d}
            log(f"PASS {n}: {d}")
        except Exception as e:
            p = os.path.join(SHOTS, f"dev-{n}-{int(time.time())}.png")
            try:
                ui.screenshot(p)
            except Exception:
                pass
            results[n] = {"ok": False, "detail": f"{type(e).__name__}: {e}", "screenshot": p}
            log(f"FAIL {n}: {type(e).__name__}: {e}")
        ui.shell("svc wifi enable; svc data enable", check=False)
    out = os.environ.get("RESULTS")
    if out:
        json.dump(results, open(out, "w"), indent=1)
    ok = all(r["ok"] for r in results.values())
    log("ALL PASS" if ok else "SOME FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
