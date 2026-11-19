export function shuffleSongList<T>(list: T[], index: number, isRandom = false) {
  const array = [...list]
  const firstPositionItem = array[index]

  if (!isRandom) {
    array.splice(index, 1)
  }

  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }

  if (!isRandom) {
    array.unshift(firstPositionItem)
  }

  return array
}

export function addNextSongList<T>(
  index: number,
  currentList: T[],
  newList: T[],
) {
  const firstPart = currentList.slice(0, index + 1)
  const secondPart = currentList.slice(index + 1)

  const updated = [...firstPart, ...newList, ...secondPart]

  return updated
}

/**
 * Puts `songs` right after the song with id `currentId`. Songs that are
 * already in the list (other than the current one) are moved, not skipped,
 * so "Play next" works for a song further down the queue.
 */
export function placeAfterCurrent<T extends { id: string }>(
  list: T[],
  currentId: string | undefined,
  songs: T[],
): T[] {
  const moving = songs.filter((s) => s.id !== currentId)
  const ids = new Set(moving.map((s) => s.id))
  const rest = list.filter((s) => !ids.has(s.id))
  const at = rest.findIndex((s) => s.id === currentId)
  return [...rest.slice(0, at + 1), ...moving, ...rest.slice(at + 1)]
}

/** Puts `songs` at the end; songs already in the list move to the end. */
export function placeAtEnd<T extends { id: string }>(
  list: T[],
  currentId: string | undefined,
  songs: T[],
): T[] {
  const moving = songs.filter((s) => s.id !== currentId)
  const ids = new Set(moving.map((s) => s.id))
  return [...list.filter((s) => !ids.has(s.id)), ...moving]
}

/** Moves the item at `from` to `to` (both indexes in the original list). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
