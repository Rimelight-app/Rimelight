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

private val Context.settingsStore by preferencesDataStore("settings")

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
) {
    /**
     * Whether something in the app would change the samples. Bit-perfect output is only honest
     * when this is false: every future sound feature (ReplayGain, EQ, crossfade, speed) must
     * be added here and stay off while bit-perfect is on.
     */
    fun alteringSamples(): Boolean = false
}

/** User settings in DataStore, exposed as a StateFlow so the player service can read them synchronously. */
class AppSettings(private val context: Context, scope: CoroutineScope) {
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
    }

    private fun read(p: Preferences) = Settings(
        wifiBitrate = p[K.wifi] ?: 0,
        mobileBitrate = p[K.mobile] ?: 0,
        format = p[K.format]?.let { runCatching { StreamFormat.valueOf(it) }.getOrNull() } ?: StreamFormat.Opus,
        downloadBitrate = p[K.dlBitrate] ?: 0,
        downloadWifiOnly = p[K.dlWifi] ?: true,
        scrobble = p[K.scrobble] ?: true,
        backdrop = p[K.backdrop]?.let { runCatching { Backdrop.valueOf(it) }.getOrNull() } ?: Backdrop.Balanced,
        liveBlur = p[K.liveBlur] ?: true,
        phoneMusic = p[K.phoneMusic] ?: true,
        playbackSource = p[K.playbackSource]?.let { runCatching { PlaybackSource.valueOf(it) }.getOrNull() } ?: PlaybackSource.Auto,
        bitPerfect = p[K.bitPerfect] ?: false,
    )

    val state: StateFlow<Settings> = context.settingsStore.data.map(::read).stateIn(scope, SharingStarted.Eagerly, Settings())

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
        }
    }
}
