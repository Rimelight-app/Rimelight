package com.tonihk00.clearplay

import android.media.AudioFormat
import com.tonihk00.clearplay.player.MixerOption
import com.tonihk00.clearplay.player.OutputPath
import com.tonihk00.clearplay.player.convertPcm
import com.tonihk00.clearplay.player.needsFloatDecode
import com.tonihk00.clearplay.player.noMixerReason
import com.tonihk00.clearplay.data.Downloads
import androidx.media3.common.C
import androidx.media3.common.Format
import com.tonihk00.clearplay.player.pickMixer
import com.tonihk00.clearplay.ui.player.outputText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class BitPerfectTest {
    private val stereo = AudioFormat.CHANNEL_OUT_STEREO
    private val i16 = AudioFormat.ENCODING_PCM_16BIT
    private val i24 = AudioFormat.ENCODING_PCM_24BIT_PACKED
    private val i32 = AudioFormat.ENCODING_PCM_32BIT
    private val f32 = AudioFormat.ENCODING_PCM_FLOAT

    private val dac = listOf(44_100, 48_000, 88_200, 96_000, 192_000).flatMap { r ->
        listOf(i16, i24, i32).map { MixerOption(r, it, stereo, bitPerfect = true) } + MixerOption(r, i16, stereo, bitPerfect = false)
    }

    @Test fun picksSameRateWithMostBits() {
        assertEquals(MixerOption(88_200, i32, stereo, true), pickMixer(dac, 88_200, stereo, 24))
        assertEquals(MixerOption(44_100, i32, stereo, true), pickMixer(dac, 44_100, stereo, 16))
    }

    @Test fun neverPicksAnotherRateOrNonBitPerfect() {
        assertNull(pickMixer(dac, 176_400, stereo, 24))
        assertNull(pickMixer(dac.filter { !it.bitPerfect }, 44_100, stereo, 16))
        assertNull(pickMixer(dac, 44_100, AudioFormat.CHANNEL_OUT_MONO, 16))
    }

    @Test fun sixteenBitDacOnlyForSixteenBitSongs() {
        val old = listOf(MixerOption(44_100, i16, stereo, true))
        assertEquals(old[0], pickMixer(old, 44_100, stereo, 16))
        assertNull(pickMixer(old, 44_100, stereo, 24))
        assertEquals(MixerOption(48_000, i24, stereo, true), pickMixer(dac.filter { it.encoding != i32 }, 48_000, stereo, 24))
    }

    private fun floats(vararg v: Float): ByteBuffer =
        ByteBuffer.allocate(v.size * 4).order(ByteOrder.LITTLE_ENDIAN).apply { v.forEach { putFloat(it) }; flip() }

    @Test fun floatFrom24BitComesBackExactly() {
        // Every 24-bit sample, as the FLAC decoder hands it over (s / 2^23), must return unchanged.
        val samples = intArrayOf(0, 1, -1, 8_388_607, -8_388_608, 1_234_567, -7_654_321, 255, -256)
        val src = floats(*samples.map { it / 8_388_608f }.toFloatArray())
        val out24 = ByteBuffer.allocate(samples.size * 3).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(samples.size, convertPcm(src, f32, out24, i24))
        out24.flip()
        val got24 = IntArray(samples.size) {
            val b0 = out24.get().toInt() and 0xFF; val b1 = out24.get().toInt() and 0xFF; val b2 = out24.get().toInt()
            (b2 shl 16) or (b1 shl 8) or b0
        }
        assertTrue(samples.contentEquals(got24))

        val out32 = ByteBuffer.allocate(samples.size * 4).order(ByteOrder.LITTLE_ENDIAN)
        convertPcm(src, f32, out32, i32)
        out32.flip()
        assertTrue(samples.map { it shl 8 }.toIntArray().contentEquals(IntArray(samples.size) { out32.int }))
        assertEquals(0, src.position()) // the source is read through a copy; the caller moves it
    }

    @Test fun floatFrom16BitComesBackExactly() {
        val samples = shortArrayOf(0, 1, -1, Short.MAX_VALUE, Short.MIN_VALUE, 12_345, -23_456)
        val src = floats(*samples.map { it / 32_768f }.toFloatArray())
        val out = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        convertPcm(src, f32, out, i16)
        out.flip()
        assertTrue(samples.contentEquals(ShortArray(samples.size) { out.short }))
    }

    @Test fun fullScaleFloatClampsInsteadOfWrapping() {
        val out = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
        convertPcm(floats(1f, -1f), f32, out, i32)
        out.flip()
        assertEquals(Int.MAX_VALUE, out.int)
        assertEquals(Int.MIN_VALUE, out.int)
    }

    @Test fun sixteenBitInputPadsIntoWiderDac() {
        val src = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).apply { putShort(-2); putShort(300); flip() }
        val out = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
        convertPcm(src, i16, out, i32)
        out.flip()
        assertEquals(-2 shl 16, out.int)
        assertEquals(300 shl 16, out.int)
    }

    @Test fun streamAsksForTheOriginalFileWithoutCap() {
        val raw = FakeServer.client.streamUrl("x")
        assertTrue(raw.contains("format=raw") && !raw.contains("maxBitRate"))
        val capped = FakeServer.client.streamUrl("x", 192, "opus")
        assertTrue(capped.contains("maxBitRate=192") && capped.contains("format=opus") && !capped.contains("raw"))
    }

    @Test fun outputTextTellsTheTruth() {
        val bp = OutputPath.Kind.BitPerfect; val mix = OutputPath.Kind.Mixer
        assertNull(outputText(96_000, 24, OutputPath()))
        assertEquals("Bit-perfect · 96 kHz · 24-bit", outputText(96_000, 24, OutputPath(bp, "FiiO KA3", 96_000, 32)))
        assertEquals("Bit-perfect · 44.1 kHz · 16-bit", outputText(44_100, 16, OutputPath(bp, "EW200", 44_100, 32)))
        assertEquals("Cut to 16-bit · 44.1 kHz", outputText(44_100, 24, OutputPath(bp, "Old DAC", 44_100, 16)))
        assertEquals("Resampled to 48 kHz", outputText(44_100, 16, OutputPath(mix, "Speaker", 48_000)))
        assertEquals("Mixed at 48 kHz", outputText(48_000, 24, OutputPath(mix, "Speaker", 48_000)))
        assertEquals("Bluetooth · re-encoded", outputText(44_100, 16, OutputPath(OutputPath.Kind.Bluetooth, "WH-1000XM5", 48_000)))
        // USB through the mixer: Android doesn't say the rate, so no "resampled" claim (bug 2).
        assertEquals("Android mixer", outputText(48_000, 24, OutputPath(mix, "EW200", 0, reason = "DAC has no bit-perfect 48 kHz")))
        // The decoded rate wins over the server's: an Opus download decodes at 48 kHz.
        assertEquals("Mixed at 48 kHz", outputText(44_100, 16, OutputPath(mix, "Speaker", 48_000, inputRate = 48_000)))
        // No device names any more (feature 2).
        listOf(OutputPath(bp, "FiiO KA3", 96_000, 32), OutputPath(mix, "Speaker", 48_000)).forEach {
            assertTrue(outputText(96_000, 24, it)!!.let { t -> "FiiO" !in t && "Speaker" !in t })
        }
    }

    @Test fun floatOnlyForSongsAbove16Bits() {
        // Bug 1: 16-bit FLACs decode to 16-bit integers; 24-bit to float. Lossy (no bit depth) stays 16-bit.
        assertTrue(!needsFloatDecode(C.ENCODING_PCM_16BIT))
        assertTrue(!needsFloatDecode(Format.NO_VALUE))
        assertTrue(needsFloatDecode(C.ENCODING_PCM_24BIT))
        assertTrue(needsFloatDecode(C.ENCODING_PCM_32BIT))
    }

    @Test fun floatDacModeIsUsedWhenNoIntegerMode() {
        val floatOnly = listOf(MixerOption(48_000, f32, stereo, true))
        assertEquals(floatOnly[0], pickMixer(floatOnly, 48_000, stereo, 24))
        val src = floats(0.5f, -0.25f, 1f / 8_388_608)
        val out = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN)
        convertPcm(src, f32, out, f32); out.flip()
        assertEquals(0.5f, out.float); assertEquals(-0.25f, out.float); assertEquals(1f / 8_388_608, out.float)
        val s16 = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).apply { putShort(-32768); putShort(1); flip() }
        val o16 = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
        convertPcm(s16, i16, o16, f32); o16.flip()
        assertEquals(-1f, o16.float); assertEquals(1f / 32_768, o16.float)
    }

    @Test fun reasonSaysWhyThereIsNoBitPerfect() {
        assertEquals("phone offers no bit-perfect mode for this DAC", noMixerReason(dac.filter { !it.bitPerfect }, 48_000, stereo))
        assertEquals("DAC has no bit-perfect 176.4 kHz", noMixerReason(dac, 176_400, stereo))
        assertEquals("DAC is 16-bit only", noMixerReason(listOf(MixerOption(44_100, i16, stereo, true)), 44_100, stereo))
    }

    @Test fun downloadQualityIsReadFromItsUrl() {
        val base = "https://nd/rest/stream?u=a&id=1"
        assertNull(Downloads.transcodeOf("$base&format=raw"))
        assertNull(Downloads.transcodeOf(base)) // downloads from before 1.5
        assertNull(Downloads.transcodeOf("$base&maxBitRate=0"))
        assertEquals(192 to "opus", Downloads.transcodeOf("$base&maxBitRate=192&format=opus"))
        assertEquals(320 to null, Downloads.transcodeOf("$base&maxBitRate=320"))
        assertEquals(192 to "opus", Downloads.transcodeOf(FakeServer.client.streamUrl("x", 192, "opus")))
        assertNull(Downloads.transcodeOf(FakeServer.client.streamUrl("x")))
    }
}
