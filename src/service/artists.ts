import { httpClient, httpClientOrThrow } from '@/api/httpClient'
import {
  ArtistInfoResponse,
  ArtistResponse,
  ArtistsResponse,
  ISimilarArtist,
} from '@/types/responses/artist'

async function getAll() {
  const response = await httpClient<ArtistsResponse>('/getArtists', {
    method: 'GET',
  })

  if (!response) return []

  const artistsList: ISimilarArtist[] = []

  response.data.artists.index.forEach((item) => {
    artistsList.push(...item.artist)
  })

  return artistsList.sort((a, b) => a.name.localeCompare(b.name))
}

/** For the artist page: throws a ServerError when it can't be loaded. */
async function getOneOrThrow(id: string) {
  const data = await httpClientOrThrow<ArtistResponse>('/getArtist', {
    method: 'GET',
    query: { id },
  })
  return data.artist
}

async function getOne(id: string) {
  const response = await httpClient<ArtistResponse>('/getArtist', {
    method: 'GET',
    query: {
      id,
    },
  })

  return response?.data.artist
}

async function getInfo(id: string) {
  const response = await httpClient<ArtistInfoResponse>('/getArtistInfo', {
    method: 'GET',
    query: {
      id,
    },
  })

  return response?.data.artistInfo
}

export const artists = {
  getOne,
  getOneOrThrow,
  getInfo,
  getAll,
}
