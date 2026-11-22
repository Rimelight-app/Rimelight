package com.tonihk00.clearplay

import android.media.AudioFormat
import com.tonihk00.clearplay.player.MixerOption
import com.tonihk00.clearplay.player.OutputPath
import com.tonihk00.clearplay.player.convertPcm
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
        assertNull(outputText(96_000, 24, OutputPath()))
        assertEquals("Bit-perfect · FiiO KA3 · 96 kHz · 32-bit", outputText(96_000, 24, OutputPath(OutputPath.Kind.BitPerfect, "FiiO KA3", 96_000, 32)))
        assertEquals("Cut to 16-bit · Old DAC · 44.1 kHz", outputText(44_100, 24, OutputPath(OutputPath.Kind.BitPerfect, "Old DAC", 44_100, 16)))
        assertEquals("Speaker · resampled to 48 kHz", outputText(44_100, 16, OutputPath(OutputPath.Kind.Mixer, "Speaker", 48_000)))
        assertEquals("Speaker · mixed at 48 kHz", outputText(48_000, 24, OutputPath(OutputPath.Kind.Mixer, "Speaker", 48_000)))
        assertEquals("Bluetooth · WH-1000XM5 · re-encoded", outputText(44_100, 16, OutputPath(OutputPath.Kind.Bluetooth, "WH-1000XM5", 48_000)))
    }
}
