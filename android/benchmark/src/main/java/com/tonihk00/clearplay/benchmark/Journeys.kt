package com.tonihk00.clearplay.benchmark

import android.os.SystemClock
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until

/** The release-like build of the app the benchmarks run against. */
const val TARGET = "com.tonihk00.clearplay"

private fun arg(name: String, default: String) =
    InstrumentationRegistry.getArguments().getString(name) ?: default

/**
 * The three journeys shared by the benchmarks and the Baseline Profile generator:
 * cold start to the Albums grid, flinging Albums, and full player → lyrics → back.
 */
object Journeys {
    /** Signs in through the login screen if the app shows it (first run on a device). */
    fun MacrobenchmarkScope.signInIfNeeded() {
        val d = device
        // A cold start on a slow emulator can take a while: wait for either screen.
        val end = SystemClock.uptimeMillis() + 30_000
        while (SystemClock.uptimeMillis() < end) {
            if (d.findObject(By.text("Library")) != null) return
            if (d.findObject(By.text("Connect")) != null) break
            SystemClock.sleep(300)
        }
        if (d.findObject(By.text("Connect")) == null) fail("Neither Library nor the login screen showed")
        val values = listOf(arg("cpServer", "10.0.2.2:4544"), arg("cpUser", "admin"), arg("cpPassword", "test1234"))
        values.forEachIndexed { i, value ->
            // Compose text fields show up as EditText, in screen order: server, user, password.
            val field = d.findObjects(By.clazz("android.widget.EditText")).sortedBy { it.visibleBounds.top }[i]
            field.click()
            field.text = value
        }
        // Close the keyboard only if it covers the button (a back press would otherwise leave the app).
        if (d.findObject(By.text("Connect")) == null) d.pressBack()
        (d.findObject(By.text("Connect")) ?: fail("No Connect button")).click()
        if (d.wait(Until.hasObject(By.text("Library")), 30_000) != true) fail("Sign-in failed")
    }

    /** Fails with the screen's view tree in logcat (the test's logcat is kept with its results). */
    fun MacrobenchmarkScope.fail(message: String): Nothing {
        val out = java.io.ByteArrayOutputStream()
        runCatching { device.dumpWindowHierarchy(out) }
        android.util.Log.e("Journeys", "$message; screen:\n" + out.toString().lines().joinToString("\n") { it.take(300) })
        error(message)
    }

    /** Waits until the Albums grid shows (its first covers report "fully drawn"). */
    fun MacrobenchmarkScope.awaitAlbums() {
        if (device.wait(Until.hasObject(By.text("Albums")), 30_000) != true) fail("Library didn't open")
        device.wait(Until.hasObject(By.scrollable(true)), 20_000)
        // reportFullyDrawn fires once the visible covers are loaded; give it a moment to land.
        SystemClock.sleep(1_500)
    }

    /** Five flings down the Albums grid, then back up. */
    fun MacrobenchmarkScope.flingAlbums() {
        val grid = device.findObject(By.scrollable(true)) ?: error("No album grid")
        grid.setGestureMargin(device.displayWidth / 6)
        repeat(5) {
            grid.fling(Direction.DOWN, 6_000)
            device.waitForIdle()
        }
        grid.fling(Direction.UP, 6_000)
        device.waitForIdle()
    }

    /** Makes sure something plays (so the mini player shows): an album of the rig library, from the top. */
    fun MacrobenchmarkScope.startSomething() {
        val d = device
        if (d.findObject(By.desc("Next")) != null) return
        val name = arg("cpAlbum", "Neon Tides")
        val grid = d.findObject(By.scrollable(true)) ?: fail("No album grid")
        var album = d.findObject(By.text(name))
        var tries = 0
        while (album == null && tries++ < 6) { grid.scroll(Direction.DOWN, 0.6f); album = d.findObject(By.text(name)) }
        album ?: fail("Album $name not in the grid")
        // Keep clear of the tab bar at the bottom of the screen.
        if (album.visibleBounds.bottom > d.displayHeight * 0.7) { grid.scroll(Direction.DOWN, 0.3f); album = d.findObject(By.text(name)) ?: fail("Album $name moved away") }
        // The grid may still be settling (covers, layout): find the album afresh for each try.
        var opened = false
        for (attempt in 0 until 4) {
            d.waitForIdle()
            runCatching { d.wait(Until.findObject(By.text(name)), 5_000)?.click() }
            if (d.wait(Until.hasObject(By.text("ALBUM")), 8_000) == true) { opened = true; break }
        }
        if (!opened) fail("Album didn't open")
        (d.findObject(By.text("Play")) ?: fail("No Play button")).click()
        if (d.wait(Until.hasObject(By.desc("Next")), 15_000) != true) fail("Nothing plays")
        d.pressBack()
        d.wait(Until.hasObject(By.text("Albums")), 5_000)
        d.waitForIdle()
    }

    /** Settings → Appearance → Live glass blur, on or off; back on Library afterwards. */
    fun MacrobenchmarkScope.setLiveBlur(on: Boolean) {
        val d = device
        // The tab bar's "Settings" (the lowest one); tap again if the page didn't switch.
        var opened = false
        for (attempt in 0 until 3) {
            val tab = d.findObjects(By.text("Settings")).maxByOrNull { it.visibleBounds.top } ?: fail("No Settings tab")
            tab.click()
            if (d.wait(Until.hasObject(By.textContains("Sign out")), 8_000) == true) { opened = true; break }
        }
        if (!opened) fail("Settings didn't open")
        SystemClock.sleep(1_000)
        var row = d.findObject(By.text("Live glass blur"))
        var tries = 0
        while (row == null && tries++ < 15) {
            val page = d.findObject(By.scrollable(true)) ?: fail("Settings doesn't scroll")
            page.scroll(Direction.DOWN, 0.6f)
            row = d.findObject(By.text("Live glass blur"))
        }
        row ?: fail("No Live glass blur switch")
        val toggle = d.findObject(By.checkable(true).hasDescendant(By.text("Live glass blur"))) ?: row.parent
        if (toggle.isChecked != on) toggle.click()
        SystemClock.sleep(500)
        for (attempt in 0 until 3) {
            (d.findObjects(By.text("Library")).maxByOrNull { it.visibleBounds.top } ?: fail("No Library tab")).click()
            if (d.wait(Until.hasObject(By.text("Albums")), 8_000) == true) break
        }
        d.waitForIdle()
    }

    /** Opens the full player from the mini player, shows the lyrics, goes back twice. */
    fun MacrobenchmarkScope.playerLyricsBack() {
        val d = device
        val next = d.findObject(By.desc("Next")) ?: fail("No mini player")
        // The mini player's title sits left of its buttons, on the same row.
        val b = next.visibleBounds
        d.click(d.displayWidth / 3, b.centerY())
        if (d.wait(Until.hasObject(By.desc("Lyrics")), 10_000) != true) fail("Full player didn't open")
        d.waitForIdle()
        d.findObject(By.desc("Lyrics")).click()
        SystemClock.sleep(1_500)
        d.pressBack()
        d.waitForIdle()
        SystemClock.sleep(500)
        d.pressBack()
        d.wait(Until.gone(By.desc("Lyrics")), 5_000)
        d.waitForIdle()
    }
}

val MacrobenchmarkScope.uiDevice: UiDevice get() = device
