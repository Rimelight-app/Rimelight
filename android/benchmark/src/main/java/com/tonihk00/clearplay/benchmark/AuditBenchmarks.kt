package com.tonihk00.clearplay.benchmark

import android.os.SystemClock
import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.Until
import com.tonihk00.clearplay.benchmark.Journeys.awaitAlbums
import com.tonihk00.clearplay.benchmark.Journeys.fail
import com.tonihk00.clearplay.benchmark.Journeys.signInIfNeeded
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The 1.6.1 audit's extra journeys (big rig: tools/audit/extend_big_library.py). Run them with
 * instrumentation arguments cpServer=10.0.2.2:4534 (the fault proxy in front of the big rig).
 *  - startup: cold / warm / hot, without any AOT compilation and with the Baseline Profile only
 *  - flings: Artists, Songs, search results, the 10 000-song playlist, the queue sheet
 * They don't touch the app; numbers are emulator numbers (frame times in ms, 60 Hz).
 */
@RunWith(AndroidJUnit4::class)
class AuditBenchmarks {
    @get:Rule val rule = MacrobenchmarkRule()

    private val profile = CompilationMode.Partial(BaselineProfileMode.Require)
    private val none = CompilationMode.None()

    private fun start(mode: StartupMode, compilation: CompilationMode) = rule.measureRepeated(
        packageName = TARGET,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = compilation,
        startupMode = mode,
        iterations = 6,
        setupBlock = {
            if (!signedIn) {
                startActivityAndWait()
                signInIfNeeded()
                awaitAlbums()
                signedIn = true
            }
            // Warm and hot need the process (hot: the activity too) from a start before.
            if (mode != StartupMode.COLD) {
                startActivityAndWait()
                awaitAlbums()
            }
            pressHome()
        },
    ) {
        startActivityAndWait()
        awaitAlbums()
    }

    @Test fun coldProfile() = start(StartupMode.COLD, profile)
    @Test fun coldNone() = start(StartupMode.COLD, none)
    @Test fun warmProfile() = start(StartupMode.WARM, profile)
    @Test fun warmNone() = start(StartupMode.WARM, none)
    @Test fun hotProfile() = start(StartupMode.HOT, profile)
    @Test fun hotNone() = start(StartupMode.HOT, none)

    private fun fling(setup: MacrobenchmarkScope.() -> Unit, measure: MacrobenchmarkScope.() -> Unit) = rule.measureRepeated(
        packageName = TARGET,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = CompilationMode.Partial(BaselineProfileMode.UseIfAvailable),
        startupMode = StartupMode.WARM,
        iterations = 4,
        setupBlock = {
            startActivityAndWait()
            signInIfNeeded()
            awaitAlbums()
            setup()
        },
        measureBlock = measure,
    )

    @Test fun flingArtists() = fling({ libraryTab("Artists") }) { flingList() }
    @Test fun flingSongs() = fling({ libraryTab("Songs") }) { flingList() }
    @Test fun flingSearch() = fling({ search("a") }) { flingList() }
    @Test fun flingBigPlaylist() = fling({ openPlaylist("Big Playlist 10000") }) { flingList() }
    @Test fun flingQueue() = fling({ queueOf("Big Playlist 10000") }) { flingList() }

    private companion object { var signedIn = false }
}

/** Taps a Library tab (scrolls the tab row back if it is out of sight). */
fun MacrobenchmarkScope.libraryTab(name: String) {
    val d = device
    (d.findObjects(By.text("Library")).maxByOrNull { it.visibleBounds.top } ?: fail("No Library tab")).click()
    SystemClock.sleep(800)
    var tab = d.findObject(By.text(name))
    var tries = 0
    while (tab == null && tries++ < 4) {
        val row = d.findObject(By.text("Playlists")) ?: d.findObject(By.text("Songs")) ?: fail("No tab row")
        val y = row.visibleCenter.y
        d.swipe(d.displayWidth / 5, y, d.displayWidth * 4 / 5, y, 20)
        SystemClock.sleep(500)
        tab = d.findObject(By.text(name))
    }
    (tab ?: fail("No $name tab")).click()
    d.wait(Until.hasObject(By.scrollable(true)), 15_000)
    SystemClock.sleep(1_500)
}

/** Search tab, [query] typed, results on screen. */
fun MacrobenchmarkScope.search(query: String) {
    val d = device
    (d.findObjects(By.text("Search")).maxByOrNull { it.visibleBounds.top } ?: fail("No Search tab")).click()
    val field = d.wait(Until.findObject(By.clazz("android.widget.EditText")), 10_000) ?: fail("No search field")
    field.text = query
    d.wait(Until.hasObject(By.text("SONGS")), 15_000)
    // Close the keyboard only if one shows (Back would otherwise leave the page).
    if (d.executeShellCommand("dumpsys input_method").contains("mInputShown=true")) d.pressBack()
    d.wait(Until.hasObject(By.scrollable(true)), 10_000)
    SystemClock.sleep(1_500)
}

/** Library → Playlists → [name], its songs on screen. */
fun MacrobenchmarkScope.openPlaylist(name: String) {
    val d = device
    libraryTab("Playlists")
    val list = d.findObject(By.scrollable(true)) ?: fail("No playlist list")
    var item = d.findObject(By.text(name))
    var tries = 0
    while (item == null && tries++ < 10) { list.scroll(Direction.DOWN, 0.7f); item = d.findObject(By.text(name)) }
    (item ?: fail("No playlist $name")).click()
    if (d.wait(Until.hasObject(By.text("PLAYLIST")), 30_000) != true) fail("Playlist didn't open")
    d.wait(Until.hasObject(By.desc("More")), 30_000)
    SystemClock.sleep(1_500)
}

/** Plays the playlist [name] (its whole song list becomes the queue) and opens the full player's queue. */
fun MacrobenchmarkScope.queueOf(name: String) {
    val d = device
    if (d.findObject(By.textStartsWith("Queue ·")) != null) return
    openPlaylist(name)
    (d.findObject(By.text("Play")) ?: fail("No Play")).click()
    if (d.wait(Until.hasObject(By.desc("Next")), 20_000) != true) fail("Nothing plays")
    d.pressBack()
    SystemClock.sleep(1_000)
    val next = d.findObject(By.desc("Next")) ?: fail("No mini player")
    d.click(d.displayWidth / 3, next.visibleCenter.y)
    if (d.wait(Until.hasObject(By.desc("Queue")), 10_000) != true) fail("Full player didn't open")
    d.findObject(By.desc("Queue")).click()
    d.wait(Until.hasObject(By.textStartsWith("Queue ·")), 10_000)
    SystemClock.sleep(1_500)
}

/** Five flings down the scrollable list on screen, then one back up. */
fun MacrobenchmarkScope.flingList() {
    val d = device
    val list = d.findObjects(By.scrollable(true)).maxByOrNull { it.visibleBounds.height() } ?: error("Nothing scrolls")
    list.setGestureMargin(d.displayWidth / 6)
    repeat(5) {
        list.fling(Direction.DOWN, 6_000)
        d.waitForIdle()
    }
    list.fling(Direction.UP, 6_000)
    d.waitForIdle()
}
