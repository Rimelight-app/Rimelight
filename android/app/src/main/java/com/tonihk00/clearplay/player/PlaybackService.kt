package com.tonihk00.clearplay.player

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.tonihk00.clearplay.ClearPlayApp
import com.tonihk00.clearplay.MainActivity
import com.tonihk00.clearplay.data.Downloads
import com.tonihk00.clearplay.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import okhttp3.OkHttpClient

/**
 * Playback runs here so it survives the UI: notification, lock screen, Bluetooth and
 * (later) Android Auto all talk to this MediaLibrarySession.
 */
@UnstableApi
class PlaybackService : MediaLibraryService() {
    private var session: MediaLibrarySession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var scrobbler: Scrobbler

    override fun onCreate() {
        super.onCreate()
        val http = OkHttpClient.Builder().build()
        // Downloaded songs are read from the offline cache; everything else streams.
        val dataSource = ClearPlayApp.instance.downloads.playbackFactory(
            DefaultDataSource.Factory(this, OkHttpDataSource.Factory(http)),
        )
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true) // pause when headphones / Bluetooth drop
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        scrobbler = Scrobbler(player, scope) { ClearPlayApp.instance.client }
        player.addListener(scrobbler)

        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // ClearPlay logo in the status bar instead of Media3's generic note icon.
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this).build().also { it.setSmallIcon(R.drawable.ic_stat_clearplay) },
        )
        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(open)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        scrobbler.release()
        scope.cancel()
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    private inner class LibraryCallback : MediaLibrarySession.Callback {
        /** Restores the stream URL that Media3 strips between controller and session. */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            val client = ClearPlayApp.instance.client
            val resolved = mediaItems.map { item ->
                val uri = item.requestMetadata.mediaUri
                    ?: client?.streamUrl(item.mediaId)?.let(android.net.Uri::parse)
                if (uri == null) item else item.buildUpon().setUri(uri).setCustomCacheKey(Downloads.cacheKey(item.mediaId)).build()
            }
            return Futures.immediateFuture(resolved.toMutableList())
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val root = MediaItem.Builder()
                .setMediaId(ROOT)
                .setMediaMetadata(
                    MediaMetadata.Builder().setTitle("ClearPlay").setIsBrowsable(true).setIsPlayable(false)
                        .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED).build(),
                ).build()
            return Futures.immediateFuture(LibraryResult.ofItem(root, params))
        }

        // Android Auto browsing arrives in stage 2; until then the tree is empty.
        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
            Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
    }

    companion object {
        private const val ROOT = "root"
    }
}
