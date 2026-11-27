"""Soak: 300 song changes (Next on "Big Album", 500 songs) and 50 screen switches, with PSS / Java /
native / graphics memory (dumpsys meminfo) sampled every 50 song changes, then after a forced GC.
Anything that only grows is a leak candidate. Also counts crashes / ANRs in logcat.

Usage: ANDROID_SERIAL=... python3 soak.py [song_changes] [screen_switches]
"""
import json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402
from big_open import meminfo  # noqa: E402

CHANGES = int(sys.argv[1]) if len(sys.argv) > 1 else 300
SWITCHES = int(sys.argv[2]) if len(sys.argv) > 2 else 50
APP = f.APP


def tab(name):
    t = [n for n in ui.dump() if n["text"] == name and n["center"][1] > ui.sy(1900)]
    if t:
        ui.tap_xy(*t[-1]["center"])


def gc():
    pid = ui.shell(f"pidof {APP}").strip()
    if pid:
        ui.shell(f"kill -10 {pid}", check=False)  # SIGUSR1: ART forces a GC
        time.sleep(3)


def main():
    ui.shell("logcat -c")
    f.open_album("Big Album", wait_for="ALBUM")
    pill = [n for n in ui.dump() if n["text"] == "Play" and n["center"][1] < ui.sy(1700)]
    ui.tap_xy(*pill[0]["center"])
    f.wait_state(lambda x: x["state"] == "PLAYING", 20)
    samples = [("start", 0, meminfo())]
    switches = 0
    tabs = ["Library", "Search", "Stats", "Settings"]
    for i in range(1, CHANGES + 1):
        ui.shell("cmd media_session dispatch next")
        time.sleep(0.4)
        if i % 6 == 0 and switches < SWITCHES:
            tab(tabs[switches % 4])
            switches += 1
        if i % 50 == 0:
            st = ui.media_state(APP)
            samples.append((f"after {i} changes", switches, meminfo()))
            print(samples[-1], st and st["title"], flush=True)
    ui.shell("cmd media_session dispatch pause")
    gc()
    samples.append(("after GC", switches, meminfo()))
    log = ui.shell("logcat -d -b crash,main", check=False)
    crashes = len(re.findall(r"FATAL EXCEPTION|ANR in " + re.escape(APP), log))
    res = {"samples": samples, "crashes_or_anrs": crashes}
    print(json.dumps(res, indent=1))
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
