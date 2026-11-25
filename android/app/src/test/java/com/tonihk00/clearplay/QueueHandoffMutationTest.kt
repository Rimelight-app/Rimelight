package com.tonihk00.clearplay

import com.tonihk00.clearplay.QueueHandoffCasesTest.Id
import com.tonihk00.clearplay.player.QueueHandoff
import com.tonihk00.clearplay.player.QueueHandoff.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The shared cases must catch a broken rule. Two copies of the port, each with one rule taken
 * out, are run against the cases: both must fail cases, and the real rules must fail none.
 * (The same two mutations were also made in QueueHandoff.kt itself and reverted; see the
 * 1.6.0 notes.)
 */
class QueueHandoffMutationTest {
    private val runner = QueueHandoffCasesTest()

    /** leftBehind without the changedBy check: the device that just took over would see the pill. */
    private fun leftBehindWithoutChangedBy(input: QueueHandoff.LeftBehindInput) =
        QueueHandoff.leftBehindCandidate(input.candidate)

    /** startPoint that trusts any app's Now Playing (Symfonium's live position counts up after a pause). */
    private fun startPointTrustingAnyApp(queue: QueueHandoff.SavedQueue<Id>, username: String, nowPlaying: List<QueueHandoff.NowPlaying>): QueueHandoff.Start {
        val last = queue.entries.size - 1
        val saved = minOf(maxOf(0, queue.currentIndex), last)
        val savedPosition = maxOf(0L, queue.positionMs)
        // (the "only the other ClearPlay app" check is missing here)
        val mine = nowPlaying.filter { it.username == username && it.playerName == queue.changedBy }
        val live = mine.find { it.state == "playing" } ?: mine.find { it.state == "paused" }
            ?: return QueueHandoff.Start(Kind.paused, saved, savedPosition)
        val kind = if (live.state == "playing") Kind.playing else Kind.paused
        var index = (saved..last).firstOrNull { queue.entries[it].id == live.id } ?: -1
        if (index < 0) index = (0 until saved).firstOrNull { queue.entries[it].id == live.id } ?: -1
        if (index < 0) return QueueHandoff.Start(kind, saved, savedPosition)
        return QueueHandoff.Start(kind, index, maxOf(0L, live.positionMs))
    }

    private fun offerTrustingAnyApp(input: QueueHandoff.OfferInput<Id>): QueueHandoff.Offer<Id>? {
        val queue = input.queue
        if (queue == null || queue.entries.isEmpty()) return null
        if (queue.changedBy == input.thisApp) return null
        if (!QueueHandoff.isLater(queue.changed, input.handledChanged)) return null
        if (input.playingHere) return null
        val start = startPointTrustingAnyApp(queue, input.username, input.nowPlaying)
        return QueueHandoff.Offer(start.kind, QueueHandoff.deviceName(queue.changedBy), queue.entries[start.index], start.index, start.positionMs, queue.changed)
    }

    @Test fun realRulesPassEveryCase() {
        assertEquals(emptyList<String>(), runner.runAll().filter { it.second != null }.map { it.first })
    }

    @Test fun casesCatchLeftBehindWithoutChangedBy() {
        val failed = runner.runAll(leftBehind = ::leftBehindWithoutChangedBy).filter { it.second != null }.map { it.first }
        println("mutation leftBehind without changedBy: ${failed.size} cases fail: $failed")
        assertTrue(failed.isNotEmpty())
        assertTrue(failed.all { it.startsWith("leftBehind: ") })
    }

    @Test fun casesCatchStartPointTrustingAnyApp() {
        val failed = runner.runAll(offer = ::offerTrustingAnyApp).filter { it.second != null }.map { it.first }
        println("mutation startPoint trusting any app: ${failed.size} cases fail: $failed")
        assertTrue(failed.isNotEmpty())
        assertTrue(failed.all { it.startsWith("offer: ") })
    }
}
