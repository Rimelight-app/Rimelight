package com.tonihk00.clearplay.benchmark

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tonihk00.clearplay.benchmark.Journeys.awaitAlbums
import com.tonihk00.clearplay.benchmark.Journeys.flingAlbums
import com.tonihk00.clearplay.benchmark.Journeys.playerLyricsBack
import com.tonihk00.clearplay.benchmark.Journeys.signInIfNeeded
import com.tonihk00.clearplay.benchmark.Journeys.startSomething
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Generates the Baseline Profile and startup profile (app/src/main/baseline-prof.txt) from the
 * same journeys the benchmarks measure. Run by hand before a release:
 *   ./gradlew :app:generateBaselineProfile   (device or emulator connected, rig server reachable)
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule val rule = BaselineProfileRule()

    /** Cold start to the Albums grid: also the startup profile (dex layout for start-up). */
    @Test fun startup() = rule.collect(packageName = TARGET, includeInStartupProfile = true) {
        pressHome()
        startActivityAndWait()
        signInIfNeeded()
        awaitAlbums()
    }

    /** Scrolling Albums, the full player and lyrics: Baseline Profile only. */
    @Test fun journeys() = rule.collect(packageName = TARGET, includeInStartupProfile = false) {
        pressHome()
        startActivityAndWait()
        signInIfNeeded()
        awaitAlbums()
        flingAlbums()
        startSomething()
        playerLyricsBack()
    }
}
