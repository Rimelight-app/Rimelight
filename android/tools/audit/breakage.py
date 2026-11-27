"""Breakage checks (Normal), each printing what happened. Usage: ANDROID_SERIAL=... python3 breakage.py [check ...]
Screenshots of the visual checks go to SHOTS.
"""
import json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402

APP = f.APP
SHOTS = os.environ.get("SHOTS", "/tmp")


def crashes_since(mark):
    log = ui.shell(f"logcat -d -b crash,events -T '{mark}'", check=False)
    return re.findall(r"FATAL EXCEPTION[^\n]*|am_anr[^\n]*" + "", log)


def now_mark():
    return ui.shell("date '+%m-%d %H:%M:%S.000'").strip()


def tab(name):
    f.hide_keyboard()
    t = [n for n in ui.dump() if n["text"] == name and n["center"][1] > ui.sy(1900)]
    if t:
        ui.tap_xy(*t[-1]["center"])
        time.sleep(1.2)


def library_item(tab_name, name):
    """Library → [tab_name] → the row / tile [name] (scrolls until it shows)."""
    f.library_albums()
    if tab_name != "Albums":
        f.show_tab(tab_name)
    item = ui.scroll_to(name, exact=True, tries=20)
    ui.tap_xy(*item["center"])
    time.sleep(3)


def play_album(name):
    f.library_albums()
    f.open_album(name, wait_for="ALBUM")
    pill = [n for n in ui.dump() if n["text"] == "Play" and n["center"][1] < ui.sy(1700)]
    ui.tap_xy(*pill[0]["center"])
    f.wait_state(lambda x: x["state"] == "PLAYING", 20)


def dont_keep_activities():
    mark = now_mark()
    ui.shell("settings put global always_finish_activities 1")
    try:
        visited = []
        for name in ["Library", "Search", "Stats", "Settings", "Library"]:
            ui.shell(f"am start -n {f.ACTIVITY}")
            time.sleep(2)
            tab(name)
            visited.append((name, ui.texts()[:2]))
            ui.key("KEYCODE_HOME")
            time.sleep(1)
        # A page and the song menu, through a round trip to Home.
        ui.shell(f"am start -n {f.ACTIVITY}")
        time.sleep(2)
        library_item("Albums", "Big Album")
        more = [n for n in ui.dump() if n["desc"] == "More"]
        ui.tap_xy(*more[1]["center"])
        time.sleep(1.5)
        menu = "Go to artist" in ui.texts()
        ui.key("KEYCODE_HOME")
        time.sleep(1)
        ui.shell(f"am start -n {f.ACTIVITY}")
        time.sleep(3)
        after = ui.texts()[:6]
    finally:
        ui.shell("settings put global always_finish_activities 0")
    return {"crashes": crashes_since(mark), "tabs": visited, "menu opened": menu, "after Home + back": after}


def fast_skips():
    play_album("Big Album")
    st0 = ui.media_state(APP)
    for _ in range(20):
        ui.shell("cmd media_session dispatch next")
    time.sleep(3)
    st = ui.media_state(APP)
    ui.shell("cmd media_session dispatch pause")
    return {"from": st0 and st0["item"], "after 20 fast Next": st and (st["item"], st["title"], st["state"]), "expected item": st0 and st0["item"] + 20}


def big_queue_restart():
    """Play the 10 000-song playlist from song 5 000, kill the app, Resume: what does QueueStore keep?"""
    library_item("Playlists", "Big Playlist 10000")
    ui.wait("PLAYLIST", timeout=30)
    time.sleep(2)
    pill = [n for n in ui.dump() if n["text"] == "Play" and n["center"][1] < ui.sy(1700)]
    ui.tap_xy(*pill[0]["center"])
    f.wait_state(lambda x: x["state"] == "PLAYING", 30)
    time.sleep(3)
    ui.shell("cmd media_session dispatch pause")
    time.sleep(2)
    ui.key("KEYCODE_HOME")
    time.sleep(1)
    ui.adb("root", check=False)
    time.sleep(2)
    size = ui.shell(f"stat -c %s /data/data/{APP}/files/queue.json", check=False).strip()
    q = ui.shell(f"cat /data/data/{APP}/files/queue.json", check=False)
    n = q.count('"id"')
    ui.shell(f"am force-stop {APP}")
    time.sleep(1)
    ui.shell("cmd media_session dispatch play")
    st = f.wait_state(lambda x: x["state"] == "PLAYING", 25)
    ui.shell("cmd media_session dispatch pause")
    return {"queue.json bytes": size, "song ids in queue.json": n, "resumed": st}


def clear_queue_while_playing():
    play_album("Big Album")
    nxt = [n for n in ui.dump() if n["desc"] == "Next" and ui.sy(1500) < n["center"][1] < ui.sy(2150)][-1]
    ui.tap_xy(ui.sx(300), nxt["center"][1])
    time.sleep(2)
    ui.tap("Queue", exact=True)
    time.sleep(1.5)
    ui.tap("Clear", exact=True)
    time.sleep(2)
    texts = [t for t in ui.texts() if t.startswith("Queue")]
    st = ui.media_state(APP)
    ui.key("KEYCODE_BACK")
    ui.shell("cmd media_session dispatch pause")
    return {"queue header": texts, "player": st}


def incoming_call():
    play_album("Big Album")
    ui.adb("emu", "gsm", "call", "5551234", check=False)
    time.sleep(5)
    during = ui.media_state(APP)
    ui.adb("emu", "gsm", "cancel", "5551234", check=False)
    time.sleep(6)
    after = ui.media_state(APP)
    ui.shell("cmd media_session dispatch pause")
    return {"during the call": during and during["state"], "after the call ended": after and after["state"]}


def settings_toggles_restart():
    mark = now_mark()
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(2)
    tab("Settings")
    toggled = []
    for _ in range(12):
        for n in ui.dump():
            if n["checkable"] and n["center"][1] < 1900 and n["center"] not in [t[1] for t in toggled]:
                label = [x["text"] for x in ui.dump() if x["text"] and n["bounds"][1] <= x["center"][1] <= n["bounds"][3]]
                if any(w in " ".join(label) for w in ("Bit-perfect", "Continue on other devices", "Music on this phone")):
                    continue  # keep what the other checks rely on
                ui.tap_xy(*n["center"]); time.sleep(0.6); ui.tap_xy(*n["center"]); time.sleep(0.6)
                toggled.append((label[:1], n["center"]))
        ui.swipe(ui.sx(540), ui.sy(1700), ui.sx(540), ui.sy(900), 300)
        time.sleep(0.8)
    ui.shell(f"am force-stop {APP}")
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(5)
    return {"toggled twice": [t[0] for t in toggled], "crashes": crashes_since(mark), "after restart": ui.texts()[:3]}


def unlabeled_buttons():
    """Clickable nodes without text or content description on the main screens (TalkBack reads nothing)."""
    out = {}
    play_album("Big Album")
    ui.shell("cmd media_session dispatch pause")
    ui.key("KEYCODE_BACK")
    time.sleep(1)
    screens = {"Library": lambda: tab("Library"), "Album": lambda: f.open_album("Big Album", wait_for="ALBUM"),
               "Full player": lambda: (ui.key("KEYCODE_BACK"), time.sleep(1), ui.tap_xy(300, [n for n in ui.dump() if n["desc"] == "Next" and ui.sy(1500) < n["center"][1] < ui.sy(2150)][-1]["center"][1]), time.sleep(2)),
               "Settings": lambda: (ui.key("KEYCODE_BACK"), time.sleep(1), tab("Settings"))}
    for name, go in screens.items():
        go()
        nodes = ui.dump()
        bad = []
        for n in nodes:
            if not n["clickable"]:
                continue
            x0, y0, x1, y1 = n["bounds"]
            inside = [m for m in nodes if (m["text"] or m["desc"]) and x0 <= m["center"][0] <= x1 and y0 <= m["center"][1] <= y1]
            if not (n["text"] or n["desc"]) and not inside:
                bad.append(n["bounds"])
        out[name] = bad
    return out


def visual(name, setup, teardown):
    setup()
    time.sleep(2)
    shots = []
    for screen, go in (("library", lambda: tab("Library")), ("album", lambda: f.open_album("Big Album", wait_for="ALBUM")),
                       ("menu", lambda: ui.tap_xy(*[n for n in ui.dump() if n["desc"] == "More"][1]["center"])),
                       ("settings", lambda: (ui.key("KEYCODE_BACK"), time.sleep(1), ui.key("KEYCODE_BACK"), time.sleep(1), tab("Settings")))):
        try:
            go()
            time.sleep(2)
            p = os.path.join(SHOTS, f"break-{name}-{screen}.png")
            ui.screenshot(p)
            shots.append(p)
        except Exception as e:
            shots.append(f"{screen}: {type(e).__name__} {e}")
    teardown()
    time.sleep(2)
    return shots


def font_scale_2():
    return visual("font200", lambda: (ui.shell("settings put system font_scale 2.0"), ui.shell(f"am force-stop {APP}"), ui.shell(f"am start -n {f.ACTIVITY}")),
                  lambda: ui.shell("settings put system font_scale 1.0"))


def landscape():
    return visual("land", lambda: (ui.shell("settings put system accelerometer_rotation 0"), ui.shell("settings put system user_rotation 1"), ui.shell(f"am start -n {f.ACTIVITY}")),
                  lambda: ui.shell("settings put system user_rotation 0"))


def arabic():
    return visual("arabic", lambda: (ui.shell("cmd locale set-app-locales " + APP + " --locales ar"), ui.shell(f"am force-stop {APP}"), ui.shell(f"am start -n {f.ACTIVITY}")),
                  lambda: (ui.shell("cmd locale set-app-locales " + APP + " --locales en-US"), ui.shell(f"am force-stop {APP}")))


CHECKS = {f.__name__: f for f in (dont_keep_activities, fast_skips, big_queue_restart, clear_queue_while_playing, incoming_call,
                                  settings_toggles_restart, unlabeled_buttons, font_scale_2, landscape, arabic)}


def main():
    res = {}
    for n in sys.argv[1:] or list(CHECKS):
        try:
            res[n] = CHECKS[n]()
        except Exception as e:
            res[n] = f"error {type(e).__name__}: {e}"
        print(n, json.dumps(res[n], default=str)[:600], flush=True)
    out = os.environ.get("RESULTS")
    if out:
        json.dump(res, open(out, "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
