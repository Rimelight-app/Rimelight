"""Stress loop for the "stuck page" bug (a page stays on screen, the tabs and Back don't change it):
opens albums from Search and Library with varied timing, goes back, switches tabs, and checks after
every step that a tab tap changes what is shown. Stops at the first stuck state and saves a screenshot.
Usage: ANDROID_SERIAL=... python3 nav_stuck.py [minutes]"""
import os, random, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import ui  # noqa: E402
import fault_cases as f  # noqa: E402

MIN = float(sys.argv[1]) if len(sys.argv) > 1 else 10
SHOTS = os.environ.get("SHOTS", "/tmp")
rnd = random.Random(7)
log = []


def tab(name):
    t = [n for n in ui.dump() if n["text"] == name and n["center"][1] > 1900]
    if not t:
        return False
    ui.tap_xy(*t[-1]["center"])
    return True


def hide_keyboard():
    if "mInputShown=true" in ui.shell("dumpsys input_method | grep mInputShown", check=False):
        _key("KEYCODE_BACK")
        time.sleep(0.8)


def stuck_check():
    """Stats then Library: each must show its own page (the keyboard hidden first: it covers the tabs)."""
    hide_keyboard()
    tab("Stats"); time.sleep(1.5)
    a = ui.texts()
    tab("Library"); time.sleep(1.5)
    b = ui.texts()
    ok_stats = "Statistics" in a
    ok_lib = "Library" in b and "ALBUM" not in b and "PLAYLIST" not in b or "ALBUM" in b
    return ok_stats, a[:5], b[:5]


actions = []
_tap, _key, _shell = ui.tap_xy, ui.key, ui.shell
def rec_tap(x, y):
    actions.append((round(time.time(), 2), "tap", x, y)); _tap(x, y)
def rec_key(k):
    actions.append((round(time.time(), 2), "key", k)); _key(k)
ui.tap_xy, ui.key = rec_tap, rec_key


def main():
    ui.shell(f"am force-stop {f.APP}")
    time.sleep(1)
    ui.shell(f"am start -n {f.ACTIVITY}")
    time.sleep(3)
    loop()


def loop():
  end = time.time() + MIN * 60
  i = 0
  while time.time() < end:
      i += 1
      step = rnd.choice(["search_album", "library_album", "back_fast", "tab_fast", "error_page", "error_page"])
      try:
          if step == "search_album":
              f.open_album(rnd.choice(["Big Album", "Fault Test", "Three Discs"]), wait_for=None)
              time.sleep(rnd.choice([0.0, 0.2, 0.5, 1.5]))
              ui.key("KEYCODE_BACK")
          elif step == "library_album":
              tab("Library"); time.sleep(rnd.choice([0.1, 0.6]))
              n = ui.find("Big Album", exact=True) or ui.find("Cold Glass 00002", exact=True)
              if n:
                  ui.tap_xy(*n["center"]); time.sleep(rnd.choice([0.0, 0.15, 0.4, 1.0])); ui.key("KEYCODE_BACK")
          elif step == "error_page":
              # Like f1_page_errors: the album fails (or hangs), Back on the error, sometimes after
              # the server answers again.
              f.rules([f"getAlbum:{rnd.choice(['500', 'badjson', 'error40', 'hang'])}"])
              f.open_album(rnd.choice(["Big Album", "Three Discs"]), wait_for=None)
              time.sleep(rnd.choice([0.5, 3, 8]))
              if rnd.random() < 0.5:
                  f.clear()
                  time.sleep(rnd.choice([0.2, 2]))
              ui.key("KEYCODE_BACK")
              f.clear()
          elif step == "back_fast":
              n = ui.find("Big Album", exact=True)
              if n:
                  ui.tap_xy(*n["center"]); ui.key("KEYCODE_BACK"); time.sleep(0.05); tab("Search")
          else:
              for name in rnd.sample(["Library", "Search", "Stats", "Settings"], 3):
                  tab(name); time.sleep(rnd.choice([0.0, 0.1, 0.3]))
          time.sleep(1)
          if "Rimelight" in ui.texts() and "Gmail" in ui.texts():  # left the app
              ui.shell(f"am start -n {f.ACTIVITY}"); time.sleep(2)
          ok, a, b = stuck_check()
          log.append((i, step, ok))
          if not ok:
              path = os.path.join(SHOTS, f"nav-stuck-{int(time.time())}.png")
              ui.screenshot(path)
              print(f"STUCK after step {i} ({step}): Stats tap showed {a}; Library tap showed {b}; screenshot {path}")
              print("last steps:", log[-8:])
              sys.exit(1)
      except Exception as e:
          print("step error", i, step, type(e).__name__, str(e)[:120])
          ui.shell(f"am start -n {f.ACTIVITY}")
          time.sleep(2)
  print(f"not reproduced in {i} steps / {MIN} min")


if __name__ == "__main__":
    main()
