"""Drives an Android device through adb + `uiautomator dump`: find views by text or
content description, tap them, wait for them. Used by the end-to-end handoff tests."""
import os, re, subprocess, time, xml.etree.ElementTree as ET

SERIAL = os.environ.get("ANDROID_SERIAL", "emulator-5554")
ADB = os.path.expanduser("~/android-sdk/platform-tools/adb")


def adb(*args, check=True, timeout=60):
    r = subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"adb {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout


def shell(cmd, **kw):
    return adb("shell", cmd, **kw)


def dump():
    """The current view tree as a list of nodes (dict with text, desc, bounds, center)."""
    for _ in range(5):
        out = shell("uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml", check=False)
        if "<hierarchy" in out:
            break
        time.sleep(0.5)
    else:
        return []
    out = out[out.index("<?xml"):] if "<?xml" in out else out[out.index("<hierarchy"):]
    root = ET.fromstring(out[: out.rindex("</hierarchy>") + len("</hierarchy>")])
    nodes = []
    for n in root.iter("node"):
        b = [int(x) for x in re.findall(r"\d+", n.get("bounds", "[0,0][0,0]"))]
        nodes.append({
            "text": n.get("text", ""), "desc": n.get("content-desc", ""), "bounds": b,
            "center": ((b[0] + b[2]) // 2, (b[1] + b[3]) // 2),
            "clickable": n.get("clickable") == "true", "enabled": n.get("enabled") == "true",
            "checked": n.get("checked") == "true", "scrollable": n.get("scrollable") == "true",
            "checkable": n.get("checkable") == "true",
        })
    return nodes


def find(label, exact=False, nodes=None):
    nodes = nodes if nodes is not None else dump()
    for n in nodes:
        for v in (n["text"], n["desc"]):
            if v and ((v == label) if exact else (label in v)):
                return n
    return None


def texts(nodes=None):
    nodes = nodes if nodes is not None else dump()
    return [n["text"] or n["desc"] for n in nodes if n["text"] or n["desc"]]


def wait(label, timeout=20, exact=False):
    end = time.time() + timeout
    while time.time() < end:
        n = find(label, exact)
        if n:
            return n
        time.sleep(0.7)
    raise TimeoutError(f"'{label}' not on screen; saw: {texts()[:40]}")


def wait_gone(label, timeout=20, exact=False):
    end = time.time() + timeout
    while time.time() < end:
        if not find(label, exact):
            return True
        time.sleep(0.7)
    raise TimeoutError(f"'{label}' still on screen")


def tap_xy(x, y):
    shell(f"input tap {x} {y}")


def tap(label, timeout=20, exact=False):
    n = wait(label, timeout, exact)
    tap_xy(*n["center"])
    return n


def type_text(s):
    shell("input text " + "'" + s.replace(" ", "%s").replace("'", "") + "'")


def key(code):
    shell(f"input keyevent {code}")


def swipe(x1, y1, x2, y2, ms=300):
    shell(f"input swipe {x1} {y1} {x2} {y2} {ms}")


def scroll_to(label, exact=False, tries=12, up=False):
    """Scrolls the screen until [label] shows (screen centre swipes)."""
    for _ in range(tries):
        n = find(label, exact)
        if n:
            return n
        if up:
            swipe(540, 700, 540, 1700, 350)
        else:
            swipe(540, 1700, 540, 700, 350)
        time.sleep(0.8)
    raise TimeoutError(f"'{label}' not found after scrolling")


def screenshot(path):
    """Saves a PNG of the screen (for the record when something fails)."""
    data = subprocess.run([ADB, "-s", SERIAL, "exec-out", "screencap", "-p"], capture_output=True, timeout=30).stdout
    with open(path, "wb") as f:
        f.write(data)


def media_state(package):
    """The app's media session as dumpsys reports it: state, position (ms, now), queue item id, title."""
    out = shell("dumpsys media_session")
    i = out.find(f"package={package}")
    if i < 0:
        return None
    block = out[i:i + 4000]
    m = re.search(r"state=PlaybackState \{state=(\w+)\(\d+\), position=(\d+), buffered position=\d+, speed=([\d.]+), updated=(\d+).*?active item id=(-?\d+)", block, re.S)
    d = re.search(r"metadata: size=\d+, description=(.*?), ", block)
    if not m:
        return None
    state, pos, speed, updated, item = m.group(1), int(m.group(2)), float(m.group(3)), int(m.group(4)), int(m.group(5))
    if state == "PLAYING":
        now = int(float(shell("cat /proc/uptime").split()[0]) * 1000)
        # dumpsys "updated" is elapsedRealtime; /proc/uptime is close to it on the emulator.
        pos += int(max(0, now - updated) * speed)
    return {"state": state, "position": pos, "item": item, "title": d.group(1) if d else None}


def switch_state(label, nodes=None):
    """(checked, node) of the switch row that holds [label]."""
    nodes = nodes if nodes is not None else dump()
    t = find(label, exact=True, nodes=nodes)
    if not t:
        return None, None
    x, y = t["center"]
    rows = [n for n in nodes if n["checkable"] and n["bounds"][0] <= x <= n["bounds"][2] and n["bounds"][1] <= y <= n["bounds"][3]]
    if not rows:
        return None, t
    return rows[0]["checked"], rows[0]
