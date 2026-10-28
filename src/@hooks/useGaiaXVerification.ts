import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GaiaXVerification, GaiaXVerifyRequest } from '@utils/gaiaX/types'

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000
// Re-verify this long before a result reaches its max age. The server keeps
// results for max age minus 60 s, so this refresh always gets a new check.
const REFRESH_MARGIN_MS = 30 * 1000
// Lower bound between refetches, e.g. while a result is already stale
const MIN_REFETCH_MS = 30 * 1000
// Back-off while the route fails (incl. 429), so open pages don't poll it
const ERROR_REFETCH_MS = 60 * 1000
const CLOCK_INTERVAL_MS = 15 * 1000

/**
 * The server's clock at client time `now`, derived from the `serverTime` of
 * a result received at client time `receivedAt`. Ages are measured on the
 * server clock, so a client clock running ahead or behind doesn't make
 * fresh results look stale (or the other way round).
 */
export function getServerNow(
  result: GaiaXVerification | undefined,
  receivedAt: number,
  now: number
): number {
  const serverTime = result?.serverTime ? Date.parse(result.serverTime) : NaN
  if (Number.isNaN(serverTime) || !receivedAt) return now
  return now + (serverTime - receivedAt)
}

export type GaiaXFreshness = 'fresh' | 'stale'

function getMaxAgeMs(result?: GaiaXVerification): number {
  return result?.maxAgeSeconds
    ? result.maxAgeSeconds * 1000
    : DEFAULT_MAX_AGE_MS
}

// Time until a result turns stale, measured from the GXDCH check
// (`checkedAt`), not from when this client fetched it
export function getMsUntilStale(
  result: GaiaXVerification | undefined,
  now: number
): number {
  if (!result) return 0
  return Date.parse(result.checkedAt) + getMaxAgeMs(result) - now
}

export function getFreshness(
  result: GaiaXVerification | undefined,
  now: number
): GaiaXFreshness {
  if (!result) return 'stale'
  return getMsUntilStale(result, now) < 0 ? 'stale' : 'fresh'
}

// How long React Query may reuse a result (e.g. on window focus)
export function getStaleTime(
  result: GaiaXVerification | undefined,
  now: number
): number {
  return Math.max(getMsUntilStale(result, now) - REFRESH_MARGIN_MS, 0)
}

// When to re-verify while the page stays open: just before the result
// turns stale, so a visible checkmark never outlives its max age
export function getRefetchInterval(
  result: GaiaXVerification | undefined,
  now: number,
  failed = false
): number {
  if (failed) return ERROR_REFETCH_MS
  return Math.max(
    getMsUntilStale(result, now) - REFRESH_MARGIN_MS,
    MIN_REFETCH_MS
  )
}

async function fetchVerification(
  request: GaiaXVerifyRequest
): Promise<GaiaXVerification> {
  const response = await fetch('/api/gaiax/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  const body = await response.json().catch(() => undefined)
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `HTTP ${response.status}`)
  }
  return body.result
}

// Re-renders periodically so a result turns stale while the page stays open
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])
  return now
}

/**
 * Live verification of the Gaia-X credentials linked to an asset. Results are
 * shared between all components showing the same asset, re-verified before
 * they reach their max age, and reported as stale once they are older.
 */
export function useGaiaXVerification(request?: GaiaXVerifyRequest) {
  const now = useNow()
  const query = useQuery({
    queryKey: [
      'gaiaXVerification',
      request?.participantUrl,
      request?.serviceOfferingUrl,
      request?.publisherDid,
      request?.assetDid
    ],
    queryFn: () => fetchVerification(request),
    enabled: Boolean(request),
    retry: 1,
    staleTime: ({ state }) => {
      const data = state.data as GaiaXVerification
      return getStaleTime(
        data,
        getServerNow(data, state.dataUpdatedAt, Date.now())
      )
    },
    refetchInterval: ({ state }) => {
      const data = state.data as GaiaXVerification
      return getRefetchInterval(
        data,
        getServerNow(data, state.dataUpdatedAt, Date.now()),
        state.status === 'error'
      )
    },
    refetchOnWindowFocus: true
  })

  return {
    ...query,
    freshness: getFreshness(
      query.data,
      getServerNow(query.data, query.dataUpdatedAt, now)
    )
  }
}
