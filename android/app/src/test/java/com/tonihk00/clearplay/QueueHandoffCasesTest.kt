package com.tonihk00.clearplay

import com.tonihk00.clearplay.player.QueueHandoff
import com.tonihk00.clearplay.player.QueueHandoff.Age
import com.tonihk00.clearplay.player.QueueHandoff.HasId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.security.MessageDigest

/**
 * Runs every case in the shared queue-handoff-cases.json (copied byte for byte from the desktop's
 * tools/dev-rig/ at tag v0.6.0) against QueueHandoff.kt, like the desktop's queue-handoff-unit.mjs
 * runs them against queue-handoff.ts. Prints the case count; every case must pass.
 */
class QueueHandoffCasesTest {
    private val bytes = javaClass.classLoader!!.getResourceAsStream("queue-handoff-cases.json")!!.readBytes()
    private val cases = Json.parseToJsonElement(bytes.decodeToString()).jsonObject

    data class Id(override val id: String) : HasId

    @Test fun casesFileIsTheDesktopCopy() {
        val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        assertEquals("cases file must be the v0.6.0 copy, unchanged", V060_SHA256, sha)
        assertEquals("5358adced87d22d5", sha.take(16))
        // When the repository has the tag (not in CI's shallow checkout), compare with it directly.
        tagCopy()?.let { tag ->
            val tagSha = MessageDigest.getInstance("SHA-256").digest(tag).joinToString("") { "%02x".format(it) }
            assertEquals("cases file differs from git show v0.6.0:tools/dev-rig/queue-handoff-cases.json", tagSha, sha)
        }
    }

    @Test fun everySharedCasePasses() {
        val results = runAll()
        val failed = results.filter { it.second != null }
        println("queue-handoff cases: ${results.size} run, ${results.size - failed.size} passed, ${failed.size} failed")
        failed.forEach { println("FAIL  ${it.first}: ${it.second}") }
        assertEquals("cases file version", 3, cases["version"]!!.jsonPrimitive.int)
        assertEquals(QueueHandoff.DESKTOP_APP, cases["thisApp"]!!.jsonObject["desktop"]!!.jsonPrimitive.content)
        assertEquals(QueueHandoff.ANDROID_APP, cases["thisApp"]!!.jsonObject["android"]!!.jsonPrimitive.content)
        // Every section of the file is run (a new section would need a runner here first).
        val sections = cases.filterValues { it is JsonArray }.keys - "notes"
        assertEquals(RUN_SECTIONS, sections)
        if (failed.isNotEmpty()) fail("${failed.size} of ${results.size} shared cases failed: ${failed.joinToString { it.first }}")
    }

    /**
     * (name, failure or null) for every case. [offer] and [leftBehind] can be swapped for broken
     * copies (QueueHandoffMutationTest) to show that the cases catch those mistakes.
     */
    fun runAll(
        offer: (QueueHandoff.OfferInput<Id>) -> QueueHandoff.Offer<Id>? = { QueueHandoff.offer(it) },
        leftBehind: (QueueHandoff.LeftBehindInput) -> QueueHandoff.LeftBehind? = QueueHandoff::leftBehind,
    ): List<Pair<String, String?>> {
        val out = ArrayList<Pair<String, String?>>()
        fun t(name: String, block: () -> Unit) {
            out += name to runCatching(block).exceptionOrNull()?.let { it.message ?: it.toString() }
        }
        fun eq(expected: Any?, actual: Any?) {
            if (expected != actual) throw AssertionError("expected <$expected> got <$actual>")
        }

        for (c in arr("deviceName")) t("deviceName: ${c["input"]!!.str}") {
            eq(c["expected"]!!.str, QueueHandoff.deviceName(c["input"]!!.str!!))
        }
        for (c in arr("saveWindow")) t("saveWindow: ${c.name}") {
            val i = c["input"]!!.jsonObject
            val got = QueueHandoff.saveWindow(songs(i["songs"]!!), i["currentIndex"]!!.jsonPrimitive.int)
            val e = c["expected"]!!
            val want = if (e is JsonNull) null else QueueHandoff.Window(ids(e.jsonObject["ids"]!!), e.jsonObject["currentIndex"]!!.jsonPrimitive.int)
            eq(want, got)
        }
        for (c in arr("shouldSave")) t("shouldSave: ${c.name}") {
            val i = c["input"]!!.jsonObject
            eq(
                c["expected"]!!.jsonPrimitive.boolean,
                QueueHandoff.shouldSave(
                    QueueHandoff.SaveCheck(
                        enabled = i.bool("enabled"), online = i.bool("online"), queueLength = i["queueLength"]!!.jsonPrimitive.int,
                        currentIsLocal = i.bool("currentIsLocal"), leftBehindShowing = i.bool("leftBehindShowing"),
                    ),
                ),
            )
        }
        for (c in arr("debounce")) t("debounce: ${c.name}") {
            // A pretend clock: timers fire when time is moved past them.
            class Timer(val at: Long, val fn: () -> Unit)
            var now = 0L
            val timers = ArrayList<Timer>()
            val saves = ArrayList<Pair<Long, String>>()
            val d = QueueHandoff.createSaveDebouncer(
                save = { event -> saves += now to event.name },
                setTimer = { fn, ms -> Timer(now + ms, fn).also { timers += it } },
                clearTimer = { timer -> timers.remove(timer) },
            )
            fun runUntil(time: Long) {
                while (true) {
                    val next = timers.filter { it.at <= time }.minByOrNull { it.at } ?: break
                    timers.remove(next)
                    now = next.at
                    next.fn()
                }
                now = time
            }
            for (e in c["events"]!!.jsonArray.map { it.jsonObject }) {
                runUntil(e["at"]!!.jsonPrimitive.long)
                d.event(QueueHandoff.SaveEvent.valueOf(e["event"]!!.str!!))
            }
            runUntil(Long.MAX_VALUE / 4)
            eq(c["expected"]!!.jsonArray.map { it.jsonObject["at"]!!.jsonPrimitive.long to it.jsonObject["event"]!!.str }, saves)
        }
        for (c in arr("offer")) t("offer: ${c.name}") {
            // The rules never read this device's clock (no clock is passed in at all).
            val i = c["input"]!!.jsonObject
            val got = offer(
                QueueHandoff.OfferInput(
                    thisApp = i["thisApp"]!!.str!!, username = i["username"]!!.str!!,
                    queue = queue(i["queue"]), handledChanged = i["handledChanged"]?.str,
                    playingHere = i.bool("playingHere"), nowPlaying = nowPlaying(i["nowPlaying"]!!),
                ),
            )
            val e = c["expected"]!!
            val want = if (e is JsonNull) null else e.jsonObject.let { o ->
                QueueHandoff.Offer(
                    kind = QueueHandoff.Kind.valueOf(o["kind"]!!.str!!), device = o["device"]!!.str!!,
                    song = Id(o["song"]!!.jsonObject["id"]!!.str!!), index = o["index"]!!.jsonPrimitive.int,
                    positionMs = o["positionMs"]!!.jsonPrimitive.long, changed = o["changed"]!!.str!!,
                )
            }
            eq(want, got)
        }
        for (c in arr("leftBehindCandidate")) t("leftBehindCandidate: ${c.name}") {
            eq(leftBehindOf(c["expected"]!!), QueueHandoff.leftBehindCandidate(candidate(c["input"]!!.jsonObject)))
        }
        for (c in arr("leftBehind")) t("leftBehind: ${c.name}") {
            val i = c["input"]!!.jsonObject
            eq(leftBehindOf(c["expected"]!!), leftBehind(QueueHandoff.LeftBehindInput(candidate(i), i["serverChangedBy"]?.str)))
        }
        for (c in arr("isNaturalEnd")) t("isNaturalEnd: ${c.name}") {
            val i = c["input"]!!.jsonObject
            eq(c["expected"]!!.jsonPrimitive.boolean, QueueHandoff.isNaturalEnd(i["positionS"]!!.jsonPrimitive.double, i["durationS"]!!.jsonPrimitive.double))
        }
        for (c in arr("isQueueCleared")) t("isQueueCleared: ${c.name}") {
            val i = c["input"]!!.jsonObject
            eq(
                c["expected"]!!.jsonPrimitive.boolean,
                QueueHandoff.isQueueCleared(ids(i["previousIds"]!!), ids(i["currentIds"]!!), i["previousCurrentId"]?.str),
            )
        }
        for (c in arr("ageText")) t("ageText: ${c.name}") {
            val i = c["input"]!!.jsonObject
            val e = c["expected"]!!.jsonObject
            val want: Age = when (e["unit"]!!.str) {
                "justNow" -> Age.JustNow
                "minutes" -> Age.Minutes(e["count"]!!.jsonPrimitive.long)
                "hours" -> Age.Hours(e["count"]!!.jsonPrimitive.long)
                "yesterday" -> Age.Yesterday
                "date" -> Age.Date(e["changed"]!!.str!!)
                else -> error("unknown unit ${e["unit"]}")
            }
            eq(want, QueueHandoff.ageText(i["changed"]!!.str!!, i["nowMs"]!!.jsonPrimitive.long))
        }
        return out
    }

    // ---------------------------------------------------------------- reading the file

    private val JsonElement.str get() = (this as? JsonPrimitive)?.contentOrNull
    private val JsonObject.name get() = this["name"]?.str.orEmpty()
    private fun JsonObject.bool(k: String) = this[k]!!.jsonPrimitive.booleanOrNull!!
    private fun arr(section: String) = cases[section]!!.jsonArray.map { it.jsonObject }

    /** Expands {"generate": {...}} lists (see "about" in the cases file). */
    private fun ids(list: JsonElement): List<String> {
        if (list is JsonArray) return list.map { it.str!! }
        val g = list.jsonObject["generate"]!!.jsonObject
        val prefix = g["prefix"]!!.str!!
        val out = ArrayList<String>()
        var i = g["from"]!!.jsonPrimitive.int
        val to = g["to"]!!.jsonPrimitive.int
        val step = g["step"]!!.jsonPrimitive.int
        while (i < to) { out += "$prefix$i"; i += step }
        return out
    }

    private fun songs(list: JsonElement): List<QueueHandoff.QueueSong> {
        if (list is JsonArray) return list.map { QueueHandoff.QueueSong(it.jsonObject["id"]!!.str!!, it.jsonObject["local"]!!.jsonPrimitive.boolean) }
        val g = list.jsonObject["generate"]!!.jsonObject
        val prefix = g["prefix"]!!.str!!
        val every = g["localEvery"]?.jsonPrimitive?.int ?: 0
        return ids(list).map { id ->
            val i = id.removePrefix(prefix).toInt()
            QueueHandoff.QueueSong(id, every != 0 && i % every == every - 1)
        }
    }

    private fun queue(e: JsonElement?): QueueHandoff.SavedQueue<Id>? {
        if (e == null || e is JsonNull) return null
        val o = e.jsonObject
        return QueueHandoff.SavedQueue(
            entries = o["entries"]!!.jsonArray.map { Id(it.jsonObject["id"]!!.str!!) },
            currentIndex = o["currentIndex"]!!.jsonPrimitive.int,
            positionMs = o["positionMs"]!!.jsonPrimitive.long,
            changed = o["changed"]!!.str!!,
            changedBy = o["changedBy"]!!.str!!,
        )
    }

    private fun nowPlaying(e: JsonElement) = e.jsonArray.map {
        val o = it.jsonObject
        QueueHandoff.NowPlaying(o["username"]!!.str!!, o["playerName"]!!.str!!, o["state"]!!.str!!, o["positionMs"]!!.jsonPrimitive.long, o["id"]!!.str!!)
    }

    private fun candidate(i: JsonObject) = QueueHandoff.LeftBehindCandidateInput(
        publishing = i.bool("publishing"), playingHere = i.bool("playingHere"), thisApp = i["thisApp"]!!.str!!,
        username = i["username"]!!.str!!, nowPlaying = nowPlaying(i["nowPlaying"]!!), queueIds = ids(i["queueIds"]!!),
        alreadyShown = i.bool("alreadyShown"),
    )

    private fun leftBehindOf(e: JsonElement) =
        if (e is JsonNull) null else QueueHandoff.LeftBehind(e.jsonObject["device"]!!.str!!, e.jsonObject["song"]!!.str!!)

    private fun tagCopy(): ByteArray? = runCatching {
        val p = ProcessBuilder("git", "show", "v0.6.0:tools/dev-rig/queue-handoff-cases.json")
            .directory(File(System.getProperty("user.dir"))).redirectErrorStream(false).start()
        val out = p.inputStream.readBytes()
        if (p.waitFor() == 0 && out.isNotEmpty()) out else null
    }.getOrNull()

    companion object {
        /** SHA-256 of tools/dev-rig/queue-handoff-cases.json at desktop tag v0.6.0 (7812847). */
        const val V060_SHA256 = "5358adced87d22d522ccdca73cf7bd27daac473de5c33d76c39171d100502c71"
        val RUN_SECTIONS = setOf(
            "deviceName", "saveWindow", "shouldSave", "debounce", "offer", "leftBehindCandidate",
            "leftBehind", "isNaturalEnd", "isQueueCleared", "ageText",
        )
    }
}
