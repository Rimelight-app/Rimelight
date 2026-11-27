"""Memory pressure and process death (Normal):
1. App open on "Big Album" scrolled down: am send-trim-memory RUNNING_CRITICAL → still the same page?
2. In the background: send-trim-memory COMPLETE → back: page, scroll, player kept?
3. Playing in the background, the process is killed as root (kill -9) → back to the app: page,
   scroll position, queue and player state restored?
Usage: ANDROID_SERIAL=... python3 pressure.py
"""
import json, os, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402

APP = f.APP


def snapshot(label):
    texts = ui.texts()
    st = ui.media_state(APP)
    tracks = [t for t in texts if t.startswith("Track ")]
    r = {"page": "ALBUM" in texts and "Big Album" in texts, "first_track": tracks[0] if tracks else None,
         "player": st and f"{st['state']} {st['title']} @{st['position']}"}
    print(label, json.dumps(r), flush=True)
    return r


def main():
    ui.adb("root", check=False)
    time.sleep(2)
    res = {}
    f.open_album("Big Album", wait_for="ALBUM")
    pill = [n for n in ui.dump() if n["text"] == "Play" and n["center"][1] < ui.sy(1700)]
    ui.tap_xy(*pill[0]["center"])
    f.wait_state(lambda x: x["state"] == "PLAYING", 20)
    for _ in range(3):
        ui.swipe(ui.sx(540), ui.sy(1700), ui.sx(540), ui.sy(600), 300)
        time.sleep(0.8)
    time.sleep(1)
    res["before"] = snapshot("before")
    ui.shell(f"am send-trim-memory {APP} RUNNING_CRITICAL", check=False)
    time.sleep(3)
    res["trim RUNNING_CRITICAL (open)"] = snapshot("trim RUNNING_CRITICAL (open)")
    ui.key("KEYCODE_HOME")
    time.sleep(2)
    ui.shell(f"am send-trim-memory {APP} COMPLETE", check=False)
    time.sleep(3)
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(3)
    res["trim COMPLETE (background) → back"] = snapshot("trim COMPLETE (background) → back")
    ui.key("KEYCODE_HOME")
    time.sleep(2)
    pid = ui.shell(f"pidof {APP}").strip()
    ui.shell(f"kill -9 {pid}", check=False)
    time.sleep(3)
    res["after kill, before return"] = {"player": (lambda s: s and f"{s['state']} {s['title']}")(ui.media_state(APP)), "pid": ui.shell(f"pidof {APP}").strip()}
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(6)
    res["killed while playing → back"] = snapshot("killed while playing → back")
    ui.shell("cmd media_session dispatch play")
    st = f.wait_state(lambda x: x["state"] == "PLAYING", 20)
    res["Play after the kill"] = st and f"{st['state']} {st['title']} @{st['position']}"
    ui.shell("cmd media_session dispatch pause")
    print(json.dumps(res, indent=1))
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1)


if __name__ == "__main__":
    main()
