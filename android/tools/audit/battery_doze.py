"""Battery and Doze (Normal, release build, big rig through the proxy):
1. "Big Album" (6-second songs: a scrobble every few seconds) plays with the screen off for
   MINUTES (default 30), battery unplugged and batterystats reset first; for the last third the
   device is forced into Doze (dumpsys deviceidle force-idle).
   Records: playback still going in Doze? requests per endpoint at the proxy while in Doze;
   scrobbles sent vs. Navidrome playCount delta after leaving Doze (each sent once?);
   batterystats for the app (wake locks, alarms, jobs, network, estimated power).
2. Paused in Doze for PAUSE_MIN (default 10) minutes → Play (as the notification does) → plays?
Usage: ANDROID_SERIAL=... MINUTES=30 PAUSE_MIN=10 python3 battery_doze.py
"""
import json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402

APP = f.APP
MINUTES = float(os.environ.get("MINUTES", 30))
PAUSE_MIN = float(os.environ.get("PAUSE_MIN", 10))


def plays():
    al = f.nd("search3", query="Big Album", albumCount=3, songCount=0, artistCount=0)["searchResult3"]["album"]
    a = [x for x in al if x["name"] == "Big Album"][0]
    return sum(s.get("playCount", 0) for s in f.nd("getAlbum", id=a["id"])["album"]["song"])


def main():
    ui.adb("root", check=False)
    time.sleep(2)
    f.clear()
    f.open_album("Big Album", wait_for="ALBUM")
    pill = [n for n in ui.dump() if n["text"] == "Play" and n["center"][1] < ui.sy(1700)]
    ui.tap_xy(*pill[0]["center"])
    f.wait_state(lambda x: x["state"] == "PLAYING", 20)
    plays0 = plays()
    ui.shell("dumpsys battery unplug; dumpsys batterystats --reset", check=False)
    ui.key("KEYCODE_SLEEP")
    awake = MINUTES * 60 * 2 / 3
    time.sleep(awake)
    st1 = ui.media_state(APP)
    log_before_idle = f.proxy("/__fault/log").get("requests", {})
    f.proxy("/__fault/log/reset", [])
    ui.shell("dumpsys deviceidle force-idle", check=False)
    time.sleep(MINUTES * 60 - awake)
    in_idle = f.proxy("/__fault/log").get("requests", {})
    st2 = ui.media_state(APP)
    stats = ui.shell(f"dumpsys batterystats --charged {APP}", check=False)
    ui.shell("dumpsys deviceidle unforce", check=False)
    ui.key("KEYCODE_WAKEUP")
    ui.shell("wm dismiss-keyguard", check=False)
    time.sleep(20)  # queued listens go out once the network is back
    after = f.proxy("/__fault/log").get("requests", {})
    plays1 = plays()
    sent = sum(r.get("endpoint") == "scrobble" for r in f.proxy("/__fault/log").get("recent", []))
    # 2. paused in Doze
    ui.shell("cmd media_session dispatch pause")
    ui.key("KEYCODE_SLEEP")
    ui.shell("dumpsys deviceidle force-idle", check=False)
    time.sleep(PAUSE_MIN * 60)
    ui.shell("cmd media_session dispatch play")
    resumed = f.wait_state(lambda x: x["state"] == "PLAYING", 20)
    ui.shell("dumpsys deviceidle unforce; dumpsys battery reset", check=False)
    ui.key("KEYCODE_WAKEUP")
    ui.shell("cmd media_session dispatch pause")

    def grab(pattern):
        return re.findall(pattern, stats)[:12]
    res = {
        "playing after 2/3 (screen off)": st1, "playing at the end (in Doze)": st2,
        "requests before Doze (screen off)": log_before_idle, "requests while in Doze": in_idle,
        "requests after leaving Doze (cumulative since Doze)": after,
        "Navidrome playCount delta (Big Album)": plays1 - plays0,
        "scrobble requests in the last 5000": sent,
        "resumed after paused Doze": resumed,
        "batterystats": {
            "wake locks": grab(r"Wake lock [^\n]+"),
            "alarms": grab(r"Wakeup alarm [^\n]+|\*alarm\*[^\n]+"),
            "jobs": grab(r"Job [^\n]+"),
            "network": grab(r"Mobile network: [^\n]+|Wi-Fi network: [^\n]+"),
            "estimated power": grab(r"Uid \S+: [\d.]+ [^\n]*|Estimated power use[^\n]*"),
            "cpu": grab(r"Total cpu time: [^\n]+"),
        },
    }
    print(json.dumps(res, indent=1, default=str))
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1, default=str)
        open(out.replace(".json", "-batterystats.txt"), "w").write(stats)


if __name__ == "__main__":
    main()
