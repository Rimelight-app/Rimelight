export interface LrcLine {
  time: number // ms
  text: string
}

const TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
/** Word-by-word time markers (enhanced LRC), shown as plain lines here. */
const WORD_MARKER = /<\d+:\d+(?:[.:]\d+)?>/g

/** "<00:20.00>Word <00:20.60>by" → "Word by" (other text left as it is). */
function stripWordMarkers(line: string) {
  if (!line.includes('<')) return line
  const out = line.replace(WORD_MARKER, '')
  return out === line ? line : out.replace(/\s{2,}/g, ' ')
}

/** Parses LRC text into time-sorted lines; metadata tags are skipped. */
export function parseLrc(lrc: string): LrcLine[] {
  const out: LrcLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(TIME)]
    if (!stamps.length) continue
    const text = stripWordMarkers(raw.replace(TIME, '')).trim()
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) : 0
      out.push({
        time: Number(m[1]) * 60_000 + Number(m[2]) * 1000 + frac,
        text,
      })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}
