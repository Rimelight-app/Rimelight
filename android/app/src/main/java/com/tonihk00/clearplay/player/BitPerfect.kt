package com.tonihk00.clearplay.player

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioMixerAttributes
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.AudioOutput
import androidx.media3.exoplayer.audio.AudioOutputProvider
import androidx.media3.exoplayer.audio.ForwardingAudioOutput
import androidx.media3.exoplayer.audio.ForwardingAudioOutputProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.round

/** Where the audio really goes. The player screen shows it under the quality line. */
data class OutputPath(
    val kind: Kind = Kind.Unknown,
    /** Device name, e.g. "FiiO KA3" or "Speaker". */
    val device: String? = null,
    /** Rate the device receives: the song's own rate when bit-perfect, else the mixer's. */
    val sampleRate: Int = 0,
    /** Bits per sample sent to a bit-perfect DAC (0 when the mixer decides). */
    val bits: Int = 0,
    /** Why bit-perfect isn't on although it was asked for, or null. */
    val reason: String? = null,
) {
    enum class Kind { Unknown, BitPerfect, Mixer, Bluetooth }
}

/** Shared between the playback service (writes) and the UI (reads); both run in the app process. */
object AudioPath {
    private val _state = MutableStateFlow(OutputPath())
    val state: StateFlow<OutputPath> = _state.asStateFlow()
    internal fun set(p: OutputPath) { _state.value = p }

    /** Bit-perfect output needs Android 14 (the mixer-attributes API). */
    val supported: Boolean get() = Build.VERSION.SDK_INT >= 34
}

/** One output format a USB device offers (plain values, so the choice can be unit-tested). */
data class MixerOption(val sampleRate: Int, val encoding: Int, val channelMask: Int, val bitPerfect: Boolean)

/**
 * Picks the bit-perfect format for a track: same sample rate and channels, and the integer
 * encoding with the most bits (16-bit samples padded into 24 or 32 bits are unchanged).
 * A 16-bit-only DAC is used only for 16-bit songs ([sourceBits]), else a 24-bit song would be cut.
 */
fun pickMixer(options: List<MixerOption>, sampleRate: Int, channelMask: Int, sourceBits: Int?): MixerOption? {
    val fits = options.filter { it.bitPerfect && it.sampleRate == sampleRate && it.channelMask == channelMask }
    for (enc in listOf(AudioFormat.ENCODING_PCM_32BIT, AudioFormat.ENCODING_PCM_24BIT_PACKED)) {
        fits.firstOrNull { it.encoding == enc }?.let { return it }
    }
    if ((sourceBits ?: 24) <= 16) fits.firstOrNull { it.encoding == AudioFormat.ENCODING_PCM_16BIT }?.let { return it }
    return null
}

fun bitsOf(encoding: Int): Int = when (encoding) {
    AudioFormat.ENCODING_PCM_16BIT -> 16
    AudioFormat.ENCODING_PCM_24BIT_PACKED -> 24
    AudioFormat.ENCODING_PCM_32BIT, AudioFormat.ENCODING_PCM_FLOAT -> 32
    else -> 0
}

private fun bytesOf(encoding: Int): Int = when (encoding) {
    AudioFormat.ENCODING_PCM_16BIT -> 2
    AudioFormat.ENCODING_PCM_24BIT_PACKED -> 3
    else -> 4
}

/**
 * Converts the player's PCM (float, or 16-bit) into the DAC's integer format, sample by sample.
 * The FLAC decoder gives float = integer / 2^(bits-1), so scaling back is exact: no dither, no rounding
 * of real data. Reads from [src] (position to limit) and writes into [dst]; returns the samples converted.
 */
fun convertPcm(src: ByteBuffer, fromEncoding: Int, dst: ByteBuffer, toEncoding: Int): Int {
    val s = src.duplicate().order(ByteOrder.LITTLE_ENDIAN)
    val inBytes = bytesOf(fromEncoding)
    val outBits = bitsOf(toEncoding)
    var n = 0
    while (s.remaining() >= inBytes) {
        // As a 32-bit integer (top-aligned), then shifted down to the DAC's width.
        val v32: Int = when (fromEncoding) {
            AudioFormat.ENCODING_PCM_FLOAT -> {
                val d = round(s.float.toDouble() * 2147483648.0)
                when {
                    d >= Int.MAX_VALUE -> Int.MAX_VALUE
                    d <= Int.MIN_VALUE -> Int.MIN_VALUE
                    else -> d.toInt()
                }
            }
            else -> s.short.toInt() shl 16
        }
        when (outBits) {
            32 -> dst.putInt(v32)
            24 -> { val v = v32 shr 8; dst.put(v.toByte()); dst.put((v shr 8).toByte()); dst.put((v shr 16).toByte()) }
            else -> dst.putShort((v32 shr 16).toShort())
        }
        n++
    }
    return n
}

/**
 * Wraps Media3's AudioTrack output. With the setting on and a USB DAC attached (Android 14+), it asks the
 * system to open the DAC at the track's own rate and bit depth with the mixer bypassed
 * ([AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT]), and feeds it the matching integer samples.
 * Otherwise playback goes through the normal Android mixer, unchanged.
 */
@UnstableApi
class BitPerfectOutputProvider(
    context: Context,
    inner: AudioOutputProvider,
    private val enabled: () -> Boolean,
    /** Bit depth of the song about to play (only matters for 16-bit-only DACs). */
    private val sourceBits: () -> Int?,
) : ForwardingAudioOutputProvider(inner) {
    private val am = context.getSystemService(AudioManager::class.java)
    private val media = android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).build()
    @Volatile private var setOn: AudioDeviceInfo? = null
    @Volatile private var lastRate = 0
    private val main = Handler(Looper.getMainLooper())

    /** Called when a USB device comes or goes, so the service can restart the output. */
    var onUsbChanged: (() -> Unit)? = null

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) {
            if (added.any(::isUsb)) onUsbChanged?.invoke() else refreshMixerPath()
        }
        override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) {
            if (removed.any { it.id == setOn?.id }) setOn = null
            if (removed.any(::isUsb)) onUsbChanged?.invoke() else refreshMixerPath()
        }
    }

    init {
        am.registerAudioDeviceCallback(deviceCallback, main)
        if (Build.VERSION.SDK_INT >= 34) Api34.listen(this)
    }

    override fun getAudioOutput(config: AudioOutputProvider.OutputConfig): AudioOutput {
        lastRate = config.sampleRate
        val pcm = config.encoding == AudioFormat.ENCODING_PCM_FLOAT || config.encoding == AudioFormat.ENCODING_PCM_16BIT
        val usb = if (enabled() && pcm && !config.isOffload && !config.isTunneling) usbDevice() else null
        if (usb == null || Build.VERSION.SDK_INT < 34) {
            clear()
            AudioPath.set(mixerPath(if (enabled()) reasonOff(pcm) else null))
            return super.getAudioOutput(config)
        }
        val pick = Api34.apply(this, usb, config, sourceBits())
        if (pick == null) {
            clear()
            AudioPath.set(mixerPath("${usb.productName} doesn't offer bit-perfect ${khz(config.sampleRate)}"))
            return super.getAudioOutput(config)
        }
        setOn = usb
        val ratio = bytesOf(pick.encoding).toDouble() / bytesOf(config.encoding)
        val outConfig = config.buildUpon()
            .setEncoding(pick.encoding)
            .setBufferSize((config.bufferSize * ratio).toInt().let { it - it % (bytesOf(pick.encoding) * Integer.bitCount(config.channelMask)) })
            .setUsePlaybackParameters(false)
            .build()
        val out = super.getAudioOutput(outConfig)
        AudioPath.set(OutputPath(OutputPath.Kind.BitPerfect, usb.productName?.toString(), config.sampleRate, bitsOf(pick.encoding)))
        return ConvertingAudioOutput(out, config.encoding, pick.encoding)
    }

    override fun release() {
        am.unregisterAudioDeviceCallback(deviceCallback)
        if (Build.VERSION.SDK_INT >= 34) Api34.unlisten(this)
        clear()
        super.release()
    }

    /** Drops our preferred format, so other apps get the normal mixer again. */
    fun clear() {
        val dev = setOn ?: return
        setOn = null
        if (Build.VERSION.SDK_INT >= 34) runCatching { am.clearPreferredMixerAttributes(media, dev) }
    }

    private fun reasonOff(pcm: Boolean): String = when {
        Build.VERSION.SDK_INT < 34 -> "Bit-perfect needs Android 14"
        !pcm -> "This format can't play bit-perfect"
        else -> "Connect a USB DAC for bit-perfect"
    }

    private fun isUsb(d: AudioDeviceInfo) = d.isSink && (d.type == AudioDeviceInfo.TYPE_USB_DEVICE || d.type == AudioDeviceInfo.TYPE_USB_HEADSET)

    private fun usbDevice(): AudioDeviceInfo? = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull(::isUsb)

    /** Best guess of where the mixer sends media (USB, then Bluetooth, then wired, then speaker). */
    private fun mixerPath(reason: String?): OutputPath {
        val outs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        val bt = setOf(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER)
        val wired = setOf(AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET)
        val dev = outs.firstOrNull(::isUsb) ?: outs.firstOrNull { it.type in bt } ?: outs.firstOrNull { it.type in wired }
            ?: outs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        val rate = am.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toIntOrNull() ?: 0
        val name = when {
            dev == null -> null
            dev.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
            dev.type in wired -> "Headphones"
            else -> dev.productName?.toString()
        }
        val kind = if (dev != null && dev.type in bt) OutputPath.Kind.Bluetooth else OutputPath.Kind.Mixer
        return OutputPath(kind, name, rate, 0, reason)
    }

    private fun refreshMixerPath() {
        val cur = AudioPath.state.value
        if (cur.kind != OutputPath.Kind.BitPerfect && cur.kind != OutputPath.Kind.Unknown) AudioPath.set(mixerPath(cur.reason))
    }

    private fun khz(r: Int) = if (r % 1000 == 0) "${r / 1000} kHz" else "%.1f kHz".format(r / 1000.0)

    @RequiresApi(34)
    private object Api34 {
        private val listeners = HashMap<BitPerfectOutputProvider, AudioManager.OnPreferredMixerAttributesChangedListener>()

        fun apply(p: BitPerfectOutputProvider, usb: AudioDeviceInfo, config: AudioOutputProvider.OutputConfig, sourceBits: Int?): MixerOption? {
            val all = runCatching { p.am.getSupportedMixerAttributes(usb) }.getOrDefault(emptyList())
            val options = all.map {
                MixerOption(it.format.sampleRate, it.format.encoding, it.format.channelMask, it.mixerBehavior == AudioMixerAttributes.MIXER_BEHAVIOR_BIT_PERFECT)
            }
            val pick = pickMixer(options, config.sampleRate, config.channelMask, sourceBits) ?: return null
            val attrs = all[options.indexOf(pick)]
            val ok = runCatching { p.am.setPreferredMixerAttributes(p.media, usb, attrs) }.getOrDefault(false)
            return pick.takeIf { ok }
        }

        fun listen(p: BitPerfectOutputProvider) {
            val l = AudioManager.OnPreferredMixerAttributesChangedListener { _, device, mixer ->
                // The system dropped our format (device gone, another app took it): show the truth.
                if (mixer == null && device.id == p.setOn?.id) {
                    p.setOn = null
                    AudioPath.set(p.mixerPath(null))
                }
            }
            listeners[p] = l
            p.am.addOnPreferredMixerAttributesChangedListener({ p.main.post(it) }, l)
        }

        fun unlisten(p: BitPerfectOutputProvider) {
            listeners.remove(p)?.let { runCatching { p.am.removeOnPreferredMixerAttributesChangedListener(it) } }
        }
    }
}

/**
 * Feeds the DAC integer samples while the player keeps writing float. Frames stay the same, so
 * positions and buffer sizes (in frames) match; only bytes per sample change. Volume stays at
 * full scale: any gain (e.g. ducking for a notification) would change the samples.
 */
@UnstableApi
private class ConvertingAudioOutput(
    private val out: AudioOutput,
    private val from: Int,
    private val to: Int,
) : ForwardingAudioOutput(out) {
    private var pending: ByteBuffer? = null
    private var srcStart = 0
    private val inBytes = bytesOf(from)
    private val outBytes = bytesOf(to)

    init { out.setVolume(1f) }

    override fun write(buffer: ByteBuffer, encodedAccessUnitCount: Int, presentationTimeUs: Long): Boolean {
        var p = pending
        if (p == null || !p.hasRemaining()) {
            // A new buffer from the sink (it retries the same one until it is fully written).
            val need = buffer.remaining() / inBytes * outBytes
            p = if (p != null && p.capacity() >= need) p.also { it.clear() } else ByteBuffer.allocateDirect(maxOf(need, 4096)).order(ByteOrder.LITTLE_ENDIAN)
            srcStart = buffer.position()
            convertPcm(buffer, from, p, to)
            p.flip()
            pending = p
        }
        val done = out.write(p, encodedAccessUnitCount, presentationTimeUs)
        buffer.position(srcStart + p.position() / outBytes * inBytes)
        return done && !p.hasRemaining()
    }

    override fun flush() {
        pending?.let { it.clear(); it.limit(0) }
        super.flush()
    }

    override fun setVolume(volume: Float) = out.setVolume(1f)
}
