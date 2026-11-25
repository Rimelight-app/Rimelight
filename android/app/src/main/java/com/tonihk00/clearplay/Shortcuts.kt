package com.tonihk00.clearplay

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.tonihk00.clearplay.data.api.Song
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * The launcher's long-press shortcuts: Shuffle library, Resume (with the song: "Resume · Way
 * Bigger") and Downloads. Dynamic, not res/xml/shortcuts.xml: static shortcuts hard-code the
 * package, and debug builds are com.tonihk00.clearplay.debug.
 */
class Shortcuts(private val context: Context, private val scope: CoroutineScope) {
    /** The song Resume's label names; the label changes at most once per song. */
    private var labelled: String? = null
    private var published = false

    /** Publishes all three; Resume is disabled while nothing is saved ([resume] null). */
    fun publish(resume: Song?) {
        labelled = resume?.id
        published = true
        scope.launch(Dispatchers.IO) {
            runCatching {
                val list = buildList {
                    add(shortcut(SHUFFLE, "Shuffle library", "Shuffle library", R.drawable.sc_shuffle, ACTION_SHUFFLE, 0))
                    if (resume != null) {
                        val label = "Resume · ${resume.title.ifBlank { "your queue" }}"
                        add(shortcut(RESUME, label, label, R.drawable.sc_resume, ACTION_RESUME, 1))
                    }
                    add(shortcut(DOWNLOADS, "Downloads", "Downloads", R.drawable.sc_downloads, ACTION_DOWNLOADS, 2))
                }
                ShortcutManagerCompat.setDynamicShortcuts(context, list)
                if (resume == null) {
                    ShortcutManagerCompat.disableShortcuts(context, listOf(RESUME), "Nothing to resume yet")
                } else {
                    ShortcutManagerCompat.enableShortcuts(context, list.filter { it.id == RESUME })
                }
            }
        }
    }

    /** The playing song changed: Resume names it (once per song). */
    fun songChanged(song: Song) {
        if (published && song.id == labelled) return
        publish(song)
    }

    /** A shortcut was used (helps the launcher rank them). */
    fun used(action: String) {
        val id = idOf(action) ?: return
        scope.launch(Dispatchers.IO) { runCatching { ShortcutManagerCompat.reportShortcutUsed(context, id) } }
    }

    private fun shortcut(id: String, short: String, long: String, icon: Int, action: String, rank: Int) =
        ShortcutInfoCompat.Builder(context, id)
            .setShortLabel(short)
            .setLongLabel(long)
            .setIcon(IconCompat.createWithResource(context, icon))
            .setIntent(Intent(action).setClassName(context.packageName, MainActivity::class.java.name))
            .setRank(rank)
            .build()

    companion object {
        const val ACTION_SHUFFLE = "com.tonihk00.clearplay.action.SHUFFLE"
        const val ACTION_RESUME = "com.tonihk00.clearplay.action.RESUME"
        const val ACTION_DOWNLOADS = "com.tonihk00.clearplay.action.DOWNLOADS"
        val ACTIONS = setOf(ACTION_SHUFFLE, ACTION_RESUME, ACTION_DOWNLOADS)

        const val SHUFFLE = "shuffle"
        const val RESUME = "resume"
        const val DOWNLOADS = "downloads"

        fun idOf(action: String) = when (action) {
            ACTION_SHUFFLE -> SHUFFLE
            ACTION_RESUME -> RESUME
            ACTION_DOWNLOADS -> DOWNLOADS
            else -> null
        }
    }
}

/**
 * What a shortcut does, once the app knows whether someone is signed in. Kept apart from the UI
 * so it can be tested: [player] calls wait for the player service ([whenConnected]).
 */
class ShortcutActions(
    private val signedIn: () -> Boolean,
    private val whenConnected: (() -> Unit) -> Unit,
    private val shuffleLibrary: () -> Unit,
    /** Plays the loaded queue, or the saved one; false if there is nothing to resume. */
    private val resume: () -> Boolean,
    private val openDownloads: () -> Unit,
    private val onNothingToResume: () -> Unit = {},
) {
    /** Handles [action]; returns false (and does nothing) when it isn't one or nobody is signed in. */
    fun handle(action: String): Boolean {
        if (action !in Shortcuts.ACTIONS) return false
        // Signed out: the login screen shows, and the shortcut is dropped.
        if (!signedIn()) return false
        when (action) {
            Shortcuts.ACTION_SHUFFLE -> whenConnected { shuffleLibrary() }
            Shortcuts.ACTION_RESUME -> whenConnected { if (!resume()) onNothingToResume() }
            Shortcuts.ACTION_DOWNLOADS -> openDownloads()
        }
        return true
    }
}
