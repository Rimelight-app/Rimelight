package com.tonihk00.clearplay.player

import androidx.media3.common.Player

/**
 * The queue played to its end with repeat off: stop on the last song, paused at its start, the
 * queue kept (like the desktop, src/service/playback-errors.ts "stopAtEnd"). Resume, the
 * notification and media buttons then play that song from the beginning, also after the app was
 * killed, since the position saved next is 0 instead of the song's end.
 */
fun stopOnLastSong(player: Player) {
    if (player.mediaItemCount == 0 || player.repeatMode != Player.REPEAT_MODE_OFF) return
    player.playWhenReady = false
    player.seekTo(player.currentMediaItemIndex, 0)
}
