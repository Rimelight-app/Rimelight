import { httpClient } from '@/api/httpClient'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'

/** Sets a 1–5 rating on a song, album or artist; 0 removes it. */
async function setRating(id: string, rating: number) {
  const response = await httpClient<SubsonicResponse>('/setRating', {
    method: 'GET',
    query: { id, rating: Math.max(0, Math.min(5, Math.round(rating))) },
  })

  return response?.data?.status === 'ok'
}

export const rating = {
  setRating,
}
