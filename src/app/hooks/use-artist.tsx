import { useQuery } from '@tanstack/react-query'
import { subsonic } from '@/service/subsonic'
import { retryPageLoad } from '@/utils/pageLoad'
import { queryKeys } from '@/utils/queryKeys'

export const useGetArtist = (artistId: string) => {
  return useQuery({
    queryKey: [queryKeys.artist.single, artistId],
    queryFn: () => subsonic.artists.getOneOrThrow(artistId),
    enabled: !!artistId,
    retry: retryPageLoad,
  })
}

export const useGetArtistInfo = (artistId: string) => {
  return useQuery({
    queryKey: [queryKeys.artist.info, artistId],
    queryFn: () => subsonic.artists.getInfo(artistId),
    enabled: !!artistId,
  })
}

export const useGetTopSongs = (artistName?: string) => {
  return useQuery({
    queryKey: [queryKeys.artist.topSongs, artistName],
    queryFn: () => subsonic.songs.getTopSongs(artistName ?? ''),
    enabled: !!artistName,
  })
}
