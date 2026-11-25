plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.baselineprofile)
}

/**
 * Startup and scrolling benchmarks (Macrobenchmark) and the Baseline Profile generator, run
 * against a release-like build of :app on a connected device or emulator:
 *   ./gradlew :benchmark:connectedBenchmarkReleaseAndroidTest     (measure)
 *   ./gradlew :app:generateBaselineProfile                         (regenerate the profile)
 * The journeys sign in to the server given by the instrumentation arguments cpServer / cpUser /
 * cpPassword (default: the dev rig, 10.0.2.2:4544 admin/test1234) if the app shows its login.
 */
android {
    namespace = "com.tonihk00.clearplay.benchmark"
    compileSdk = 37

    defaultConfig {
        minSdk = 28
        targetSdk = 36
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Emulators are allowed (their numbers are labelled "emulator" in the changelog).
        testInstrumentationRunnerArguments["androidx.benchmark.suppressErrors"] = "EMULATOR,LOW-BATTERY"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true
}

baselineProfile {
    useConnectedDevices = true
}

dependencies {
    implementation(libs.androidx.test.ext.junit)
    implementation(libs.androidx.uiautomator)
    implementation(libs.androidx.benchmark.macro.junit4)
}
