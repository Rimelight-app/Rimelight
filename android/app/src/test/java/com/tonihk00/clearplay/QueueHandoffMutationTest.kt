package com.tonihk00.clearplay

import com.tonihk00.clearplay.QueueHandoffCasesTest.Id
import com.tonihk00.clearplay.player.QueueHandoff
import com.tonihk00.clearplay.player.QueueHandoff.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The shared cases must catch a broken rule. Copies of the port, each with one rule broken, are
 * run against the cases: each must fail cases, and the real rules must fail none. (The same
 * mutations were also made in QueueHandoff.kt itself and reverted; see the 1.6.0 and 1.6.1 notes.)
 *
 * [Rules] is a copy of the version 4 rules (offer / startPoint / leftBehindCandidate / leftBehind)
 * with switches for the mutations; with every switch off it must pass every case, like the real one.
 */
class QueueHandoffMutationTest {
    private val runner = QueueHandoffCasesTest()

    private class Rules(
        /** appOf knows only the new names (LEGACY_NAMES ignored). */
        val appOfIgnoresLegacy: Boolean = false,
        /** isThisApp is client == thisApp: a queue this phone saved under its old name is offered back. */
        val isThisAppIgnoresOldName: Boolean = false,
        /** leftBehindCandidate names the device after thisApp's other app, not after the entry. */
        val deviceFromOtherApp: Boolean = false,
        /** startPoint trusts any app's Now Playing (Symfonium's live position counts up after a pause). */
        val trustAnyApp: Boolean = false,
        /** leftBehind without the changedBy check: the device that just took over would see the pill. */
        val leftBehindWithoutChangedBy: Boolean = false,
    ) {
        fun appOf(client: String?): String? {
            if (client.isNullOrEmpty()) return null
            if (client == QueueHandoff.DESKTOP_APP || client == QueueHandoff.ANDROID_APP) return client
            if (appOfIgnoresLegacy) return null
            return QueueHandoff.LEGACY_NAMES[client]
        }

        fun isOtherApp(thisApp: String, client: String?): Boolean {
            val app = appOf(client)
            return app != null && app != appOf(thisApp)
        }

        fun isThisApp(thisApp: String, client: String?): Boolean {
            if (isThisAppIgnoresOldName) return client == thisApp
            val app = appOf(client)
            return if (app == null) client == thisApp else app == appOf(thisApp)
        }

        fun startPoint(queue: QueueHandoff.SavedQueue<Id>, thisApp: String, username: String, nowPlaying: List<QueueHandoff.NowPlaying>): QueueHandoff.Start {
            val last = queue.entries.size - 1
            val saved = minOf(maxOf(0, queue.currentIndex), last)
            val savedPosition = maxOf(0L, queue.positionMs)
            if (!trustAnyApp && !isOtherApp(thisApp, queue.changedBy)) return QueueHandoff.Start(Kind.saved, saved, savedPosition)
            val mine = if (trustAnyApp) {
                nowPlaying.filter { it.username == username && it.playerName == queue.changedBy }
            } else {
                val savedBy = appOf(queue.changedBy)
                nowPlaying.filter { it.username == username && appOf(it.playerName) == savedBy }
            }
            val live = mine.find { it.state == "playing" } ?: mine.find { it.state == "paused" }
                ?: return QueueHandoff.Start(Kind.paused, saved, savedPosition)
            val kind = if (live.state == "playing") Kind.playing else Kind.paused
            var index = (saved..last).firstOrNull { queue.entries[it].id == live.id } ?: -1
            if (index < 0) index = (0 until saved).firstOrNull { queue.entries[it].id == live.id } ?: -1
            if (index < 0) return QueueHandoff.Start(kind, saved, savedPosition)
            return QueueHandoff.Start(kind, index, maxOf(0L, live.positionMs))
        }

        fun offer(input: QueueHandoff.OfferInput<Id>): QueueHandoff.Offer<Id>? {
            val queue = input.queue
            if (queue == null || queue.entries.isEmpty()) return null
            if (isThisApp(input.thisApp, queue.changedBy)) return null
            if (!QueueHandoff.isLater(queue.changed, input.handledChanged)) return null
            if (input.playingHere) return null
            val start = startPoint(queue, input.thisApp, input.username, input.nowPlaying)
            return QueueHandoff.Offer(start.kind, QueueHandoff.deviceName(queue.changedBy), queue.entries[start.index], start.index, start.positionMs, queue.changed)
        }

        fun leftBehindCandidate(input: QueueHandoff.LeftBehindCandidateInput): QueueHandoff.LeftBehind? {
            if (!input.publishing || !input.playingHere || input.alreadyShown) return null
            val ids = input.queueIds.toHashSet()
            val entry = input.nowPlaying.find { e ->
                e.username == input.username && isOtherApp(input.thisApp, e.playerName) && e.state == "playing" && e.id in ids
            } ?: return null
            val device = if (deviceFromOtherApp) {
                QueueHandoff.deviceName(if (appOf(input.thisApp) == QueueHandoff.DESKTOP_APP) QueueHandoff.ANDROID_APP else QueueHandoff.DESKTOP_APP)
            } else {
                QueueHandoff.deviceName(entry.playerName)
            }
            return QueueHandoff.LeftBehind(device, entry.id)
        }

        fun leftBehind(input: QueueHandoff.LeftBehindInput): QueueHandoff.LeftBehind? {
            val found = leftBehindCandidate(input.candidate) ?: return null
            if (!leftBehindWithoutChangedBy && !isOtherApp(input.candidate.thisApp, input.serverChangedBy)) return null
            return found
        }
    }

    private fun failures(rules: Rules) =
        runner.runAll(offer = rules::offer, leftBehind = rules::leftBehind, leftBehindCandidate = rules::leftBehindCandidate)
            .filter { it.second != null }.map { it.first }

    private fun mutation(label: String, rules: Rules, sections: Set<String>): List<String> {
        val failed = failures(rules)
        println("mutation $label: ${failed.size} cases fail: $failed")
        assertTrue("$label: no shared case failed", failed.isNotEmpty())
        assertTrue("$label: failures outside $sections: $failed", failed.all { f -> sections.any { f.startsWith("$it: ") } })
        return failed
    }

    @Test fun realRulesPassEveryCase() {
        assertEquals(emptyList<String>(), runner.runAll().filter { it.second != null }.map { it.first })
    }

    @Test fun unmutatedCopyPassesEveryCase() {
        assertEquals(emptyList<String>(), failures(Rules()))
    }

    @Test fun casesCatchLeftBehindWithoutChangedBy() {
        mutation("leftBehind without changedBy", Rules(leftBehindWithoutChangedBy = true), setOf("leftBehind"))
    }

    @Test fun casesCatchStartPointTrustingAnyApp() {
        mutation("startPoint trusting any app", Rules(trustAnyApp = true), setOf("offer"))
    }

    @Test fun casesCatchAppOfIgnoringLegacyNames() {
        val failed = mutation("appOf ignoring LEGACY_NAMES", Rules(appOfIgnoresLegacy = true), setOf("offer", "leftBehindCandidate", "leftBehind"))
        // An old-name app is then nobody: no live-second start from ClearPlay 0.6.1, no left-behind pill.
        assertTrue(failed.any { it.startsWith("offer: ") })
        assertTrue(failed.any { it.startsWith("leftBehind") })
    }

    @Test fun casesCatchIsThisAppIgnoringOldOwnName() {
        mutation("isThisApp ignoring the old own name", Rules(isThisAppIgnoresOldName = true), setOf("offer"))
    }

    @Test fun casesCatchDeviceNameFromThisAppsOtherApp() {
        mutation("leftBehindCandidate device from thisApp's other app", Rules(deviceFromOtherApp = true), setOf("leftBehindCandidate", "leftBehind"))
    }
}
