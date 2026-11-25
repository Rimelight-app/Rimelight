package com.tonihk00.clearplay.benchmark

import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.ExperimentalMetricApi
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
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
 * Startup (timeToInitialDisplay, timeToFullDisplay = reportFullyDrawn once the first album
 * covers are on screen) and frame timing (p50/p90/p99, overrun → jank) for the three journeys.
 * Partial compilation uses the Baseline Profile when the app ships one, like an install from
 * the package installer.
 */
@RunWith(AndroidJUnit4::class)
class Benchmarks {
    @get:Rule val rule = MacrobenchmarkRule()

    private companion object { var signedIn = false }

    private val compilation = CompilationMode.Partial(BaselineProfileMode.UseIfAvailable)

    @Test fun coldStartToAlbums() = rule.measureRepeated(
        packageName = TARGET,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = compilation,
        startupMode = StartupMode.COLD,
        iterations = 8,
        setupBlock = {
            // Sign in once (first run on a device), outside the measured start.
            if (!signedIn) {
                startActivityAndWait()
                signInIfNeeded()
                awaitAlbums()
                signedIn = true
            }
            pressHome()
        },
    ) {
        startActivityAndWait()
        awaitAlbums()
    }

    @Test fun flingAlbums() = rule.measureRepeated(
        packageName = TARGET,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = compilation,
        startupMode = StartupMode.WARM,
        iterations = 5,
        setupBlock = {
            startActivityAndWait()
            signInIfNeeded()
            awaitAlbums()
        },
    ) {
        flingAlbums()
    }

    @Test fun playerLyricsBack() = rule.measureRepeated(
        packageName = TARGET,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = compilation,
        startupMode = StartupMode.WARM,
        iterations = 5,
        setupBlock = {
            startActivityAndWait()
            signInIfNeeded()
            awaitAlbums()
            startSomething()
        },
    ) {
        playerLyricsBack()
    }
}
