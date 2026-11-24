import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseFile } from 'music-metadata'
import type { LocalTrack } from './scanner'

/**
 * Lyrics of local songs ("Music on this computer"): a sidecar .lrc / .txt
 * next to the file, else the lyrics embedded in it. No Electron imports, so
 * tools/dev-rig/local-lyrics-unit.mjs runs it in plain Node.
 */

/** Sidecar file first, then the lyrics embedded in the file. */
export async function readLyrics(
  t: Pick<LocalTrack, 'path' | 'hasEmbeddedLyrics'>,
) {
  const base = t.path.slice(0, t.path.length - path.extname(t.path).length)
  for (const ext of ['.lrc', '.LRC', '.txt']) {
    try {
      const text = await fs.readFile(base + ext, 'utf8')
      return parseLyrics(text)
    } catch {
      // try the next one
    }
  }
  if (!t.hasEmbeddedLyrics) return null
  try {
    const meta = await parseFile(t.path, {
      skipCovers: true,
      duration: false,
    })
    // The tag's own text: music-metadata re-parses LRC in string tags with
    // a stricter pattern of its own and drops lines it doesn't match.
    const raw = rawLyricsText(meta.native)
    if (raw) return parseLyrics(raw)
    const sylt = syltLyrics(meta.native)
    if (sylt) return sylt
    const tag =
      meta.common.lyrics?.find((l) => l.syncText?.length) ??
      meta.common.lyrics?.[0]
    if (!tag) return null
    if (tag.syncText?.length) {
      return {
        synced: true,
        lines: tag.syncText.map((l) => ({
          start: l.timestamp ?? 0,
          value: l.text,
        })),
      }
    }
    return tag.text ? parseLyrics(tag.text) : null
  } catch {
    return null
  }
}

type NativeTags = Record<string, { id: string; value: unknown }[]>

/** Lyrics tags holding plain or LRC text, by tag id (case-insensitive). */
const LYRICS_TEXT_TAGS = new Set([
  'lyrics', // Vorbis (FLAC, Ogg, Opus), APEv2
  'unsyncedlyrics', // Vorbis
  '©lyr', // MP4 / M4A
  'uslt', // ID3v2.3 / 2.4
  'ult', // ID3v2.2
])

/**
 * The lyrics text exactly as it is in the file, from the native tags. A text
 * with LRC time stamps wins over a plain one.
 */
export function rawLyricsText(native: NativeTags) {
  const texts: string[] = []
  for (const tags of Object.values(native)) {
    for (const tag of tags) {
      if (!LYRICS_TEXT_TAGS.has(tag.id.toLowerCase())) continue
      const v = tag.value as string | { text?: string } | undefined
      const text = typeof v === 'string' ? v : v?.text
      if (text?.trim()) texts.push(text)
    }
  }
  return texts.find((x) => STAMP.test(x)) ?? texts[0] ?? null
}

type SyltValue = {
  timeStampFormat?: number
  syncText?: { text: string; timestamp?: number }[]
}

/** ID3v2 SYLT timeStampFormat 2: absolute time in milliseconds (1 = MPEG frames). */
const SYLT_MILLISECONDS = 2

/**
 * ID3 SYLT (synchronised lyrics). Synced only when its times are in
 * milliseconds; otherwise (MPEG frames) the text is used unsynced. A
 * syllable starting with a line break starts a new line. Files that store
 * one line per entry, with no line breaks at all, keep one line per entry.
 */
export function syltLyrics(native: NativeTags) {
  for (const tags of Object.values(native)) {
    for (const tag of tags) {
      if (tag.id.toUpperCase() !== 'SYLT' && tag.id.toUpperCase() !== 'SLT')
        continue
      const v = tag.value as SyltValue
      const parts = v?.syncText ?? []
      if (!parts.length) continue
      const perLine = !parts.some((p, i) => i > 0 && /^\r?\n/.test(p.text))
      const lines: { start: number; value: string }[] = []
      for (const p of parts) {
        const breaks = /^\r?\n/.test(p.text)
        const text = p.text.replace(/^\r?\n/, '')
        if (perLine || breaks || !lines.length)
          lines.push({ start: p.timestamp ?? 0, value: text })
        else lines[lines.length - 1].value += text
      }
      const clean = lines
        .map((l) => ({ ...l, value: l.value.replace(/\r?\n/g, ' ').trim() }))
        .filter((l) => l.value)
      if (!clean.length) continue
      if (v.timeStampFormat === SYLT_MILLISECONDS) {
        return { synced: true, lines: clean.sort((a, b) => a.start - b.start) }
      }
      return { synced: false, lines: clean.map((l) => ({ value: l.value })) }
    }
  }
  return null
}

const STAMP = /\[(\d+):(\d+(?:[.:]\d+)?)\]/
/** Word-by-word time markers (enhanced LRC): <mm:ss.xx>. */
const WORD_MARKER = /<\d+:\d+(?:[.:]\d+)?>/g
const OFFSET = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i

/** "<00:20.00>Word <00:20.60>by" → "Word by" (other text left as it is). */
function stripWordMarkers(line: string) {
  if (!line.includes('<')) return line
  const out = line.replace(WORD_MARKER, '')
  return out === line ? line : out.replace(/\s{2,}/g, ' ')
}

/**
 * LRC (timed) or plain text into lines; times in milliseconds. Several
 * stamps on one line give one line per stamp; [offset:+N] moves every line
 * N ms earlier (negative: later); <mm:ss.xx> word markers are removed.
 */
export function parseLyrics(text: string) {
  const lines: { start?: number; value: string }[] = []
  let synced = false
  let offset = 0
  for (const raw of text.split(/\r?\n/)) {
    const off = raw.match(OFFSET)
    if (off) {
      offset = Number(off[1])
      continue
    }
    const stamps = [...raw.matchAll(new RegExp(STAMP.source, 'g'))]
    const value = stripWordMarkers(raw.replace(/\[[^\]]*\]/g, '')).trim()
    if (stamps.length) {
      synced = true
      for (const m of stamps) {
        const start = Math.round(
          (Number(m[1]) * 60 + Number(m[2].replace(':', '.'))) * 1000,
        )
        lines.push({ start, value })
      }
    } else if (!/^\[[a-z]+:/i.test(raw) && raw.trim()) {
      lines.push({ value: stripWordMarkers(raw).trim() })
    }
  }
  if (synced) {
    const timed = lines
      .filter((l) => l.start !== undefined)
      .map((l) => ({ ...l, start: Math.max(0, (l.start ?? 0) - offset) }))
    timed.sort((a, b) => a.start - b.start)
    return { synced: true, lines: timed }
  }
  return { synced: false, lines }
}
