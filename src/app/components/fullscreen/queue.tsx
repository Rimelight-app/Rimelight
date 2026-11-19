import { useVirtualizer } from '@tanstack/react-virtual'
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerSonglist,
} from '@/store/player.store'
import { QueueItem } from './queue-item'

const ROW = 64
/** Pixels the pointer must move before a press becomes a drag. */
const DRAG_THRESHOLD = 5
/** Distance from the list edge where dragging scrolls the list. */
const EDGE = 48

type DragState = { from: number; to: number; offset: number }

export function FullscreenSongQueue() {
  const { setSongList, moveInQueue } = usePlayerActions()
  const { currentList, currentSong } = usePlayerSonglist()
  const isPlaying = usePlayerIsPlaying()

  const parentRef = useRef<HTMLDivElement>(null)
  const [drag, setDragState] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const setDrag = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDragState(next)
  }, [])
  const dragging = drag !== null
  const pressRef = useRef<{
    from: number
    startY: number
    startScroll: number
    lastY: number
    active: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const scrollFrame = useRef(0)

  const getScrollElement = useCallback(
    () =>
      parentRef.current?.querySelector<HTMLElement>(
        '[data-radix-scroll-area-viewport]',
      ) ?? null,
    [],
  )

  const virtualizer = useVirtualizer({
    count: currentList.length,
    getScrollElement,
    estimateSize: () => ROW,
    overscan: 5,
  })

  // Follow the playing song when it changes (not when the queue is
  // reordered around it, which would make the list jump after a drag).
  const currentId = currentSong.id
  const listRef = useRef(currentList)
  listRef.current = currentList
  useEffect(() => {
    if (!currentId) return
    const index = listRef.current.findIndex((song) => song.id === currentId)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'start' })
  }, [currentId, virtualizer])

  const count = currentList.length

  const update = useCallback(
    (clientY: number) => {
      const press = pressRef.current
      const viewport = getScrollElement()
      if (!press || !viewport) return
      press.lastY = clientY
      const offset =
        clientY - press.startY + (viewport.scrollTop - press.startScroll)
      if (!press.active) {
        if (Math.abs(clientY - press.startY) < DRAG_THRESHOLD) return
        press.active = true
      }
      const to = Math.min(
        count - 1,
        Math.max(0, press.from + Math.round(offset / ROW)),
      )
      setDrag({ from: press.from, to, offset })
    },
    [count, getScrollElement, setDrag],
  )

  // While dragging near the top or bottom edge, scroll the list.
  const autoScroll = useCallback(() => {
    const press = pressRef.current
    const viewport = getScrollElement()
    if (!press?.active || !viewport) return
    const rect = viewport.getBoundingClientRect()
    let speed = 0
    if (press.lastY < rect.top + EDGE) {
      speed = -Math.ceil((rect.top + EDGE - press.lastY) / 4)
    } else if (press.lastY > rect.bottom - EDGE) {
      speed = Math.ceil((press.lastY - (rect.bottom - EDGE)) / 4)
    }
    if (speed !== 0) {
      viewport.scrollTop += speed
      update(press.lastY)
    }
    scrollFrame.current = requestAnimationFrame(autoScroll)
  }, [getScrollElement, update])

  const endDrag = useCallback(
    (commit: boolean) => {
      cancelAnimationFrame(scrollFrame.current)
      const press = pressRef.current
      const current = dragRef.current
      pressRef.current = null
      setDrag(null)
      if (commit && press?.active && current && current.from !== current.to) {
        moveInQueue(current.from, current.to)
      }
      if (press?.active) {
        // The release also fires a click on the row; don't play it.
        suppressClick.current = true
        window.setTimeout(() => {
          suppressClick.current = false
        }, 0)
      }
    },
    [moveInQueue, setDrag],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => update(e.clientY)
    const onUp = () => endDrag(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endDrag(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [dragging, update, endDrag])

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [])

  function onPointerDown(e: ReactPointerEvent, index: number) {
    if (e.button !== 0) return
    const viewport = getScrollElement()
    if (!viewport) return
    pressRef.current = {
      from: index,
      startY: e.clientY,
      startScroll: viewport.scrollTop,
      lastY: e.clientY,
      active: false,
    }
    // Watch the first moves here; once it is a drag the window listeners
    // above take over (they also catch moves outside the list).
    const onFirstMove = (ev: PointerEvent) => {
      update(ev.clientY)
      if (pressRef.current?.active) {
        window.removeEventListener('pointermove', onFirstMove)
        cancelAnimationFrame(scrollFrame.current)
        scrollFrame.current = requestAnimationFrame(autoScroll)
      }
    }
    const onFirstUp = () => {
      window.removeEventListener('pointermove', onFirstMove)
      window.removeEventListener('pointerup', onFirstUp)
      if (!pressRef.current?.active) pressRef.current = null
    }
    window.addEventListener('pointermove', onFirstMove)
    window.addEventListener('pointerup', onFirstUp)
  }

  if (currentList.length === 0)
    return (
      <div className="flex justify-center items-center">
        <span>No songs in queue</span>
      </div>
    )

  return (
    <ScrollArea
      ref={parentRef}
      type="always"
      className="min-h-full h-full overflow-auto"
      thumbClassName="secondary-thumb-bar"
      // Dragging a song must not drag the fullscreen sheet closed.
      data-vaul-no-drag=""
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
        className={drag ? 'select-none cursor-grabbing' : undefined}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const index = virtualRow.index
          const entry = currentList[index]
          if (!entry) return null
          const isDragged = drag?.from === index
          let y = virtualRow.start
          if (drag && !isDragged) {
            // Make room where the dragged song would land.
            if (drag.from < drag.to && index > drag.from && index <= drag.to) {
              y -= ROW
            } else if (
              drag.to < drag.from &&
              index >= drag.to &&
              index < drag.from
            ) {
              y += ROW
            }
          } else if (isDragged && drag) {
            y += drag.offset
          }
          return (
            <QueueItem
              key={entry.id}
              data-row-index={index}
              data-state={currentSong.id === entry.id ? 'active' : 'inactive'}
              data-dragging={isDragged ? '' : undefined}
              index={index}
              song={entry}
              isPlaying={currentSong.id === entry.id && isPlaying}
              onPointerDown={(e) => onPointerDown(e, index)}
              onClick={() => {
                if (suppressClick.current) return
                if (currentSong.id !== entry.id) {
                  setSongList(currentList, index)
                }
              }}
              style={{
                position: 'absolute',
                top: 0,
                transform: `translate3d(0, ${y}px, 0)`,
                zIndex: isDragged ? 10 : undefined,
                // The dragged row follows the pointer exactly; the others
                // (and the dropped row) glide into place.
                transition: isDragged
                  ? 'none'
                  : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
              }}
            />
          )
        })}
      </div>
    </ScrollArea>
  )
}
