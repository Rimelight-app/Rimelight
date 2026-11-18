// Discord Rich Presence was removed in ClearPlay. These no-ops keep the
// existing player/app store call sites unchanged.
import { ISong } from '@/types/responses/song'

function send(_song: ISong, _currentTime = 0, _duration = 0) {}
function clear() {}
function sendCurrentSong() {}

export const discordRpc = {
  send,
  clear,
  sendCurrentSong,
}
