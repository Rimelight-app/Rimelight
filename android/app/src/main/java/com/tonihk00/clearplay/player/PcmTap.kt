package com.tonihk00.clearplay.player

import android.content.Context
import android.content.pm.ApplicationInfo
import android.util.Log
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.AudioOutput
import androidx.media3.exoplayer.audio.AudioOutputProvider
import androidx.media3.exoplayer.audio.ForwardingAudioOutput
import androidx.media3.exoplayer.audio.ForwardingAudioOutputProvider
import java.io.File
import java.io.FileOutputStream

/**
 * Test aid, debug builds only: saves the PCM the player hands to the audio output, so tests can
 * compare it with a reference decode of the same file (`files/pcmtap/<n>-<encoding>-<rate>.raw`).
 * Off unless `files/pcmtap/on` exists (`adb shell run-as <pkg> mkdir -p files/pcmtap; ... touch files/pcmtap/on`).
 */
@UnstableApi
class PcmTapProvider private constructor(inner: AudioOutputProvider, private val dir: File) : ForwardingAudioOutputProvider(inner) {
    private var n = 0

    override fun getAudioOutput(config: AudioOutputProvider.OutputConfig): AudioOutput {
        val file = File(dir, "%02d-%d-%d.raw".format(n++, config.encoding, config.sampleRate))
        Log.i("ClearPlayTap", "open $file channels=${Integer.bitCount(config.channelMask)}")
        return Tap(super.getAudioOutput(config), file)
    }

    private class Tap(out: AudioOutput, file: File) : ForwardingAudioOutput(out) {
        private val stream = FileOutputStream(file)
        private var left = 64L shl 20

        override fun write(buffer: java.nio.ByteBuffer, encodedAccessUnitCount: Int, presentationTimeUs: Long): Boolean {
            val start = buffer.position()
            val copy = buffer.duplicate()
            val done = super.write(buffer, encodedAccessUnitCount, presentationTimeUs)
            val used = buffer.position() - start
            if (used > 0 && left > 0) {
                val bytes = ByteArray(minOf(used.toLong(), left).toInt())
                copy.get(bytes)
                stream.write(bytes)
                left -= bytes.size
            }
            return done
        }

        override fun release() {
            runCatching { stream.close() }
            super.release()
        }
    }

    companion object {
        fun wrap(context: Context, inner: AudioOutputProvider): AudioOutputProvider {
            val debuggable = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
            val dir = File(context.filesDir, "pcmtap")
            return if (debuggable && File(dir, "on").exists()) PcmTapProvider(inner, dir) else inner
        }
    }
}
