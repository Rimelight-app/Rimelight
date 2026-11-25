package com.tonihk00.clearplay.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

private val Context.settingsStore by preferencesDataStore("settings")

private val handledJson = kotlinx.serialization.json.Json

enum class Backdrop(val label: String) { Vivid("Vivid"), Balanced("Balanced"), Dim("Dim"), Off("Off") }

/** Formats Navidrome can transcode to when a bitrate cap applies (same as the desktop). */
enum class StreamFormat(val label: String, val param: String) { Opus("Opus", "opus"), Mp3("MP3", "mp3"), Aac("AAC", "aac") }

/** Where a downloaded song plays from (Settings → Player). Songs that aren't downloaded always stream. */
enum class PlaybackSource(val label: String, val detail: String) {
    Auto("Auto", "Server when connected, downloads when offline"),
    Server("Always server", "Downloads are never used for playing, even offline"),
    Downloads("Always downloads", "Downloaded songs always play from this phone");

    /**
     * Whether a song plays from its download. [downloaded]: fully downloaded; [online]: the
     * server answers; [hasServer]: signed in to one (with "music on this phone" there is none).
     */
    fun useDownload(downloaded: Boolean, online: Boolean, hasServer: Boolean): Boolean = when {
        !downloaded -> false
        !hasServer -> true
        this == Downloads -> true
        this == Server -> false
        else -> !online
    }
}

data class Settings(
    /** 0 = original quality. */
    val wifiBitrate: Int = 0,
    val mobileBitrate: Int = 0,
    val format: StreamFormat = StreamFormat.Opus,
    val downloadBitrate: Int = 0,
    val downloadWifiOnly: Boolean = true,
    val scrobble: Boolean = true,
    val backdrop: Backdrop = Backdrop.Balanced,
    val liveBlur: Boolean = true,
    /** Include the phone's own music when offline or without a server. */
    val phoneMusic: Boolean = true,
    val playbackSource: PlaybackSource = PlaybackSource.Auto,
    /** Send the file's exact samples to a USB DAC (Android 14+), bypassing the Android mixer. */
    val bitPerfect: Boolean = false,
    /** Continue on other devices: save the queue and position to Navidrome (off by default). */
    val syncQueue: Boolean = false,
) {
    /**
     * Whether something in the app would change the samples. Bit-perfect output is only honest
     * when this is false: every future sound feature (ReplayGain, EQ, crossfade, speed) must
     * be added here and stay off while bit-perfect is on.
     */
    fun alteringSamples(): Boolean = false
}

/** User settings in DataStore, exposed as a StateFlow so the player service can read them synchronously. */
class AppSettings(
    private val context: Context,
    scope: CoroutineScope,
    /**
     * Live glass blur on a first run (no saved choice yet): see [liveBlurDefault]. Written to
     * DataStore once, so it never changes under the user later.
     */
    private val blurDefault: Boolean = true,
) {
    private object K {
        val wifi = intPreferencesKey("wifi_bitrate")
        val mobile = intPreferencesKey("mobile_bitrate")
        val format = stringPreferencesKey("format")
        val dlBitrate = intPreferencesKey("download_bitrate")
        val dlWifi = booleanPreferencesKey("download_wifi_only")
        val scrobble = booleanPreferencesKey("scrobble")
        val backdrop = stringPreferencesKey("backdrop")
        val liveBlur = booleanPreferencesKey("live_blur")
        val phoneMusic = booleanPreferencesKey("phone_music")
        val playbackSource = stringPreferencesKey("playback_source")
        val bitPerfect = booleanPreferencesKey("bit_perfect")
        val syncQueue = booleanPreferencesKey("sync_queue")
        val handled = stringPreferencesKey("handled_changed")
    }

    private fun read(p: Preferences) = Settings(
        wifiBitrate = p[K.wifi] ?: 0,
        mobileBitrate = p[K.mobile] ?: 0,
        format = p[K.format]?.let { runCatching { StreamFormat.valueOf(it) }.getOrNull() } ?: StreamFormat.Opus,
        downloadBitrate = p[K.dlBitrate] ?: 0,
        downloadWifiOnly = p[K.dlWifi] ?: true,
        scrobble = p[K.scrobble] ?: true,
        backdrop = p[K.backdrop]?.let { runCatching { Backdrop.valueOf(it) }.getOrNull() } ?: Backdrop.Balanced,
        liveBlur = p[K.liveBlur] ?: blurDefault,
        phoneMusic = p[K.phoneMusic] ?: true,
        playbackSource = p[K.playbackSource]?.let { runCatching { PlaybackSource.valueOf(it) }.getOrNull() } ?: PlaybackSource.Auto,
        bitPerfect = p[K.bitPerfect] ?: false,
        syncQueue = p[K.syncQueue] ?: false,
    )

    val state: StateFlow<Settings> = context.settingsStore.data.map(::read).stateIn(scope, SharingStarted.Eagerly, Settings(liveBlur = blurDefault))

    init {
        scope.launch { context.settingsStore.edit { if (it[K.liveBlur] == null) it[K.liveBlur] = blurDefault } }
    }

    suspend fun update(change: (Settings) -> Settings) {
        context.settingsStore.edit { p ->
            val s = change(read(p))
            p[K.wifi] = s.wifiBitrate
            p[K.mobile] = s.mobileBitrate
            p[K.format] = s.format.name
            p[K.dlBitrate] = s.downloadBitrate
            p[K.dlWifi] = s.downloadWifiOnly
            p[K.scrobble] = s.scrobble
            p[K.backdrop] = s.backdrop.name
            p[K.liveBlur] = s.liveBlur
            p[K.phoneMusic] = s.phoneMusic
            p[K.playbackSource] = s.playbackSource.name
            p[K.bitPerfect] = s.bitPerfect
            p[K.syncQueue] = s.syncQueue
        }
    }

    /**
     * "Continue on other devices": per server account ("user@address"), the latest `changed` of
     * the server's saved queue this phone has dealt with (Continue, ×, or playback started here).
     * Always a value copied from the server, never this phone's clock.
     */
    val handledChanged: StateFlow<Map<String, String>> = context.settingsStore.data.map { p ->
        p[K.handled]?.let { runCatching { handledJson.decodeFromString<Map<String, String>>(it) }.getOrNull() } ?: emptyMap()
    }.stateIn(scope, SharingStarted.Eagerly, emptyMap())

    suspend fun setHandledChanged(key: String, value: String) {
        context.settingsStore.edit { p ->
            val map = p[K.handled]?.let { runCatching { handledJson.decodeFromString<Map<String, String>>(it) }.getOrNull() }.orEmpty()
            p[K.handled] = handledJson.encodeToString(map + (key to value))
        }
    }
}

/**
 * Live glass blur's first-run setting. Measured in 1.6.0: on mid-range phones the live blur costs
 * more than the frame budget allows while scrolling, so it starts on only where Android vouches for
 * the hardware (media performance class 13 or newer, i.e. Build.VERSION.MEDIA_PERFORMANCE_CLASS
 * ≥ 33) and never on low-RAM devices. Someone updating from an earlier version keeps blur on (the
 * setting they had). The Settings switch is unchanged either way.
 */
fun liveBlurDefault(updatedFromEarlier: Boolean, mediaPerformanceClass: Int, lowRam: Boolean): Boolean = when {
    updatedFromEarlier -> true
    lowRam -> false
    else -> mediaPerformanceClass >= 33
}
