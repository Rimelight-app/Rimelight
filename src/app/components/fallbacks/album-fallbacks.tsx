import { TableFallback } from '@/app/components/fallbacks/table-fallbacks'
import { ShadowHeaderFallback } from '@/app/components/fallbacks/ui-fallbacks'
import ListWrapper from '@/app/components/list-wrapper'
import { MainGrid } from '@/app/components/main-grid'
import { Skeleton } from '@/app/components/ui/skeleton'

/**
 * Placeholder with the same geometry as ImageHeader. It is transparent (the
 * window backdrop shows through) and only fades in if loading takes longer
 * than a moment, so fast loads show no placeholder at all.
 */
export function AlbumHeaderFallback() {
  return (
    <div className="cp-delayed-fallback w-full px-8 pt-8 pb-5 flex items-end gap-7">
      <Skeleton className="shrink-0 rounded-[20px] size-[200px] 2xl:size-[232px]" />
      <div className="flex flex-col gap-3 pb-1">
        <Skeleton className="h-3 w-14 rounded-full" />
        <Skeleton className="h-12 w-[260px] rounded-xl" />
        <Skeleton className="h-4 w-[180px] rounded-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-12 rounded-full" />
          <Skeleton className="h-6 w-12 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function PlayButtonsFallback() {
  return (
    <div className="mb-6 flex gap-1 items-center">
      <Skeleton className="rounded-full w-14 h-14 mr-2" />
      <div className="flex items-center justify-center w-14 h-14">
        <Skeleton className="rounded-full w-7 h-7" />
      </div>
      <div className="flex items-center justify-center w-14 h-14">
        <Skeleton className="rounded-full w-7 h-7" />
      </div>
    </div>
  )
}

export function AlbumFallback() {
  return (
    <div className="w-full">
      <div className="relative">
        <AlbumHeaderFallback />
      </div>
      <ListWrapper className="cp-delayed-fallback">
        <PlayButtonsFallback />
        <TableFallback variant="modern" />
      </ListWrapper>
    </div>
  )
}

export function AlbumsFallback() {
  return (
    <div className="w-full">
      <ShadowHeaderFallback />

      <ListWrapper className="flex flex-col gap-4">
        <GridFallback />
      </ListWrapper>
    </div>
  )
}

function GridFallback() {
  return (
    <MainGrid>
      {Array.from({ length: 40 }).map((_, index) => (
        <div key={'card-fallback-' + index}>
          <Skeleton className="aspect-square" />
          <Skeleton className="h-[13px] w-11/12 mt-2" />
          <Skeleton className="h-3 w-1/2 mt-[7px]" />
        </div>
      ))}
    </MainGrid>
  )
}
