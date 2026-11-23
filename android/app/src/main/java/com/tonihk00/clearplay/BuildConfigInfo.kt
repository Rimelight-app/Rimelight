package com.tonihk00.clearplay

/** Version info read from the package manager (avoids enabling BuildConfig generation). */
object BuildConfigInfo {
    private val info by lazy {
        runCatching { ClearPlayApp.instance.let { it.packageManager.getPackageInfo(it.packageName, 0) } }.getOrNull()
    }

    val versionName: String by lazy { info?.versionName ?: "dev" }

    /** The build number (versionCode; the CI run number for releases). */
    val versionCode: Long by lazy {
        val i = info ?: return@lazy 0L
        if (android.os.Build.VERSION.SDK_INT >= 28) i.longVersionCode else @Suppress("DEPRECATION") i.versionCode.toLong()
    }
}
