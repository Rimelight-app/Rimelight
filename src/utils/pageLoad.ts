import { ServerError } from '@/api/httpClient'

/**
 * react-query retry for a page's main request: one more try after a server
 * or network error, none when the thing doesn't exist or the login is
 * rejected (those won't change by asking again).
 */
export function retryPageLoad(failureCount: number, error: unknown) {
  if (error instanceof ServerError && error.kind !== 'server') return false
  return failureCount < 1
}
