package com.tonihk00.clearplay.player

import android.app.Notification
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler
import com.tonihk00.clearplay.ClearPlayApp
import com.tonihk00.clearplay.R

/** Runs offline downloads in the foreground with a quiet progress notification. */
@UnstableApi
class CpDownloadService : DownloadService(
    NOTIFICATION_ID,
    DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
    CHANNEL_ID,
    R.string.downloads_channel,
    0,
) {
    private val helper by lazy { DownloadNotificationHelper(this, CHANNEL_ID) }

    override fun getDownloadManager(): DownloadManager = ClearPlayApp.instance.downloads.manager

    // No WorkManager scheduler: waiting downloads resume the next time the app runs.
    override fun getScheduler(): Scheduler? = null

    override fun getForegroundNotification(downloads: MutableList<Download>, notMetRequirements: Int): Notification =
        helper.buildProgressNotification(
            this, R.drawable.ic_stat_clearplay, null,
            if (notMetRequirements != 0) getString(R.string.downloads_waiting_wifi) else null,
            downloads, notMetRequirements,
        )

    private companion object {
        const val NOTIFICATION_ID = 2001
        const val CHANNEL_ID = "downloads"
    }
}
