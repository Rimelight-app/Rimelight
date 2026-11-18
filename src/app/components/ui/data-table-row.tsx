import { Cell, flexRender, Row } from '@tanstack/react-table'
import clsx from 'clsx'
import { ComponentPropsWithoutRef, memo, ReactNode, useMemo } from 'react'
import { ContextMenuProvider } from '@/app/components/table/context-menu'
import { usePlayerCurrentSong } from '@/store/player.store'
import { ColumnDefType } from '@/types/react-table/columnDef'

export const TABLE_ROW_SIZES = {
  DEFAULT: 56,
  WITH_DISK: 112,
}

interface RowProps<TData> extends ComponentPropsWithoutRef<'div'> {
  index: number
  row: Row<TData>
  contextMenuOptions: ReactNode
  isPrevRowSelected: (rowIndex: number) => boolean
  isNextRowSelected: (rowIndex: number) => boolean
  variant?: 'classic' | 'modern'
  dataType?: 'song' | 'artist' | 'playlist' | 'radio' | 'genre'
  clickable?: boolean
}

const MemoContextMenuProvider = memo(ContextMenuProvider)
const MemoTableCell = memo(TableCell) as typeof TableCell

export function TableRow<TData>({
  index,
  row,
  contextMenuOptions,
  variant,
  dataType,
  clickable,
  isPrevRowSelected,
  isNextRowSelected,
  ...props
}: RowProps<TData>) {
  const currentSong = usePlayerCurrentSong()

  const isRowSongActive = useMemo(() => {
    if (dataType !== 'song') return false

    // @ts-expect-error row type
    return row.original.id === currentSong.id
  }, [currentSong.id, dataType, row.original])

  return (
    <MemoContextMenuProvider options={contextMenuOptions}>
      <div
        {...props}
        role="row"
        data-test-id="table-row"
        data-state={row.getIsSelected() && 'selected'}
        className={clsx(
          'group/tablerow w-full flex flex-row transition-colors duration-150',
          row.getIsSelected() && !isPrevRowSelected(index) && 'rounded-t-lg',
          row.getIsSelected() && !isNextRowSelected(index) && 'rounded-b-lg',
          !row.getIsSelected() && 'rounded-lg',
          'hover:bg-white/[0.06] data-[state=selected]:bg-white/[0.11]',
          clickable && 'cursor-pointer',
          isRowSongActive && 'row-active bg-white/[0.08]',
        )}
      >
        {row.getVisibleCells().map((cell) => (
          <MemoTableCell key={cell.id} cell={cell} />
        ))}
      </div>
    </MemoContextMenuProvider>
  )
}

interface TableCellProps<TData, TValue> {
  cell: Cell<TData, TValue>
}

function TableCell<TData, TValue>({ cell }: TableCellProps<TData, TValue>) {
  const columnDef = cell.column.columnDef as ColumnDefType<TData>

  return (
    <div
      key={cell.id}
      className={clsx(
        'p-2 flex flex-row items-center justify-start [&:has([role=checkbox])]:pr-4',
        columnDef.className,
      )}
      style={columnDef.style}
      role="cell"
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </div>
  )
}
