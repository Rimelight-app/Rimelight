import { get, set } from 'idb-keyval'
import deburr from 'lodash/deburr'
import kebabCase from 'lodash/kebabCase'
import { useAppStore } from '@/store/app.store'

export const defaultArtworkServiceUrl = 'https://artwork.m8tec.top'
const artworkSearchPath = '/api/v1/artwork/search'

function getArtworkSearchUrl(): URL {
  const { customUrlEnabled, baseUrl: configuredBaseUrl } =
    useAppStore.getState().artwork
  const baseUrl = customUrlEnabled
    ? configuredBaseUrl || defaultArtworkServiceUrl
    : defaultArtworkServiceUrl

  try {
    return new URL(artworkSearchPath, baseUrl)
  } catch {
    return new URL(artworkSearchPath, defaultArtworkServiceUrl)
  }
}

function getUrlFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  const url = (payload as { url?: unknown }).url
  return typeof url === 'string' && url.includes('.m3u8') ? url : null
}

function getAnimatedArtworkCacheKey(artist: string, album: string): string {
  const normalizedArtist = kebabCase(deburr(artist))
  const normalizedAlbum = kebabCase(deburr(album))

  return `animated-artwork:${normalizedArtist}:${normalizedAlbum}`
}

export async function getAnimatedArtworkUrl(
  artist: string,
  album: string,
): Promise<string | null> {
  try {
    const cacheKey = getAnimatedArtworkCacheKey(artist, album)
    const cachedArtworkUrl = await get<string | null>(cacheKey)

    if (cachedArtworkUrl) {
      return cachedArtworkUrl
    }

    const query = new URLSearchParams({ artist, album })
    const searchUrl = getArtworkSearchUrl()
    searchUrl.search = query.toString()

    const response = await fetch(searchUrl)

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as unknown
    const streamUrl = getUrlFromPayload(payload)

    if (streamUrl) {
      set(cacheKey, streamUrl)
    }

    return streamUrl
  } catch (error) {
    console.warn('Unable to fetch animated artwork URL:', error)
    return null
  }
}

/**
 * One lookup per service, artist and album for the session, shared by every
 * screen even when their candidate lists differ (a song with a featured
 * artist adds a name its album page doesn't have). Found URLs also stay in
 * IndexedDB; "not found" only lives here, like it did in the query cache.
 */
const lookups = new Map<string, Promise<string | null>>()

function lookup(artist: string, album: string): Promise<string | null> {
  const key = [
    getArtworkSearchUrl().origin,
    artist.toLowerCase(),
    album.toLowerCase(),
  ].join('\n')
  let pending = lookups.get(key)
  if (!pending) {
    pending = getAnimatedArtworkUrl(artist, album)
    lookups.set(key, pending)
  }
  return pending
}

/** Forgets the session's lookups (Settings → clear caches). */
export function clearAnimatedArtworkLookups() {
  lookups.clear()
}

/**
 * The album's live-cover stream: tries each artist name in order
 * (src/api/artworkArtists.ts) and stops at the first that has one.
 */
export async function findAnimatedArtworkUrl(
  artists: string[],
  album: string,
): Promise<string | null> {
  for (const artist of artists) {
    const url = await lookup(artist, album)
    if (url) return url
  }
  return null
}
