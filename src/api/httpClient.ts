import omit from 'lodash/omit'
import defaultAlbumArt from '@/assets/default_album_art.png'
import defaultArtistArt from '@/assets/default_artist_art.png'
import { useAppStore } from '@/store/app.store'
import { CoverArt } from '@/types/coverArtType'
import {
  classifyPageError,
  PageErrorKind,
} from '@/service/playback-errors-rules'
import { AuthType } from '@/types/serverConfig'
import { appName } from '@/utils/appName'
import { saltWord } from '@/utils/salt'

export type QueryType = Record<string, string | number | undefined>

export interface FetchOptions extends RequestInit {
  query?: QueryType
}

type AuthParams = { u: string; t: string; s: string } | { u: string; p: string }

export function authQueryParams(
  username: string,
  password: string,
  authType: AuthType | null,
): AuthParams {
  if (authType === AuthType.TOKEN) {
    return {
      u: username ?? '',
      t: password ?? '',
      s: saltWord,
    }
  } else if (authType === AuthType.PASSWORD) {
    return {
      u: username ?? '',
      p: password ?? '',
    }
  }
  throw new Error('Invalid/unspecified auth type')
}

function queryParams() {
  const { username, password, authType, protocolVersion } =
    useAppStore.getState().data

  return {
    ...authQueryParams(username, password, authType),
    v: protocolVersion || '1.16.0',
    c: appName,
    f: 'json',
  }
}

function getUrl(path: string, options?: QueryType) {
  const serverUrl = useAppStore.getState().data.url
  const params = new URLSearchParams(queryParams())

  if (options) {
    Object.keys(options).forEach((key) => {
      const query = options[key]

      if (query !== undefined) {
        params.append(key, query.toString())
      }
    })
  }

  const queries = params.toString()
  const pathWithoutSlash = path.startsWith('/') ? path.substring(1) : path
  let url = `${serverUrl}/rest/${pathWithoutSlash}`
  url += path.includes('?') ? '&' : '?'
  url += queries

  return url
}

async function browserFetch<T>(
  url: string,
  options: RequestInit,
): Promise<{ count: number; data: T } | undefined> {
  try {
    const response = await fetch(url, options)

    if (response.ok) {
      const data = await response.json()
      return {
        count: parseInt(response.headers.get('x-total-count') || '0', 10),
        data: data['subsonic-response'] as T,
      }
    }

    return undefined
  } catch (error) {
    // A request the app cancelled on purpose (e.g. leaving Stats) isn't one.
    if ((error as Error)?.name !== 'AbortError') {
      console.error('Error on browserFetch request', error)
    }
    return undefined
  }
}

export async function httpClient<T>(
  path: string,
  options: FetchOptions,
): Promise<{ count: number; data: T } | undefined> {
  try {
    const url = getUrl(path, options.query)
    const init = omit(options, 'query')

    return await browserFetch<T>(url, init)
  } catch (error) {
    console.error('Error on httpClient request', error)
    return undefined
  }
}

/**
 * A page's main request failed. `kind` decides what the page shows: the 404
 * page, "Couldn't load this page" with Retry, or "The server rejected your
 * login" (see classifyPageError).
 */
export class ServerError extends Error {
  constructor(
    readonly kind: PageErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'ServerError'
  }
}

/**
 * Like httpClient, but throws a ServerError instead of returning undefined,
 * and treats a Subsonic "failed" answer as an error. For the request a page
 * can't show anything without (an album, an artist, a playlist).
 */
export async function httpClientOrThrow<T>(
  path: string,
  options: FetchOptions,
): Promise<T> {
  const url = getUrl(path, options.query)
  let response: Response
  try {
    response = await fetch(url, omit(options, 'query'))
  } catch (error) {
    throw new ServerError('server', `network: ${String(error)}`)
  }
  if (!response.ok) {
    throw new ServerError(
      classifyPageError({ status: response.status }),
      `HTTP ${response.status}`,
    )
  }
  let body: { 'subsonic-response'?: T & SubsonicStatus }
  try {
    body = await response.json()
  } catch {
    throw new ServerError(classifyPageError({ badBody: true }), 'bad JSON')
  }
  const data = body?.['subsonic-response']
  if (!data) {
    throw new ServerError(classifyPageError({ badBody: true }), 'no body')
  }
  if (data.status === 'failed') {
    const code = data.error?.code ?? 0
    throw new ServerError(
      classifyPageError({ subsonicCode: code }),
      `Subsonic error ${code}: ${data.error?.message ?? ''}`,
    )
  }
  return data
}

type SubsonicStatus = {
  status?: string
  error?: { code?: number; message?: string }
}

export function getSimpleCoverArtUrl(
  id?: string,
  type: CoverArt = 'album',
  size = '300',
): string {
  if (!id) {
    // everything except artists uses the same default cover art
    return type === 'artist' ? defaultArtistArt : defaultAlbumArt
  }

  return getUrl('getCoverArt', { id, size })
}

export function getSongStreamUrl(
  id: string,
  maxBitRate?: string,
  format?: string,
  cacheBustToken?: string,
) {
  return getUrl('stream', {
    id,
    maxBitRate,
    format,
    estimateContentLength: 'true',
    ...(cacheBustToken ? { _cb: cacheBustToken } : {}),
  })
}

export function getDownloadUrl(id: string, maxBitRate = '0', format = 'raw') {
  return getUrl('download', {
    id,
    maxBitRate,
    format,
  })
}
