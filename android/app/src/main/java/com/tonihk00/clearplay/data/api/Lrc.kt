package com.tonihk00.clearplay.data.api

private val TIME = Regex("""\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?]""")

/** Parses LRC text into time-sorted lines; metadata tags are skipped. Same rules as the desktop. */
fun parseLrc(lrc: String): List<LyricLine> {
    val out = ArrayList<LyricLine>()
    for (raw in lrc.lines()) {
        val stamps = TIME.findAll(raw).toList()
        if (stamps.isEmpty()) continue
        val text = raw.replace(TIME, "").trim()
        for (m in stamps) {
            val (min, sec, frac) = m.destructured
            val ms = if (frac.isEmpty()) 0 else frac.padEnd(3, '0').take(3).toLong()
            out += LyricLine(min.toLong() * 60_000 + sec.toLong() * 1000 + ms, text)
        }
    }
    return out.sortedBy { it.timeMs }
}

/** Index of the line being sung at [positionMs] (shown 150 ms early, like the desktop), or -1. */
fun activeLine(lines: List<LyricLine>, positionMs: Long): Int {
    val t = positionMs + 150
    var lo = 0
    var hi = lines.lastIndex
    var idx = -1
    while (lo <= hi) {
        val mid = (lo + hi) ushr 1
        if ((lines[mid].timeMs ?: 0) <= t) {
            idx = mid
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    return idx
}

/** Milliseconds of playback until [activeLine] next changes, or null after the last line. */
fun msUntilNextLine(lines: List<LyricLine>, positionMs: Long): Long? {
    val next = activeLine(lines, positionMs) + 1
    val at = lines.getOrNull(next)?.timeMs ?: return null
    return (at - 150) - positionMs
}
