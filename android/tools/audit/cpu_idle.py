"""Idle CPU and wake-ups of the app process, 60 s per state (known states from the audit brief).
CPU % = (utime+stime) of all threads over the window / wall time (100 % = one core).
Wake-ups/s = voluntary + involuntary context switches of all threads / s (a proxy: a thread that
sleeps and wakes counts once per wake). Needs adb root (google_apis image).
Usage: ANDROID_SERIAL=... python3 cpu_idle.py [seconds] [state ...]"""
import json, os, re, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402


def to_background():
    """The app to the background. BG=settings opens the Settings app instead of Home (on the slow
    Weak profile the launcher keeps hitting "isn't responding" when it has to draw)."""
    if os.environ.get("BG") == "settings":
        ui.shell("am start -a android.settings.SETTINGS")
        time.sleep(2)
    else:
        ui.key("KEYCODE_HOME")

SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 60
APP = f.APP
HZ = 100


def pids():
    return ui.shell(f"pidof {APP}").split()


def sample():
    """(cpu ticks, context switches) summed over every thread of the app's processes."""
    script = ("for p in $(pidof %s); do for t in /proc/$p/task/*; do "
              "cat $t/stat 2>/dev/null | awk '{print \"S\", $14+$15}'; "
              "grep ctxt_switches $t/status 2>/dev/null | awk '{print \"C\", $2}'; done; done") % APP
    out = ui.shell(script, check=False)
    ticks = sum(int(l.split()[1]) for l in out.splitlines() if l.startswith("S "))
    ctx = sum(int(l.split()[1]) for l in out.splitlines() if l.startswith("C "))
    return ticks, ctx


def measure(label):
    time.sleep(3)
    if not label.startswith(("playing + background", "paused + background", "playing + screen off")):
        f.dismiss_anr()
    before = ui.media_state(APP)
    t0, c0 = sample()
    w0 = time.time()
    time.sleep(SECS)
    t1, c1 = sample()
    dt = time.time() - w0
    after = ui.media_state(APP)
    r = {"cpu_pct": round((t1 - t0) / HZ / dt * 100, 1), "wakeups_s": round((c1 - c0) / dt, 1),
         "player": f"{before and before['state']} → {after and after['state']} ({after and after['title']})",
         "screen": ui.texts()[:3]}
    print(label, json.dumps(r), flush=True)
    return r


def tab(name):
    nodes = ui.dump()
    t = [n for n in nodes if n["text"] == name and n["center"][1] > ui.sy(1900)]
    if t:
        ui.tap_xy(*t[-1]["center"])
        time.sleep(1.5)


def full_player():
    nxt = [n for n in ui.dump() if n["desc"] == "Next" and ui.sy(1500) < n["center"][1] < ui.sy(2150)]
    ui.tap_xy(ui.sx(300), nxt[-1]["center"][1])
    time.sleep(2)


_queued = False


def play():
    """Plays "Three Hours" (one 3-hour song: playback never ends during a measurement)."""
    global _queued
    st = ui.media_state(APP)
    if st and st["title"] == "Three Hours":
        ui.shell("cmd media_session dispatch play")
    else:
        f.open_album("Three Hours", wait_for="ALBUM")
        # The album's white Play pill (its label is text), not the mini player's Play (a description).
        pill = [n for n in ui.dump() if n["text"] == "Play" and n["center"][1] < ui.sy(1700)]
        ui.tap_xy(*pill[0]["center"])
        _queued = True
        time.sleep(2)
        f.library_albums()
    end = time.time() + 20
    while time.time() < end:
        st = ui.media_state(APP)
        if st and st["state"] == "PLAYING" and st["title"] == "Three Hours":
            return
        time.sleep(0.5)
    raise RuntimeError(f"not playing Three Hours: {st}")


def pause():
    ui.shell("cmd media_session dispatch pause")
    time.sleep(1)


def home_albums():
    f.library_albums()


STATES = {}


def state(fn):
    STATES[fn.__name__] = fn
    return fn


@state
def playing_albums():
    home_albums(); play(); return measure("playing + app open on Albums")


@state
def playing_full_player():
    home_albums(); play(); full_player(); return measure("playing + full player")


@state
def playing_lyrics():
    home_albums(); play(); full_player(); ui.tap("Lyrics", exact=True); time.sleep(1); return measure("playing + lyrics")


@state
def playing_background():
    home_albums(); play(); to_background(); return measure("playing + background")


@state
def playing_screen_off():
    home_albums(); play(); ui.key("KEYCODE_SLEEP"); r = measure("playing + screen off"); ui.key("KEYCODE_WAKEUP"); ui.shell("wm dismiss-keyguard"); return r


@state
def paused_open():
    home_albums(); play(); pause(); return measure("paused + app open")


@state
def paused_background():
    home_albums(); play(); pause(); to_background(); return measure("paused + background")


@state
def nothing_loaded():
    ui.shell(f"am force-stop {APP}")
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(6)
    return measure("nothing loaded (fresh start, app open)")


def main():
    ui.adb("root", check=False)
    time.sleep(2)
    ui.shell("svc power stayon true")
    names = sys.argv[2:] or list(STATES)
    res = {n: STATES[n]() for n in names}
    pause()
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
