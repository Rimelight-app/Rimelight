package com.tonihk00.clearplay

import android.os.Looper
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.Song
import com.tonihk00.clearplay.data.api.SubsonicClient
import com.tonihk00.clearplay.player.QueueStore
import com.tonihk00.clearplay.player.QueueWatcher
import com.tonihk00.clearplay.player.SavedPlayback
import com.tonihk00.clearplay.player.toMediaItem
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.nio.file.Files

/** Section A: the saved queue (filesDir/queue.json) and playback resumption's building blocks. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class QueueStoreTest {
    private val dir: File = Files.createTempDirectory("queue").toFile()
    private val server = ServerConfig("http://nd.local:4533", "toni", "tok", "salt")
    private val songs = (1..30).map { Song(id = "id$it", title = "Song $it", artist = "Artist", album = "Album", coverArt = "al-$it", duration = 200, server = server.baseUrl) }

    @Test fun saveLoadRoundTrip() {
        val store = QueueStore(dir.resolve("queue.json"))
        val saved = SavedPlayback(QueueStore.keyOf(server), songs, index = 7, positionMs = 61_500, shuffle = true, repeat = Player.REPEAT_MODE_ALL, endless = true, savedAt = 1_800_000_000_000)
        store.save(saved)
        assertEquals(saved, store.load())
        assertFalse("written via a temp file, renamed", dir.resolve("queue.json.tmp").exists())
        store.clear()
        assertNull(store.load())
    }

    @Test fun neverMoreThan1000SongsAroundTheCurrentOne() {
        val many = (0 until 2500).map { Song(id = "s$it") }
        val (window, at) = QueueStore.window(many, 1510)
        assertEquals(1000, window.size)
        assertEquals(100, at)
        assertEquals("s1510", window[at].id)
        assertEquals("s1410", window.first().id)
        assertEquals(songs to 3, QueueStore.window(songs, 3))
    }

    @Test fun anotherServerOrAccountIsNotRestored() {
        val saved = SavedPlayback(QueueStore.keyOf(server), songs, 0, 0)
        assertEquals("toni@http://nd.local:4533", saved.server)
        assertFalse(saved.server == QueueStore.keyOf(server.copy(user = "someone")))
        assertFalse(saved.server == QueueStore.keyOf(server.copy(url = "http://other:4533")))
        assertFalse(saved.server == QueueStore.keyOf(null as SubsonicClient?))
        assertEquals(QueueStore.LOCAL, QueueStore.keyOf(null as SubsonicClient?))
        assertTrue(saved.server == QueueStore.keyOf(server.copy(token = "new-token", salt = "new-salt")))
    }

    @Test fun aBrokenEntryIsDroppedWithoutCrashing() {
        val f = dir.resolve("queue.json")
        // Entry 2 has no id (unreadable), entry 3 has a blank one; the saved current song (index 2) is gone.
        f.writeText(
            """{"server":"toni@http://nd.local:4533","songs":[{"id":"a","title":"A"},{"id":"b"},{"title":"no id"},{"id":""},{"id":"c"}],
              "index":2,"positionMs":90000,"shuffle":false,"repeat":0,"endless":false,"savedAt":1}""",
        )
        val loaded = QueueStore(f).load()!!
        assertEquals(listOf("a", "b", "c"), loaded.songs.map { it.id })
        assertEquals("starts at the next song that is still there", "c", loaded.songs[loaded.index].id)
        assertEquals("the position belonged to the missing song", 0L, loaded.positionMs)
        f.writeText("not json at all")
        assertNull(QueueStore(f).load())
    }

    @Test fun savedStreamUrlsAreNeverReused() {
        // Items are rebuilt from the Song with today's client: today's token and bitrate.
        val client = SubsonicClient(server.copy(token = "fresh", salt = "pepper"))
        val item = songs[0].toMediaItem(client, maxBitRate = 192, format = "opus")
        val uri = item.requestMetadata.mediaUri.toString()
        assertTrue(uri.contains("t=fresh") && uri.contains("s=pepper"))
        assertTrue(uri.contains("maxBitRate=192") && uri.contains("format=opus"))
        val json = SubsonicClient.json.encodeToString(SavedPlayback.serializer(), SavedPlayback("k", songs.take(1), 0, 0))
        assertFalse("no URL or token in queue.json", json.contains("http://nd.local:4533/rest") || json.contains("tok"))
    }

    /** A song the server no longer has (code 70) is dropped from the queue and playback goes on. */
    @Test fun missingSongIsDroppedFromThePlayingQueue() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        val engine = MockEngine { req ->
            val missing = req.url.parameters["id"] == "id2"
            respond(
                if (missing) """{"subsonic-response":{"status":"failed","error":{"code":70,"message":"data not found"}}}"""
                else """{"subsonic-response":{"status":"ok","song":{"id":"${req.url.parameters["id"]}"}}}""",
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val client = SubsonicClient(server, HttpClient(engine))
        val player = ExoPlayer.Builder(context).setLooper(Looper.getMainLooper()).build()
        player.setMediaItems(songs.take(3).map { it.toMediaItem(client) }, 1, 0)
        val watcher = QueueWatcher(
            player, this, QueueStore(dir.resolve("q.json")), { QueueStore.keyOf(server) }, { false }, { false },
            handoff = { null }, client = { client }, online = { true }, io = Dispatchers.Unconfined,
        )
        watcher.onPlayerError(PlaybackException("not audio", null, PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED))
        withTimeout(5_000) { while (player.mediaItemCount != 2) delay(20) }
        assertEquals(listOf("id1", "id3"), (0 until player.mediaItemCount).map { player.getMediaItemAt(it).mediaId })

        // A song that is still there (e.g. a network hiccup) stays.
        watcher.onPlayerError(PlaybackException("io", null, PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED))
        delay(300)
        assertEquals(2, player.mediaItemCount)
        player.release()
    }

    @Test fun watcherSnapshotKeepsModesAndPosition() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        val player = ExoPlayer.Builder(context).setLooper(Looper.getMainLooper()).build()
        player.setMediaItems(songs.map { it.toMediaItem(null) }, 4, 33_000)
        player.shuffleModeEnabled = true
        player.repeatMode = Player.REPEAT_MODE_ONE
        val store = QueueStore(dir.resolve("w.json"))
        val watcher = QueueWatcher(
            player, this, store, { "k" }, { true }, { false },
            handoff = { null }, client = { null }, online = { false }, now = { 5L }, io = Dispatchers.Unconfined,
        )
        val snap = watcher.snapshot()!!
        assertEquals(4, snap.index)
        assertEquals(true, snap.shuffle)
        assertEquals(Player.REPEAT_MODE_ONE, snap.repeat)
        assertEquals(true, snap.endless)
        assertEquals(songs.map { it.id }, snap.songs.map { it.id })
        assertEquals("the Song is kept (title, cover) for the resume card", songs[4], snap.songs[4])
        watcher.save()?.join()
        assertNotNull(store.load())
        player.release()
    }
}
