import { useQuery } from '@tanstack/react-query'
import { findAnimatedArtworkUrl } from '@/api/artworkClient'
import { useAppAnimatedCovers } from '@/store/app.store'
import { queryKeys } from '@/utils/queryKeys'

/**
 * The live-cover stream of an album. `artists` comes from
 * albumArtworkArtists / songArtworkArtists (src/api/artworkArtists.ts), so
 * the album page and the song screens ask the same question and share one
 * query: the key is the album and the candidate list, not the screen.
 */
export function useAnimatedAlbumArtwork(
  artists: string[],
  album?: string,
  enabled = true,
) {
  const { baseUrl, customUrlEnabled } = useAppAnimatedCovers()
  const normalizedAlbum = album?.trim() || ''
  const normalizedArtists = artists
    .map((artist) => artist.trim())
    .filter(Boolean)
  const normalizedBaseUrl = customUrlEnabled
    ? baseUrl.trim().toLowerCase()
    : 'default'

  return useQuery({
    queryKey: [
      queryKeys.album.animatedArtwork,
      normalizedAlbum.toLowerCase(),
      normalizedArtists.map((artist) => artist.toLowerCase()),
      normalizedBaseUrl,
    ],
    queryFn: () => findAnimatedArtworkUrl(normalizedArtists, normalizedAlbum),
    enabled: enabled && normalizedArtists.length > 0 && !!normalizedAlbum,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
}
