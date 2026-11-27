"""Every 1.6.1 fix has a test that fails without it: for each fix, put the old code back (in place),
run its tests, expect failures, then restore the file. Usage (from android/): python3 tools/audit/fails_without_fix.py [fix ...]
"""
import os, subprocess, sys, xml.etree.ElementTree as E

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "app/src/main/java/com/tonihk00/clearplay/")
RESULTS = os.path.join(ROOT, "app/build/test-results/testDebugUnitTest")

# fix: (file, [(new code, old code)], test filters, test names that must fail)
FIXES = {
    "H1 pauseHere clears dirty": ("player/Handoff.kt", [(
        "        dirty = false\n        pausingHere = player.isPlaying()", "        pausingHere = player.isPlaying()")],
        ["*HandoffTest*"], ["h1LeftBehindThenPauseHereThenBackgroundSendsNothing"]),
    "H2 saveNow checks left-behind first": ("player/Handoff.kt", [(
        "            if (playing) {\n                val answered", "            if (false) {\n                val answered")],
        ["*HandoffTest*"], ["h2PlayingDesktopTookOverNoCheckYetBackgroundSendsNothing", "h2CheckSlowerThanTheBudgetSendsNothing"]),
    "H3 continue marks handled only after start": ("player/Handoff.kt", [(
        "        val (o, queue, readAt) = current\n        continuing = true\n        try {", "        val (o, queue, readAt) = current\n        continuing = true\n        markHandled(o.changed)\n        _offer.value = null\n        try {")],
        ["*HandoffTest*"], ["h3ContinueThatFailsKeepsTheOfferAndSaysTryAgain"]),
    "A failing songs": ("player/PlaybackErrors.kt", [(
        "        val decision = PlaybackErrorRules.decide(", "        if (true) return\n        val decision = PlaybackErrorRules.decide(")],
        ["*V161FixesTest*"], ["aFailingSongIsRetriedOnceThenSkippedWithAMessage", "threeFailedSongsInARowStopPlayback",
                              "theLastSongFailingStopsThereWithTheQueueKept", "serverUnreachablePausesOnTheSongWithoutSkipping"]),
    "C end of queue": ("player/EndOfQueue.kt", [(
        "    player.playWhenReady = false\n    player.seekTo(player.currentMediaItemIndex, 0)", "")],
        ["*V161FixesTest*"], ["theQueueEndingStopsOnTheLastSongAtItsStart"]),
    "B stats cancel": ("data/stats/StatsSnapshots.kt", [(
        "        synchronized(running) { running[key] }?.cancel()", "")],
        ["*V161FixesTest*"], ["leavingStatisticsForGoodCancelsTheLoad"]),
    "F page errors": ("ui/Actions.kt", [(
        "    e is com.tonihk00.clearplay.data.api.SubsonicException && e.code == 70 -> PageError.NotFound\n    e is com.tonihk00.clearplay.data.api.SubsonicException && e.code in setOf(40, 41, 44) -> PageError.Auth\n",
        "")],
        ["*V161FixesTest*"], ["pageErrorsAreClassifiedLikeTheDesktop", "notFoundIsOnlyError70", "error40OffersToLogInAgain"]),
    "F retry": ("ui/Actions.kt", [("                            retry = { attempt++ },\n", "")],
        ["*V161FixesTest*"], ["aServerErrorOnAPageOffersRetryAndRetryLoadsIt", "badJsonIsAServerErrorNotAWrongAddress"]),
    "Search sticky failure": ("ui/search/SearchScreen.kt", [(
        "result = it; failed = false; return@LaunchedEffect", "result = it; return@LaunchedEffect")],
        ["*V161FixesTest*"], ["searchFailureDoesNotStickToFoundResults"]),
    "Search retry": ("ui/search/SearchScreen.kt", [('action = onRetry?.let { "Retry" to it }', "action = null")],
        ["*V161FixesTest*"], ["aFailedSearchOffersRetry"]),
    "P1 pings": ("data/ConnectionMonitor.kt", [("fun shouldRecheck(previous: NetKey?, next: NetKey) = previous != next",
                                               "fun shouldRecheck(previous: NetKey?, next: NetKey) = true")],
        ["*V161FixesTest*"], ["onlyChangesThatMatterAskTheServerAgain"]),
    "P no client is not offline": ("data/ConnectionMonitor.kt", [("            val c = client() ?: return@launch\n            val ok = when {\n",
                                                                 "            val c = client()\n            val ok = when {\n                c == null -> false\n")],
        ["*V161FixesTest*"], ["noClientYetIsNotOffline"]),
    "Tab labels at 2.0": ("ui/AppRoot.kt", [("            maxLines = 1, softWrap = false,\n            autoSize", "            autoSize")],
        ["*V161FixesTest*"], ["tabLabelsStayOnOneLineAtFontScale2"]),
    "Back key while the sheet has focus": ("ui/components/GlassSheet.kt", [(
        "                        if (e.type == KeyEventType.KeyUp) close()\n                        true", "                        false")],
        ["*V161UiTest*"], ["backKeyClosesWhileTheSheetHasFocus"]),
}
MANIFEST = os.path.join(ROOT, "app/src/main/AndroidManifest.xml")


def run(filters):
    args = ["./gradlew", "testDebugUnitTest", "-q"] + sum((["--tests", t] for t in filters), [])
    subprocess.run(args, cwd=ROOT, env={**os.environ, "JAVA_HOME": os.path.expanduser("~/jdk-17")},
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failed = set()
    for f in os.listdir(RESULTS):
        if f.endswith(".xml"):
            for tc in E.parse(os.path.join(RESULTS, f)).getroot().iter("testcase"):
                if any(c.tag in ("failure", "error") for c in tc):
                    failed.add(tc.get("name"))
    return failed


def main():
    wanted = sys.argv[1:] or list(FIXES) + ["D backup rules"]
    ok = True
    for name in wanted:
        if name == "D backup rules":
            path, pairs, filters, must = MANIFEST, [('        android:dataExtractionRules="@xml/data_extraction_rules"\n', "")], ["*V161FixesTest*"], ["theLoginIsExcludedFromCloudBackupAndDeviceTransfer"]
        else:
            rel, pairs, filters, must = FIXES[name]
            path = SRC + rel
        original = open(path).read()
        s = original
        for new, old in pairs:
            assert s.count(new) == 1, (name, new)
            s = s.replace(new, old)
        try:
            open(path, "w").write(s)
            failed = run(filters)
        finally:
            open(path, "w").write(original)
        missing = [m for m in must if m not in failed]
        ok &= not missing
        print(("OK   " if not missing else "MISS ") + f"{name}: without the fix, failing: {sorted(failed & set(must))}" + (f"; did NOT fail: {missing}" if missing else ""), flush=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
