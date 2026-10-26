import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GaiaXVerification, GaiaXVerifyRequest } from '@utils/gaiaX/types'

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000
// Re-verify slightly before a result reaches its max age
const REFRESH_MARGIN_MS = 30 * 1000
const CLOCK_INTERVAL_MS = 15 * 1000

export type GaiaXFreshness = 'fresh' | 'stale'

function getMaxAgeMs(result?: GaiaXVerification): number {
  return result?.maxAgeSeconds
    ? result.maxAgeSeconds * 1000
    : DEFAULT_MAX_AGE_MS
}

export function getFreshness(
  result: GaiaXVerification | undefined,
  now: number
): GaiaXFreshness {
  if (!result) return 'stale'
  return now - Date.parse(result.checkedAt) > getMaxAgeMs(result)
    ? 'stale'
    : 'fresh'
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
    staleTime: (query) =>
      getMaxAgeMs(query.state.data as GaiaXVerification) - REFRESH_MARGIN_MS,
    refetchInterval: (query) =>
      getMaxAgeMs(query.state.data as GaiaXVerification) - REFRESH_MARGIN_MS,
    refetchOnWindowFocus: true
  })

  return {
    ...query,
    freshness: getFreshness(query.data, now)
  }
}
