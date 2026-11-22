// Unit checks for the bit-perfect decisions and the Linux ALSA/PipeWire parsers.
// Usage: node tools/dev-rig/bitperfect-unit.mjs   (Node 22.18+ runs the .ts files directly)
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const load = (f) => import(pathToFileURL(path.join(root, f)).href)
const bp = await load('src/utils/bitperfect.ts')
const lp = await load('electron/main/core/mpv/linux-parse.ts')
// Git on Windows may check the fixtures out with CRLF; /proc never has it.
const fake = (f) =>
  fs.readFileSync(path.join(root, 'tools/dev-rig/fake-audio/asound', f), 'utf8').replace(/\r\n/g, '\n')

let n = 0
const t = (name, fn) => {
  try {
    fn()
    n++
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message.split('\n').slice(0, 4).join(' ')}`)
    process.exitCode = 1
  }
}

// ---- rate choice ----
const EW200 = [44100, 48000, 96000]
t('supported rates play as they are', () => {
  for (const r of EW200) assert.equal(bp.pickOutputRate(r, EW200), 0)
})
t('88.2 → 44.1 and 176.4 → 44.1 on the EW200 (same family)', () => {
  assert.equal(bp.pickOutputRate(88200, EW200), 44100)
  assert.equal(bp.pickOutputRate(176400, EW200), 44100)
})
t('192 → 96 on the EW200', () => assert.equal(bp.pickOutputRate(192000, EW200), 96000))
t('176.4 → 88.2 when the device has 88.2', () =>
  assert.equal(bp.pickOutputRate(176400, [44100, 48000, 88200, 96000]), 88200))
t('R1280DB optical (48 only): 44.1 → 48, 96 → 48', () => {
  assert.equal(bp.pickOutputRate(44100, [48000]), 48000)
  assert.equal(bp.pickOutputRate(96000, [48000]), 48000)
  assert.equal(bp.pickOutputRate(48000, [48000]), 0)
})
t('unknown song rate or no caps: leave it alone', () => {
  assert.equal(bp.pickOutputRate(0, EW200), 0)
  assert.equal(bp.pickOutputRate(96000, []), 0)
})
t('low rates go up within the family', () => {
  assert.equal(bp.pickOutputRate(22050, EW200), 44100)
  assert.equal(bp.pickOutputRate(32000, EW200), 48000)
})
t('switched-off and learned rates are not used', () => {
  const prefs = { caps: { rates: EW200 }, disabledRates: [96000], learnedUnsupported: [44100] }
  assert.deepEqual(bp.allowedRates(prefs), [48000])
})

// ---- volume mode ----
t('volume mode: hardware when there is a control, app otherwise, choice wins', () => {
  assert.equal(bp.effectiveVolumeMode({ caps: { hwVolume: true } }, 'exclusive'), 'hardware')
  assert.equal(bp.effectiveVolumeMode({ caps: { hwVolume: false } }, 'exclusive'), 'app')
  assert.equal(bp.effectiveVolumeMode({ caps: { hwVolume: false }, volumeMode: 'fixed' }, 'exclusive'), 'fixed')
  assert.equal(bp.effectiveVolumeMode({ caps: { hwVolume: false }, volumeMode: 'hardware' }, 'exclusive'), 'app')
  assert.equal(bp.effectiveVolumeMode({ caps: { hwVolume: true } }, 'bluetooth'), 'app')
})

// ---- output line ----
const out = (o) => ({
  deviceKey: 'k', deviceName: 'd', exclusive: true, fallback: null, bluetooth: false,
  source: { rate: 96000, format: 's32', channels: 2, bits: 32 },
  output: { rate: 96000, format: 'S24_3LE', channels: 2, bits: 24 },
  requestedRate: 0, softVolume: 100, hwVolume: true, hwLevel: 50, hwDb: -20, ...o,
})
const song = { samplingRate: 96000, bitDepth: 24 }
t('bit-perfect 96/24', () => {
  const l = bp.describeOutput(out({}), song)
  assert.equal(l.text, 'Bit-perfect · 96 kHz · 24-bit')
  assert.equal(l.short, 'Bit-perfect')
  assert.equal(l.bitPerfect, true)
})
t('converted rate', () =>
  assert.equal(bp.describeOutput(out({ output: { rate: 48000, format: 'S24_3LE', channels: 2, bits: 24 } }), song).text,
    'Converted to 48 kHz for this device'))
t('converted depth (16-bit device)', () =>
  assert.equal(bp.describeOutput(out({ output: { rate: 96000, format: 'S16_LE', channels: 2, bits: 16 } }), song).text,
    'Converted to 16-bit for this device'))
t('16-bit song in a 32-bit container is still bit-perfect', () =>
  assert.equal(bp.describeOutput(out({ source: { rate: 44100, format: 's16', channels: 2, bits: 16 }, output: { rate: 44100, format: 'S32_LE', channels: 2, bits: 32 } }), { samplingRate: 44100, bitDepth: 16 }).text,
    'Bit-perfect · 44.1 kHz · 16-bit'))
t('busy, refused, bluetooth, shared, app volume, lossy', () => {
  assert.equal(bp.describeOutput(out({ exclusive: false, fallback: 'busy' }), song).text, 'Not bit-perfect: device busy')
  assert.equal(bp.describeOutput(out({ exclusive: false, fallback: 'refused' }), song).text, 'Not bit-perfect: exclusive mode refused')
  assert.equal(bp.describeOutput(out({ exclusive: false, bluetooth: true }), song).text, 'Bluetooth · re-encoded')
  assert.equal(bp.describeOutput(out({ exclusive: false }), song).text, 'Not bit-perfect: system mixer')
  assert.equal(bp.describeOutput(out({ softVolume: 40 }), song).text, 'Not bit-perfect: app volume · 96 kHz')
  assert.equal(bp.describeOutput(out({ source: { rate: 44100, format: 'floatp', channels: 2, bits: 32 }, output: { rate: 44100, format: 'S16_LE', channels: 2, bits: 16 } }), { samplingRate: 44100 }).text,
    'Direct · 44.1 kHz · lossy source')
})
t('nothing playing', () => assert.equal(bp.describeOutput(null, song).kind, 'idle'))

// ---- /proc/asound ----
t('cards file', () => {
  const cards = lp.parseCards(fake('cards'))
  assert.deepEqual(cards.map((c) => [c.index, c.id, c.driver, c.name]), [
    [0, 'PCH', 'HDA-Intel', 'HDA Intel PCH'],
    [2, 'SIMGOT', 'USB-Audio', 'SIMGOT EW200 DSP'],
  ])
})
t('USB stream0 of the EW200 (playback only, both altsets)', () => {
  const s = lp.parseUsbStream(fake('card2/stream0'))
  assert.deepEqual(s.rates, [44100, 48000, 96000])
  assert.deepEqual(s.depths, [16, 24])
  assert.equal(s.speed, 'full')
  assert.equal(s.running, false)
})
t('USB stream0 while running, continuous range, S32 with Bits: 24', () => {
  const text = `Topping D10 at usb-0000:00:14.0-2, high speed : USB Audio

Playback:
  Status: Running
    Interface = 1
    Altset = 1
    Packet Size = 584
    Momentary freq = 96000 Hz (0xc.0000)
    Feedback Format = 16.16
  Interface 1
    Altset 1
    Format: S32_LE
    Channels: 2
    Endpoint: 0x05 (5 OUT) (ASYNC)
    Rates: 44100 - 384000 (continuous)
    Data packet interval: 125 us
    Bits: 24
    Channel map: FL FR
`
  const s = lp.parseUsbStream(text)
  assert.deepEqual(s.rates, [44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000])
  assert.deepEqual(s.depths, [24])
  assert.equal(s.running, true)
  assert.equal(s.momentaryRate, 96000)
  assert.equal(s.speed, 'high')
})
t('HDA codec: only output converters count', () => {
  const c = lp.parseHdaCodec(fake('card0/codec#0'))
  assert.deepEqual(c.rates, [44100, 48000, 96000, 192000])
  assert.deepEqual(c.depths, [16, 24])
})
t('hw_params open and closed', () => {
  assert.deepEqual(lp.parseHwParams('access: RW_INTERLEAVED\nformat: S24_3LE\nsubformat: STD\nchannels: 2\nrate: 96000 (96000/1)\nperiod_size: 4800\n'),
    { format: 'S24_3LE', rate: 96000, channels: 2, bits: 24 })
  assert.equal(lp.parseHwParams('closed\n'), null)
})
t('amixer: picks the Speaker playback control, reads % and dB', () => {
  const text = `Simple mixer control 'Mic',0
  Capabilities: cvolume cswitch
  Capture channels: Mono
  Limits: Capture 0 - 100
  Mono: Capture 50 [50%] [-10.00dB] [on]
Simple mixer control 'Speaker',0
  Capabilities: pvolume pswitch pswitch-joined
  Playback channels: Front Left - Front Right
  Limits: Playback 0 - 100
  Mono:
  Front Left: Playback 60 [37%] [-40.00dB] [on]
  Front Right: Playback 60 [37%] [-40.00dB] [on]
`
  const c = lp.pickVolumeControl(lp.parseMixer(text))
  assert.equal(c.name, 'Speaker')
  assert.equal(c.percent, 37)
  assert.equal(c.db, -40)
  assert.equal(c.hasDb, true)
  assert.equal(lp.pickVolumeControl(lp.parseMixer("Simple mixer control 'Mic',0\n  Capabilities: cvolume\n")), null)
})
t('pactl sinks and streams (PipeWire)', () => {
  const sinks = lp.parsePactlSinks(JSON.stringify([
    { index: 56, state: 'SUSPENDED', name: 'alsa_output.usb-SIMGOT_EW200_DSP-00.analog-stereo', description: 'EW200 DSP Analog Stereo', properties: { 'alsa.card': '2', 'device.bus': 'usb', 'device.api': 'alsa' } },
    { index: 71, state: 'RUNNING', name: 'bluez_output.AA_BB_CC_DD_EE_FF.1', description: 'WH-1000XM4', properties: { 'device.bus': 'bluetooth', 'device.api': 'bluez5' } },
  ]))
  assert.equal(sinks[0].card, 2)
  assert.equal(sinks[1].card, null)
  assert.equal(sinks[1].bus, 'bluetooth')
  const inputs = JSON.stringify([{ index: 1, sink: 56, corked: false }, { index: 2, sink: 56, corked: true }, { index: 3, sink: 71, corked: false }])
  assert.equal(lp.activeStreamsOnSink(inputs, 56), 1)
  assert.equal(lp.parsePactlSinks('not json').length, 0)
})

console.log(`\n${n} passed`)
