"""Signs the app in to the rig Navidrome (10.0.2.2:4544, admin/test1234) through its login screen."""
import sys, time
import ui

def login(server="10.0.2.2:4544", user="admin", password="test1234"):
    for label, value in (("Server", server), ("Username", user), ("Password", password)):
        ui.tap(label)
        time.sleep(0.4)
        ui.type_text(value)
    ui.key(4) if ui.find("Connect", exact=True) is None else None
    ui.tap("Connect", exact=True)
    ui.wait("Library", timeout=40)

if __name__ == "__main__":
    login(*sys.argv[1:])
    print("logged in")
