"""Requests per minute at the fault proxy while the app idles: paused + app open, paused + background,
playing + background (Continue on other devices as set in the app). Usage: ANDROID_SERIAL=... python3 net_idle.py [seconds]"""
import json, os, sys, time
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


def count(label):
    f.clear()
    time.sleep(SECS)
    reqs = f.proxy("/__fault/log").get("requests", {})
    print(label, json.dumps(reqs), flush=True)
    return reqs


res = {}
ui.shell(f"am start -n {f.ACTIVITY}")
time.sleep(3)
ui.shell("cmd media_session dispatch pause")
time.sleep(3)
res["paused, app open"] = count("paused, app open")
to_background()
time.sleep(3)
res["paused, background"] = count("paused, background")
ui.shell("cmd media_session dispatch play")
f.wait_state(lambda x: x["state"] == "PLAYING", 20)
res["playing, background"] = count("playing, background")
ui.shell("cmd media_session dispatch pause")
out = os.environ.get("RESULTS")
if out:
    json.dump(res, open(out, "w"), indent=1)
