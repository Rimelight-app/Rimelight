import { useInfiniteQuery } from '@tanstack/react-query'
import { Shuffle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Actions } from '@/app/components/actions'
import { ShadowHeader } from '@/app/components/album/shadow-header'
import { InfinitySongListFallback } from '@/app/components/fallbacks/song-fallbacks'
import { HeaderTitle } from '@/app/components/header-title'
import { ClearFilterButton } from '@/app/components/search/clear-filter-button'
import { ExpandableSearchInput } from '@/app/components/search/expandable-input'
import { DataTableList } from '@/app/components/ui/data-table-list'
import { useTotalSongs } from '@/app/hooks/use-total-songs'
import { songsColumns } from '@/app/tables/songs-columns'
import { getArtistAllSongs, songsSearch } from '@/queries/songs'
import { shuffleLibrary } from '@/service/library-shuffle'
import { usePlayerActions } from '@/store/player.store'
import { ColumnFilter } from '@/types/columnFilter'
import { AlbumsFilters, AlbumsSearchParams } from '@/utils/albumsFilter'
import { queryKeys } from '@/utils/queryKeys'
import { SearchParamsHandler } from '@/utils/searchParamsHandler'

const DEFAULT_OFFSET = 100

export default function SongList() {
  const { t } = useTranslation()
  const { setSongList } = usePlayerActions()
  const [shuffling, setShuffling] = useState(false)
  const [searchParams] = useSearchParams()
  const { getSearchParam } = new SearchParamsHandler(searchParams)
  const columns = songsColumns()

  const filter = getSearchParam<string>(AlbumsSearchParams.MainFilter, '')
  const query = getSearchParam<string>(AlbumsSearchParams.Query, '')
  const artistId = getSearchParam<string>(AlbumsSearchParams.ArtistId, '')
  const artistName = getSearchParam<string>(AlbumsSearchParams.ArtistName, '')

  const searchFilterIsSet = filter === AlbumsFilters.Search && query !== ''
  const filterByArtist = artistId !== '' && artistName !== ''
  const hasSomeFilter = searchFilterIsSet || filterByArtist

  async function fetchSongs({ pageParam = 0 }) {
    if (filterByArtist) {
      return getArtistAllSongs(artistId)
    }

    return songsSearch({
      query: searchFilterIsSet ? query : '',
      songCount: DEFAULT_OFFSET,
      songOffset: pageParam,
    })
  }

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: [queryKeys.song.all, filter, query, artistId],
      initialPageParam: 0,
      queryFn: fetchSongs,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    })

  const { data: songCountData, isLoading: songCountIsLoading } = useTotalSongs()

  if (isLoading && !isFetchingNextPage) {
    return <InfinitySongListFallback />
  }
  if (!data) return null

  const songlist = data.pages.flatMap((page) => page.songs) ?? []
  const songCount = (hasSomeFilter ? songlist.length : songCountData) ?? 0

  function handlePlaySong(index: number) {
    if (!songlist) return

    setSongList(songlist, index, false, {
      type: 'songs',
      id: 'songs',
      name: t('sidebar.songs'),
    })
  }

  const columnsToShow: ColumnFilter[] = [
    'index',
    'title',
    'album',
    'duration',
    'playCount',
    'played',
    'contentType',
    'select',
  ]

  const title = filterByArtist
    ? t('songs.list.byArtist', { artist: artistName })
    : t('sidebar.songs')

  return (
    <div className="w-full h-content">
      <ShadowHeader
        showGlassEffect={false}
        fixed={false}
        className="relative w-full justify-between items-center"
      >
        <HeaderTitle
          title={title}
          count={songCount}
          loading={songCountIsLoading}
        />

        <div className="flex gap-2 flex-1 justify-end items-center">
          {!hasSomeFilter && (
            <Actions.Button
              tooltip={t('clearplay.shuffleLibrary.label')}
              aria-label={t('clearplay.shuffleLibrary.label')}
              disabled={shuffling}
              data-testid="shuffle-library"
              onClick={async () => {
                setShuffling(true)
                await shuffleLibrary()
                setShuffling(false)
              }}
            >
              <Shuffle className="size-[18px]" strokeWidth={1.75} />
            </Actions.Button>
          )}
          {filterByArtist && <ClearFilterButton />}
          <ExpandableSearchInput
            placeholder={t('songs.list.search.placeholder')}
          />
        </div>
      </ShadowHeader>

      <div className="w-full h-[calc(100%-80px)] overflow-auto">
        <DataTableList
          columns={columns}
          data={songlist}
          handlePlaySong={(row) => handlePlaySong(row.index)}
          columnFilter={columnsToShow}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
        />
      </div>
    </div>
  )
}
