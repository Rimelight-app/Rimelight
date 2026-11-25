package com.tonihk00.clearplay.benchmark

import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.tonihk00.clearplay.benchmark.Journeys.awaitAlbums
import com.tonihk00.clearplay.benchmark.Journeys.flingAlbums
import com.tonihk00.clearplay.benchmark.Journeys.setLiveBlur
import com.tonihk00.clearplay.benchmark.Journeys.signInIfNeeded
import com.tonihk00.clearplay.benchmark.Journeys.startSomething
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * What the live blur (Haze under the mini player and tab bar) costs: the Albums fling with
 * Settings → Live glass blur on and off, something playing so the mini player shows.
 */
@RunWith(AndroidJUnit4::class)
class BlurBenchmarks {
    @get:Rule val rule = MacrobenchmarkRule()

    private fun fling(blur: Boolean) = rule.measureRepeated(
        packageName = TARGET,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = CompilationMode.Partial(BaselineProfileMode.UseIfAvailable),
        startupMode = StartupMode.WARM,
        iterations = 5,
        setupBlock = {
            startActivityAndWait()
            signInIfNeeded()
            awaitAlbums()
            startSomething()
            setLiveBlur(blur)
        },
    ) {
        flingAlbums()
    }

    @Test fun flingBlurOn() = fling(true)

    @Test fun flingBlurOff() = fling(false)
}
