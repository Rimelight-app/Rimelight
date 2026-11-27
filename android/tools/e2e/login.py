"""Signs the app in to the rig Navidrome (10.0.2.2:4544, admin/test1234) through its login screen."""
import sys, time
import ui

def keyboard_shown():
    return "mInputShown=true" in ui.shell("dumpsys input_method", check=False)


# Gboard (Google APIs images) autocorrects `input text` and its bar can cover the next field: turn off
# every keyboard so the typed keys go straight to the field (it can turn itself on again, so do it each time).
IMES = ("com.android.inputmethod.latin/.LatinIME",
        "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME",
        "com.google.android.tts/com.google.android.apps.speech.tts.googletts.settings.asr.voiceime.VoiceInputMethodService")


def login(server="10.0.2.2:4544", user="admin", password="test1234"):
    for ime in IMES:
        ui.shell(f"ime disable {ime}", check=False)
    for label, value in (("Server", server), ("Username", user), ("Password", password)):
        if keyboard_shown():  # Gboard's bar can cover the next field: close it first
            ui.key(4)
            time.sleep(0.6)
        ui.tap(label)
        time.sleep(0.4)
        ui.type_text(value)
    ui.key(4) if ui.find("Connect", exact=True) is None else None
    ui.tap("Connect", exact=True)
    ui.wait("Library", timeout=40)

if __name__ == "__main__":
    login(*sys.argv[1:])
    print("logged in")
