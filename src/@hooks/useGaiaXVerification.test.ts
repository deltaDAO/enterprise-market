import { GaiaXVerification } from '@utils/gaiaX/types'
import {
  getFreshness,
  getMsUntilStale,
  getRefetchInterval,
  getServerNow,
  getStaleTime
} from './useGaiaXVerification'

const MINUTE = 60 * 1000
const T0 = Date.parse('2026-10-27T12:00:00Z')

const result = (checkedAt = T0) =>
  ({
    checkedAt: new Date(checkedAt).toISOString(),
    maxAgeSeconds: 600
  } as GaiaXVerification)

describe('useGaiaXVerification schedule', () => {
  it('measures freshness from the GXDCH check, not from the fetch', () => {
    expect(getMsUntilStale(result(), T0 + 8 * MINUTE)).toBe(2 * MINUTE)
    expect(getFreshness(result(), T0 + 10 * MINUTE)).toBe('fresh')
    expect(getFreshness(result(), T0 + 10 * MINUTE + 1)).toBe('stale')
    expect(getFreshness(undefined, T0)).toBe('stale')
  })

  // Review scenario: the server verified at T0, a visitor fetched the cached
  // result at T0+8min. The page must refresh before T0+10min, not at T0+17.5.
  it('refreshes a cached result before it turns stale', () => {
    const fetchedAt = T0 + 8 * MINUTE
    const refetchAt = fetchedAt + getRefetchInterval(result(), fetchedAt)

    expect(refetchAt).toBeLessThan(T0 + 10 * MINUTE)
    expect(refetchAt).toBe(T0 + 9.5 * MINUTE)
  })

  it('treats a result as reusable only until shortly before its max age', () => {
    expect(getStaleTime(result(), T0)).toBe(9.5 * MINUTE)
    expect(getStaleTime(result(), T0 + 9.6 * MINUTE)).toBe(0)
  })

  it('keeps retrying at a bounded pace once a result is stale', () => {
    expect(getRefetchInterval(result(), T0 + 20 * MINUTE)).toBe(30_000)
  })

  it('backs off while the route fails, incl. rate limiting', () => {
    expect(getRefetchInterval(undefined, T0, true)).toBe(60_000)
    expect(getRefetchInterval(result(), T0, true)).toBe(60_000)
  })

  it('measures age on the server clock despite client clock skew', () => {
    // Client clock 2 minutes ahead: received at client T0+2min, server T0
    const skewed = {
      ...result(),
      serverTime: new Date(T0).toISOString()
    } as GaiaXVerification
    const receivedAt = T0 + 2 * MINUTE
    const clientNow = T0 + 11 * MINUTE

    // On the client clock the result would look stale (11 min old)...
    expect(getFreshness(skewed, clientNow)).toBe('stale')
    // ...on the server clock it is 9 minutes old and still fresh
    const serverNow = getServerNow(skewed, receivedAt, clientNow)
    expect(serverNow).toBe(T0 + 9 * MINUTE)
    expect(getFreshness(skewed, serverNow)).toBe('fresh')
  })

  it('falls back to the client clock without serverTime', () => {
    expect(getServerNow(result(), T0, T0 + MINUTE)).toBe(T0 + MINUTE)
  })
})
