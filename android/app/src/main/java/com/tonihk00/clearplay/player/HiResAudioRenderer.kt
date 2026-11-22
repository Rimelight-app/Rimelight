package com.tonihk00.clearplay.player

import android.content.Context
import android.media.MediaFormat
import android.os.Handler
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DecoderReuseEvaluation
import androidx.media3.exoplayer.audio.AudioRendererEventListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.MediaCodecAudioRenderer
import androidx.media3.exoplayer.mediacodec.MediaCodecAdapter
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector

/**
 * True when a song needs float decoding to keep its resolution: FLAC (and other lossless codecs that
 * report their bit depth) above 16 bits. 16-bit and lossy songs decode to 16-bit integers.
 */
fun needsFloatDecode(pcmEncoding: Int): Boolean = when (pcmEncoding) {
    C.ENCODING_PCM_24BIT, C.ENCODING_PCM_24BIT_BIG_ENDIAN,
    C.ENCODING_PCM_32BIT, C.ENCODING_PCM_32BIT_BIG_ENDIAN, C.ENCODING_PCM_FLOAT -> true
    else -> false
}

/**
 * Media3's audio renderer, but it asks the decoder for float output only for songs above 16 bits.
 *
 * With float on for every song, 16-bit FLACs played as loud noise on a Samsung S24 (One UI) while
 * 24-bit ones played fine; the emulator's decoder was exact either way. 16-bit samples fit a 16-bit
 * integer exactly, so those decode as they did in 1.4; 24-bit songs still decode to float, which
 * holds every 24-bit value exactly.
 * A decoder is never reused across that line, so a 24-bit song can't hand its float setup to a 16-bit one.
 */
@UnstableApi
class HiResAudioRenderer(
    context: Context,
    codecAdapterFactory: MediaCodecAdapter.Factory,
    selector: MediaCodecSelector,
    enableDecoderFallback: Boolean,
    handler: Handler?,
    listener: AudioRendererEventListener?,
    sink: AudioSink,
) : MediaCodecAudioRenderer(context, codecAdapterFactory, selector, enableDecoderFallback, handler, listener, sink) {

    override fun getMediaFormat(format: Format, codecMimeType: String, codecMaxInputSize: Int, codecOperatingRate: Float): MediaFormat {
        val mf = super.getMediaFormat(format, codecMimeType, codecMaxInputSize, codecOperatingRate)
        if (!needsFloatDecode(format.pcmEncoding) && mf.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
            mf.setInteger(MediaFormat.KEY_PCM_ENCODING, android.media.AudioFormat.ENCODING_PCM_16BIT)
        }
        return mf
    }

    override fun canReuseCodec(codecInfo: MediaCodecInfo, oldFormat: Format, newFormat: Format, isExplicitReuse: Boolean): DecoderReuseEvaluation {
        if (needsFloatDecode(oldFormat.pcmEncoding) != needsFloatDecode(newFormat.pcmEncoding)) {
            return DecoderReuseEvaluation(
                codecInfo.name, oldFormat, newFormat,
                DecoderReuseEvaluation.REUSE_RESULT_NO, DecoderReuseEvaluation.DISCARD_REASON_APP_OVERRIDE,
            )
        }
        return super.canReuseCodec(codecInfo, oldFormat, newFormat, isExplicitReuse)
    }
}
