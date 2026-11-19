package com.tonihk00.clearplay

/** Version info read from the package manager (avoids enabling BuildConfig generation). */
object BuildConfigInfo {
    val versionName: String by lazy {
        runCatching {
            val app = ClearPlayApp.instance
            app.packageManager.getPackageInfo(app.packageName, 0).versionName
        }.getOrNull() ?: "dev"
    }
}
