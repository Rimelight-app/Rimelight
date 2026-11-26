package com.tonihk00.clearplay.player

import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * "Continue on other devices": the rules shared by Rimelight desktop and
 * Rimelight for Android (version 4, 2026-11-26). Up to desktop 0.6.1 and
 * Android 1.6.0 both apps were called ClearPlay; version 4 sends the new
 * names and still recognises the old ones, so a Rimelight app works with a
 * ClearPlay app that hasn't been updated yet.
 *
 * A line-by-line port of the desktop's src/service/queue-handoff.ts (tag v0.6.2), with the same
 * names. Pure functions only (no stores, no network, no clock of their own), so the shared cases
 * in queue-handoff-cases.json (copied unchanged into the unit-test resources) run against them
 * directly. If a rule changes, change the cases file first, in both apps.
 */
object QueueHandoff {
    /** The `c` parameter each app sends (Navidrome's changedBy / playerName). */
    const val DESKTOP_APP = "Rimelight"
    const val ANDROID_APP = "Rimelight-Android"

    /**
     * The names the same two apps sent before the rename (ClearPlay desktop up to
     * 0.6.1, ClearPlay Android up to 1.6.0), with the app each one is now.
     */
    val LEGACY_NAMES: Map<String, String> = mapOf(
        "ClearPlay" to DESKTOP_APP,
        "ClearPlay-Android" to ANDROID_APP,
    )

    /** At most this many songs are saved, taken around the current song. */
    const val MAX_SAVED = 1000

    /** Of those, at most this many come before the current song. */
    const val MAX_BEFORE = 100

    /** Waits before saving, per event (ms). 0 = right away. */
    val SAVE_DELAY: Map<SaveEvent, Long> = mapOf(
        SaveEvent.songChange to 4000L,
        SaveEvent.pause to 500L,
        SaveEvent.queueEdit to 4000L,
        SaveEvent.continued to 0L,
        SaveEvent.quit to 0L,
        SaveEvent.sleep to 0L,
        SaveEvent.lock to 0L,
    )

    @Suppress("EnumEntryName")
    enum class SaveEvent { songChange, pause, queueEdit, continued, quit, sleep, lock }

    /** A song in the local queue. `local`: it exists only on this device. */
    data class QueueSong(val id: String, val local: Boolean)

    /** Anything with a song id (a Song, or a bare id in the shared cases). */
    interface HasId { val id: String }

    /** The queue saved on the server (getPlayQueueByIndex, or getPlayQueue mapped to an index). */
    data class SavedQueue<S : HasId>(
        val entries: List<S>,
        /** 0-based. */
        val currentIndex: Int,
        val positionMs: Long,
        /** Server time, as the server sent it. */
        val changed: String,
        val changedBy: String,
    )

    /** One getNowPlaying entry (playbackReport fields). */
    data class NowPlaying(
        val username: String,
        val playerName: String,
        val state: String,
        val positionMs: Long,
        /** The song's id. */
        val id: String,
    )

    // ---------------------------------------------------------------- names

    /**
     * Which of the two apps a client name belongs to (DESKTOP_APP or
     * ANDROID_APP), under its new or its old name. Null for any other app.
     * Names are compared exactly (case and all).
     */
    fun appOf(client: String?): String? {
        if (client.isNullOrEmpty()) return null
        if (client == DESKTOP_APP || client == ANDROID_APP) return client
        return LEGACY_NAMES[client]
    }

    /** The other app (old or new name): the only one whose Now Playing entry is trusted. */
    fun isOtherApp(thisApp: String, client: String?): Boolean {
        val app = appOf(client)
        return app != null && app != appOf(thisApp)
    }

    /** This app, under its new or its old name (a queue it saved before updating). */
    fun isThisApp(thisApp: String, client: String?): Boolean {
        val app = appOf(client)
        return if (app == null) client == thisApp else app == appOf(thisApp)
    }

    /**
     * "Rimelight desktop", "Rimelight Android", "ClearPlay desktop",
     * "ClearPlay Android" (an app not updated yet), or the client's own name.
     */
    fun deviceName(client: String): String {
        if (client == DESKTOP_APP) return "Rimelight desktop"
        if (client == ANDROID_APP) return "Rimelight Android"
        if (client == "ClearPlay") return "ClearPlay desktop"
        if (client == "ClearPlay-Android") return "ClearPlay Android"
        return client
    }

    // ---------------------------------------------------------------- publish

    data class Window(val ids: List<String>, val currentIndex: Int)

    /**
     * The part of the queue to save: songs that exist only on this device are
     * left out, then at most MAX_SAVED songs around the current one (up to
     * MAX_BEFORE before it, the rest after). Null when there is nothing to save:
     * empty queue, no current song, or the current song is local.
     */
    fun saveWindow(songs: List<QueueSong>, currentIndex: Int): Window? {
        val current = songs.getOrNull(currentIndex)
        if (current == null || current.local) return null

        val ids = ArrayList<String>()
        var index = -1
        for (i in songs.indices) {
            if (songs[i].local) continue
            if (i == currentIndex) index = ids.size
            ids.add(songs[i].id)
        }

        val before = minOf(index, MAX_BEFORE)
        val start = index - before
        val end = minOf(ids.size, start + MAX_SAVED)
        return Window(ids.subList(start, end).toList(), before)
    }

    data class SaveCheck(
        /** "Continue on other devices" is on. */
        val enabled: Boolean,
        val online: Boolean,
        val queueLength: Int,
        /** The current song exists only on this device (or there is none). */
        val currentIsLocal: Boolean,
        /** The "Continued on <device>" pill is showing. */
        val leftBehindShowing: Boolean,
    )

    /** Whether to save now. Nothing is queued for later: the next event saves anyway. */
    fun shouldSave(c: SaveCheck): Boolean {
        if (!c.enabled) return false
        if (!c.online) return false
        if (c.queueLength == 0) return false
        if (c.currentIsLocal) return false
        if (c.leftBehindShowing) return false
        return true
    }

    /** What [createSaveDebouncer] returns. */
    interface SaveDebouncer {
        fun event(event: SaveEvent)
        fun cancel()
        val pending: Boolean
    }

    /**
     * One save per burst of events: each event replaces the waiting save with
     * its own delay (5 fast skips = 1 save, 4 s after the last). An event with
     * delay 0 saves right away and drops the waiting one.
     */
    fun <T : Any> createSaveDebouncer(
        save: (SaveEvent) -> Unit,
        setTimer: (fn: () -> Unit, ms: Long) -> T,
        clearTimer: (timer: T) -> Unit,
    ): SaveDebouncer = object : SaveDebouncer {
        private var timer: T? = null

        override fun cancel() {
            timer?.let(clearTimer)
            timer = null
        }

        override fun event(event: SaveEvent) {
            cancel()
            val ms = SAVE_DELAY.getValue(event)
            if (ms == 0L) {
                save(event)
                return
            }
            timer = setTimer({
                timer = null
                save(event)
            }, ms)
        }

        override val pending get() = timer != null
    }

    /**
     * The song changed because the previous one played to its end (within 3 s),
     * not because of a skip. A natural change doesn't close "Continued on ...".
     */
    fun isNaturalEnd(positionS: Double, durationS: Double) = durationS > 0 && positionS >= durationS - 3

    /** "Clear queue": only the playing song is left. Not saved. */
    fun isQueueCleared(previousIds: List<String>, currentIds: List<String>, previousCurrentId: String?) =
        previousIds.size > 1 &&
            currentIds.size == 1 &&
            currentIds[0] == previousCurrentId

    // ---------------------------------------------------------------- look

    /**
     * Server times are compared as instants, never with this device's clock. Like the desktop's
     * Date.parse: millisecond precision (Navidrome sends nanoseconds), any offset, a time without
     * one is local; NaN (null here) when it can't be read.
     */
    internal fun instant(time: String?): Long? {
        if (time.isNullOrEmpty()) return null
        runCatching { return OffsetDateTime.parse(time, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant().toEpochMilli() }
        runCatching { return Instant.parse(time).toEpochMilli() }
        runCatching { return LocalDateTime.parse(time).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }
        return null
    }

    /** a is later than b. */
    fun isLater(a: String, b: String?): Boolean {
        val x = instant(a) ?: return false
        val y = instant(b) ?: return true
        return x > y
    }

    /** The later of two server times (either may be missing). */
    fun latestChanged(a: String?, b: String?): String? {
        if (a.isNullOrEmpty()) return b
        if (b.isNullOrEmpty()) return a
        return if (isLater(a, b)) a else b
    }

    @Suppress("EnumEntryName")
    enum class Kind { playing, paused, saved }

    data class Start(val kind: Kind, val index: Int, val positionMs: Long)

    /**
     * Where Continue starts, and what kind of offer it is.
     *
     * Saved by the other app: if it is in Now Playing (same user, a playerName
     * of the same app as changedBy, old or new name), start at that entry's song
     * and position, playing
     * or paused. The song is looked up in the saved queue: the first match at or
     * after the saved index, else the first match anywhere. This also finds the
     * right song when the server's index moved (a song before it was deleted).
     * Not in Now Playing, or its song isn't in the queue: the saved song and
     * position.
     *
     * Saved by any other app (or by this app): the saved song and position
     * ("saved"). Their Now Playing can't be read reliably.
     */
    fun startPoint(queue: SavedQueue<*>, thisApp: String, username: String, nowPlaying: List<NowPlaying>): Start {
        val last = queue.entries.size - 1
        val saved = minOf(maxOf(0, queue.currentIndex), last)
        val savedPosition = maxOf(0L, queue.positionMs)
        if (!isOtherApp(thisApp, queue.changedBy)) {
            return Start(Kind.saved, saved, savedPosition)
        }
        val savedBy = appOf(queue.changedBy)
        val mine = nowPlaying.filter { e -> e.username == username && appOf(e.playerName) == savedBy }
        val live = mine.find { it.state == "playing" } ?: mine.find { it.state == "paused" }
            ?: return Start(Kind.paused, saved, savedPosition)
        val kind = if (live.state == "playing") Kind.playing else Kind.paused
        var index = -1
        run {
            var i = saved
            while (i <= last && index < 0) { if (queue.entries[i].id == live.id) index = i; i++ }
        }
        run {
            var i = 0
            while (i < saved && index < 0) { if (queue.entries[i].id == live.id) index = i; i++ }
        }
        if (index < 0) return Start(kind, saved, savedPosition)
        return Start(kind, index, maxOf(0L, live.positionMs))
    }

    data class OfferInput<S : HasId>(
        /** This app's client name (DESKTOP_APP or ANDROID_APP). */
        val thisApp: String,
        val username: String,
        val queue: SavedQueue<S>?,
        /** A `changed` copied from the server earlier, or null. */
        val handledChanged: String?,
        val playingHere: Boolean,
        val nowPlaying: List<NowPlaying>,
    )

    data class Offer<S : HasId>(
        /**
         * playing: "Playing on <device> · <song>", Continue here.
         * paused: "Paused on <device> · <song> · <age>", Continue.
         * saved: "Saved by <app> · <song> · <age>", Continue.
         */
        val kind: Kind,
        val device: String,
        val song: S,
        val index: Int,
        val positionMs: Long,
        val changed: String,
    )

    /** The Continue offer, or null when none should be shown. */
    fun <S : HasId> offer(input: OfferInput<S>): Offer<S>? {
        val queue = input.queue
        if (queue == null || queue.entries.isEmpty()) return null
        if (isThisApp(input.thisApp, queue.changedBy)) return null
        if (!isLater(queue.changed, input.handledChanged)) return null
        if (input.playingHere) return null

        val start = startPoint(queue, input.thisApp, input.username, input.nowPlaying)
        return Offer(
            kind = start.kind,
            device = deviceName(queue.changedBy),
            song = queue.entries[start.index],
            index = start.index,
            positionMs = start.positionMs,
            changed = queue.changed,
        )
    }

    // ---------------------------------------------------------------- left behind

    data class LeftBehindCandidateInput(
        /** "Continue on other devices" is on. */
        val publishing: Boolean,
        val playingHere: Boolean,
        val thisApp: String,
        val username: String,
        val nowPlaying: List<NowPlaying>,
        /** Song ids in this device's queue. */
        val queueIds: List<String>,
        /** Already shown since this device last saved. */
        val alreadyShown: Boolean,
    )

    data class LeftBehindInput(
        val candidate: LeftBehindCandidateInput,
        /** changedBy of the server's queue; null when it wasn't read. */
        val serverChangedBy: String?,
    )

    data class LeftBehind(val device: String, val song: String)

    /**
     * The other app (old or new name) is playing a song from this queue. Only
     * then is the server's queue read, to finish the check with leftBehind.
     */
    fun leftBehindCandidate(input: LeftBehindCandidateInput): LeftBehind? {
        if (!input.publishing || !input.playingHere || input.alreadyShown) return null
        val ids = input.queueIds.toHashSet()
        val entry = input.nowPlaying.find { e ->
            e.username == input.username &&
                isOtherApp(input.thisApp, e.playerName) &&
                e.state == "playing" &&
                e.id in ids
        } ?: return null
        return LeftBehind(deviceName(entry.playerName), entry.id)
    }

    /**
     * "Continued on <device>": a candidate, and the other app (old or new name)
     * saved the server's queue last (it continued). If this device saved last, it is
     * the one that took over, and the other device is the one left behind.
     */
    fun leftBehind(input: LeftBehindInput): LeftBehind? {
        val found = leftBehindCandidate(input.candidate) ?: return null
        if (!isOtherApp(input.candidate.thisApp, input.serverChangedBy)) return null
        return found
    }

    // ---------------------------------------------------------------- age

    sealed interface Age {
        data object JustNow : Age
        data class Minutes(val count: Long) : Age
        data class Hours(val count: Long) : Age
        data object Yesterday : Age
        data class Date(val changed: String) : Age
    }

    /**
     * How long ago the queue was saved, for display only: this device's clock
     * minus the server's `changed`. Under a minute (also when negative, i.e. the
     * clocks disagree) is "just now"; 24 to 48 hours is "yesterday"; older shows
     * the date of `changed`.
     */
    fun ageText(changed: String, nowMs: Long): Age {
        val at = instant(changed) ?: return Age.JustNow
        val ms = nowMs - at
        if (ms < 60_000) return Age.JustNow
        val minutes = Math.floorDiv(ms, 60_000L)
        if (minutes < 60) return Age.Minutes(minutes)
        val hours = Math.floorDiv(minutes, 60L)
        if (hours < 24) return Age.Hours(hours)
        if (hours < 48) return Age.Yesterday
        return Age.Date(changed)
    }
}
