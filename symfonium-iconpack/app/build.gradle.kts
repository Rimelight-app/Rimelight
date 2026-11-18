plugins {
    id("com.android.application")
}

android {
    namespace = "com.tonihk00.clearplay.icons"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tonihk00.clearplay.icons"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        // Fixed, non-secret signing key so every CI build can update the previous one.
        // Not a publisher identity: sign with your own key before uploading anywhere.
        create("clearplay") {
            storeFile = file("clearplay-iconpack.jks")
            storePassword = "clearplay"
            keyAlias = "clearplay"
            keyPassword = "clearplay"
        }
    }

    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("clearplay") }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("clearplay")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

