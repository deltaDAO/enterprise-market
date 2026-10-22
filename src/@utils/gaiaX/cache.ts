import { GaiaXVerification, GaiaXVerifyRequest } from './types'

const MAX_ENTRIES = 500
// Failed GXDCH calls are retried sooner than successful results expire
const UNREACHABLE_TTL_MS = 30_000

interface Entry {
  expiresAt: number
  result: GaiaXVerification
}

/**
 * In-memory cache for verification results. A result is never served after
 * its max age, concurrent requests for the same input share one verification,
 * and the time of the last successful check is kept for the stale state.
 */
export function createVerificationCache(now: () => number = Date.now) {
  const entries = new Map<string, Entry>()
  const inflight = new Map<string, Promise<GaiaXVerification>>()
  const lastSuccess = new Map<string, string>()

  function remember<T>(map: Map<string, T>, key: string, value: T) {
    map.delete(key)
    map.set(key, value)
    if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value)
  }

  return async function getVerification(
    input: GaiaXVerifyRequest,
    verify: () => Promise<GaiaXVerification>
  ): Promise<GaiaXVerification> {
    const key = JSON.stringify([
      input.participantUrl,
      input.serviceOfferingUrl,
      input.publisherDid,
      input.assetDid
    ])

    const cached = entries.get(key)
    if (cached && cached.expiresAt > now()) return cached.result
    if (inflight.has(key)) return inflight.get(key)

    const promise = verify()
      .then((result) => {
        const reachable = result.compliance.status !== 'unreachable'
        if (result.compliance.status === 'pass') {
          remember(lastSuccess, key, result.checkedAt)
        }
        const enriched: GaiaXVerification = {
          ...result,
          lastSuccessfulCheckAt: lastSuccess.get(key)
        }
        remember(entries, key, {
          expiresAt:
            now() +
            (reachable ? result.maxAgeSeconds * 1000 : UNREACHABLE_TTL_MS),
          result: enriched
        })
        return enriched
      })
      .finally(() => inflight.delete(key))

    inflight.set(key, promise)
    return promise
  }
}
