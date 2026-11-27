"""1.6.1: opens the song menu from every place that has one, and the sleep timer from both places,
on a device. For each: the sheet shows, nothing behind it is in the accessibility tree (TalkBack only
finds the sheet), Back closes only the sheet (the page stays), and the scrim closes it.
Screenshots of each go to SHOTS.

Usage: ANDROID_SERIAL=emulator-5554 APP=com.tonihk00.clearplay.rtest python3 sheet_places.py
"""
import json, os, sys, tempfile, time
import ui

APP = os.environ.get("APP", "com.tonihk00.clearplay.rtest")
ACTIVITY = f"{APP}/com.tonihk00.clearplay.MainActivity"
SHOTS = os.environ.get("SHOTS", tempfile.gettempdir())
# The first label is only in the sheet (the album page has its own "Play next" / "Add to queue" buttons).
MENU = ["Go to artist", "Go to album", "Play next", "Add to queue"]
SLEEP = ["15 minutes", "End of this song"]


def open_tab(name):
    nodes = ui.dump()
    tabs = [n for n in nodes if n["text"] == name and n["center"][1] > 1900]
    ui.tap_xy(*(tabs[-1]["center"] if tabs else ui.wait(name, exact=True)["center"]))
    time.sleep(1.5)


def home():
    ui.shell(f"am force-stop {APP}")
    time.sleep(0.5)
    ui.shell(f"am start -n {ACTIVITY}")
    ui.wait("Library", timeout=40)
    time.sleep(2)


def more_buttons():
    return [n for n in ui.dump() if n["desc"] == "More" and 300 < n["center"][1] < 1800]


def check_sheet(place, labels, page_marker, open_fn, reopen_fn=None):
    """open_fn() opens the sheet. page_marker: a text of the page under it, which must stay after Back."""
    res = {"place": place}
    open_fn()
    time.sleep(1.5)
    nodes = ui.dump()
    texts = ui.texts(nodes)
    missing = [l for l in labels if l not in texts]
    assert not missing, f"{place}: sheet items missing {missing}: {texts[:40]}"
    # Modal for TalkBack: the tab bar and the page aren't in the accessibility tree.
    behind = [t for t in ("Library", "Search", "Stats", "Settings", page_marker) if t in texts and t not in labels]
    assert not behind, f"{place}: still visible to TalkBack behind the sheet: {behind}"
    ui.screenshot(os.path.join(SHOTS, f"sheet-{ui.SERIAL}-{place}.png"))
    # Back closes only the sheet.
    ui.key("KEYCODE_BACK")
    time.sleep(1.2)
    texts = ui.texts()
    assert labels[0] not in texts, f"{place}: Back didn't close the sheet"
    assert page_marker in texts, f"{place}: Back closed the page too ({page_marker!r} gone): {texts[:30]}"
    # The scrim closes it.
    (reopen_fn or open_fn)()
    time.sleep(1.5)
    assert labels[0] in ui.texts(), f"{place}: didn't reopen"
    ui.tap_xy(540, 200)
    time.sleep(1.2)
    texts = ui.texts()
    assert labels[0] not in texts and page_marker in texts, f"{place}: scrim tap: {texts[:30]}"
    # Drag down closes it.
    (reopen_fn or open_fn)()
    time.sleep(1.5)
    top = min(n["bounds"][1] for n in ui.dump() if n["text"] in labels)
    ui.swipe(540, top - 60, 540, 2350, 250)
    time.sleep(1.2)
    texts = ui.texts()
    assert labels[0] not in texts and page_marker in texts, f"{place}: drag down: {texts[:30]}"
    res["ok"] = True
    return res


def tap_more(i=1):
    def f():
        ui.tap_xy(*more_buttons()[i]["center"])
    return f


def album():
    home()
    open_tab("Library")
    ui.tap("Albums", exact=True)
    ui.tap("Neon Tides", exact=True)
    ui.wait("ALBUM", timeout=15)
    time.sleep(1)
    return check_sheet("album", MENU, "ALBUM", tap_more(1))


def long_press_album_row():
    home()
    open_tab("Library")
    ui.tap("Albums", exact=True)
    ui.tap("Neon Tides", exact=True)
    ui.wait("ALBUM", timeout=15)
    time.sleep(1)
    # The third song row above the tab bar (on a shorter screen fewer rows fit in more_buttons' band).
    rows = [n for n in ui.dump() if n["desc"] == "More" and 300 < n["center"][1] < 2050]
    y = rows[min(2, len(rows) - 1)]["center"][1]
    return check_sheet("album-long-press", MENU, "ALBUM", lambda: ui.swipe(400, y, 400, y, 900))


def playlist():
    home()
    open_tab("Library")
    ui.tap("Playlists", exact=True)
    time.sleep(1.5)
    rows = [n for n in ui.dump() if " songs" in n["text"] or " song" in n["text"]]
    ui.tap_xy(*rows[0]["center"])
    ui.wait("PLAYLIST", timeout=15)
    time.sleep(1)
    return check_sheet("playlist", MENU, "PLAYLIST", tap_more(0))


def genre():
    home()
    open_tab("Library")
    for _ in range(4):
        if ui.find("Genres", exact=True):
            break
        tab = ui.find("Favorites", exact=True) or ui.find("Playlists", exact=True)
        ui.swipe(tab["center"][0], tab["center"][1], 60, tab["center"][1], 300)
        time.sleep(1)
    ui.tap("Genres", exact=True)
    time.sleep(2)
    ui.tap("Synthpop", exact=True)
    time.sleep(2.5)
    marker = next(t for t in ui.texts() if t.upper() == "GENRE" or t == "Synthpop")
    return check_sheet("genre", MENU, marker, tap_more(0))


def search():
    home()
    open_tab("Search")
    time.sleep(1)
    ui.type_text("Tide")
    time.sleep(4)
    texts = ui.texts()
    marker = next(t for t in texts if t in ("Neon Tides", "Low Tide"))
    return check_sheet("search", MENU, marker, tap_more(0))


def library_songs():
    home()
    open_tab("Library")
    ui.tap("Songs", exact=True)
    time.sleep(2)
    return check_sheet("library-songs", MENU, "Albums", tap_more(1))


def favorites():
    home()
    open_tab("Library")
    ui.tap("Favorites", exact=True)
    time.sleep(2)
    if not more_buttons():
        return {"place": "favorites", "ok": None, "note": "no favourite songs on this server"}
    return check_sheet("favorites", MENU, "SONGS", tap_more(0))


def open_full_player_queue():
    home()
    if not [n for n in ui.dump() if n["desc"] == "Next"]:
        open_tab("Library")
        ui.tap("Albums", exact=True)
        ui.tap("Neon Tides", exact=True)
        ui.wait("ALBUM", timeout=15)
        ui.tap("Play", exact=True)
        time.sleep(3)
        ui.shell("cmd media_session dispatch pause")
        ui.key("KEYCODE_BACK")
        time.sleep(1)
    nxt = [n for n in ui.dump() if n["desc"] == "Next" and 1500 < n["center"][1] < 2150][-1]
    ui.tap_xy(300, nxt["center"][1])
    time.sleep(2)
    ui.tap("Queue", exact=True)
    time.sleep(1.5)


def queue_in_full_player():
    open_full_player_queue()
    removes = [n for n in ui.dump() if n["desc"] == "Remove"]

    def open_menu():
        # In the queue a tap plays the song; holding without moving, then letting go, opens the menu.
        ys = [n["center"][1] for n in ui.dump() if n["desc"] == "Remove"]
        ui.swipe(500, ys[1], 500, ys[1], 900)
    return check_sheet("full-player-queue", MENU, "Up next" if ui.find("Up next") else "Queue", open_menu)


def sleep_full_player():
    open_full_player_queue()
    ui.tap("Queue", exact=True)  # close the queue panel
    time.sleep(1)
    return check_sheet("sleep-full-player", SLEEP, "Lyrics", lambda: ui.tap("Sleep timer", exact=True))


def sleep_settings():
    home()
    open_tab("Settings")
    ui.scroll_to("Sleep timer", exact=True)
    marker = next(t for t in ("Scrobble plays", "PLAYER", "Playback source") if ui.find(t, exact=True))
    return check_sheet("sleep-settings", SLEEP, marker, lambda: ui.tap("Sleep timer", exact=True))


PLACES = {"album": album, "album-long-press": long_press_album_row, "playlist": playlist, "genre": genre,
          "search": search, "library-songs": library_songs, "favorites": favorites,
          "full-player-queue": queue_in_full_player, "sleep-full-player": sleep_full_player, "sleep-settings": sleep_settings}


def main():
    wanted = sys.argv[1:] or list(PLACES)
    results, ok = {}, True
    for name in wanted:
        try:
            results[name] = PLACES[name]()
            print("PASS", name, results[name], flush=True)
        except Exception as e:
            ok = False
            ui.screenshot(os.path.join(SHOTS, f"sheet-{ui.SERIAL}-{name}-FAIL.png"))
            results[name] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
            print("FAIL", name, results[name], flush=True)
    out = os.environ.get("RESULTS")
    if out:
        json.dump(results, open(out, "w"), indent=1)
    print("ALL PASS" if ok else "SOME FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
