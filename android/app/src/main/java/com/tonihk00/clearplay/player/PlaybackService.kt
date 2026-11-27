package com.tonihk00.clearplay.player

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.MediaCodecAudioRenderer
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.AudioTrackAudioOutputProvider
import androidx.media3.exoplayer.audio.DefaultAudioSink
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
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
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
    private var watcher: QueueWatcher? = null
    private var bitPerfect: BitPerfectOutputProvider? = null
    @Volatile private var nextBits: Int? = null

    override fun onCreate() {
        super.onCreate()
        val http = OkHttpClient.Builder().build()
        // Downloaded songs are read from the offline cache or streamed, as Settings → Player →
        // Playback source says (decided per song when it starts); everything else streams.
        val app = ClearPlayApp.instance
        val network = DefaultDataSource.Factory(this, OkHttpDataSource.Factory(http))
        val dataSource = SourceRouter(
            local = app.downloads.playbackFactory(network),
            network = network,
            useDownload = { key -> app.playsFromDownload(key.removePrefix("song:")) },
            downloadedLength = app.downloads::downloadedLength,
            mayFallBack = { app.settings.state.value.playbackSource != com.tonihk00.clearplay.data.PlaybackSource.Server },
        )
        // Float output keeps 24-bit songs at full resolution (the default cuts them to 16 bits), and
        // BitPerfectOutputProvider sends a USB DAC the exact samples when Settings → Player asks for it.
        val output = BitPerfectOutputProvider(
            this,
            AudioTrackAudioOutputProvider.Builder(this).build(),
            enabled = { app.settings.state.value.bitPerfect },
            sourceBits = { nextBits },
        )
        bitPerfect = output
        val renderers = object : DefaultRenderersFactory(this) {
            // Float decoding only for songs above 16 bits (see HiResAudioRenderer).
            override fun buildAudioRenderers(
                context: Context, extensionRendererMode: Int, mediaCodecSelector: MediaCodecSelector, enableDecoderFallback: Boolean,
                audioSink: AudioSink, eventHandler: Handler, eventListener: AudioRendererEventListener, out: ArrayList<Renderer>,
            ) {
                val built = ArrayList<Renderer>()
                super.buildAudioRenderers(context, extensionRendererMode, mediaCodecSelector, enableDecoderFallback, audioSink, eventHandler, eventListener, built)
                built.mapTo(out) {
                    if (it.javaClass == MediaCodecAudioRenderer::class.java) {
                        HiResAudioRenderer(context, codecAdapterFactory, mediaCodecSelector, enableDecoderFallback, eventHandler, eventListener, audioSink)
                    } else it
                }
            }

            override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioOutputPlaybackParams: Boolean): AudioSink =
                DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(true)
                    .setAudioOutputProvider(PcmTapProvider.wrap(context, output))
                    .build()
        }
        val player = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true) // pause when headphones / Bluetooth drop
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        scrobbler = Scrobbler(player, scope, client = { ClearPlayApp.instance.client })
        player.addListener(scrobbler)
        // Saved queue (playback resumption), "Continue on other devices", the Resume shortcut and
        // shuffle library's refill all follow this player, so they work without the UI.
        app.queueFiller.attach(player)
        watcher = QueueWatcher(
            player, scope, app.queueStore,
            serverKey = { QueueStore.keyOf(app.client) },
            endless = { app.queueFiller.endless.value },
            autoEdit = { app.queueFiller.adding },
            handoff = { app.handoff },
            onSongChange = { app.shortcuts.songChanged(it) },
        ).also(player::addListener)
        app.servicePlayer = player
        // Songs that can't be played: retry once, then skip with a message; pause when the server
        // can't be reached; stop after 3 in a row or on the last song (PlaybackErrors).
        player.addListener(
            PlaybackErrors(
                player, scope,
                isLocalItem = { item -> item.toSong().isLocal || app.playsFromDownload(item.mediaId) },
                serverAnswers = {
                    val c = app.client
                    c != null && (kotlinx.coroutines.withTimeoutOrNull(5_000) { runCatching { c.ping() }.isSuccess } ?: false)
                },
                songGone = { id ->
                    val c = app.client
                    c != null && try {
                        c.song(id); false
                    } catch (e: com.tonihk00.clearplay.data.api.SubsonicException) {
                        e.code == 70
                    } catch (e: Exception) {
                        false
                    }
                },
                markUnreachable = { app.connection.recheck() },
                message = { app.playbackMessages.tryEmit(it) },
            ),
        )
        player.addListener(object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) { noteBits(player) }
            override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) { noteBits(player) }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Playing again after the queue ended: Media3's usual grace after a pause.
                if (isPlaying) setForegroundServiceTimeoutMs(DEFAULT_FOREGROUND_SERVICE_TIMEOUT_MS)
            }
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) playbackEnded(player)
            }
        })
        // Turning bit-perfect on or off, or plugging a USB DAC in, takes effect at once: re-seeking
        // makes the player open a new output for the playing song. (Media3 skips a seek to the exact
        // current millisecond, so it moves 1 ms.)
        fun reopenOutput() {
            if (player.mediaItemCount == 0 || player.playbackState == Player.STATE_IDLE) return
            val pos = player.currentPosition
            player.seekTo(if (pos > 0) pos - 1 else 1)
        }
        output.onUsbChanged = { scope.launch { if (app.settings.state.value.bitPerfect) reopenOutput() } }
        scope.launch {
            app.settings.state.map { it.bitPerfect }.distinctUntilChanged().drop(1).collect { reopenOutput() }
        }

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
            .setBitmapLoader(CoverBitmapLoader(this, scope))
            .setSessionActivity(open)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            // The service stops: keep the queue now (onDestroy may not come before the process goes).
            watcher?.saveBlocking()
            ClearPlayApp.instance.handoff.saveNow(QueueHandoff.SaveEvent.quit)
            stopSelf()
        }
    }

    /** Bit depth of the playing song and the next one (a 16-bit-only DAC may only take 16-bit songs). */
    private fun noteBits(player: Player) {
        val next = player.nextMediaItemIndex.takeIf { it != C.INDEX_UNSET }?.let(player::getMediaItemAt)
        val bits = listOfNotNull(player.currentMediaItem, next).map { it.toSong().bitDepth ?: 24 }
        nextBits = bits.maxOrNull()
    }

    /**
     * The queue played to its end (repeat off): stop on the last song, paused at its start, the
     * queue kept (like the desktop), so Resume, the notification and media buttons play it from
     * the beginning, also after the app was killed (the saved position is 0, not the song's end).
     * Being a pause, it is saved, also to the server with Continue on other devices on.
     * Playback is over, so the service leaves the foreground now instead of after Media3's
     * 10-minute grace (Android 17's background-audio rules). Playing again (a user action:
     * notification, media button, the app) brings it back.
     */
    private fun playbackEnded(player: Player) {
        stopOnLastSong(player)
        setForegroundServiceTimeoutMs(0)
    }

    override fun onDestroy() {
        val app = ClearPlayApp.instance
        session?.player?.let { p ->
            // Last chance to keep the queue: written synchronously, and sent to the server if
            // "Continue on other devices" is on.
            watcher?.saveBlocking()
            app.handoff.saveNow(QueueHandoff.SaveEvent.quit)
            app.queueFiller.detach(p)
        }
        app.servicePlayer = null
        bitPerfect?.clear()
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

        /**
         * Playback resumption (media button or the system's resume card after the app was killed
         * or the phone restarted): the queue the service saved, if it belongs to the account in
         * use. Items are built again with today's client, bitrate and format; saved stream URLs
         * are never reused. [isForPlayback] false (the resume card after a reboot): disk only, no
         * network; only the current song, with the saved title and the cached cover.
         */
        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            isForPlayback: Boolean,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val future = com.google.common.util.concurrent.SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
            scope.launch {
                try {
                    val restored = Resumption.restore(this@PlaybackService, mediaSession.player, isForPlayback)
                    if (restored == null) future.setException(IllegalStateException("No saved queue for this account"))
                    else future.set(restored)
                } catch (e: Exception) {
                    future.setException(e)
                }
            }
            return future
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val root = MediaItem.Builder()
                .setMediaId(ROOT)
                .setMediaMetadata(
                    MediaMetadata.Builder().setTitle("Rimelight").setIsBrowsable(true).setIsPlayable(false)
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
