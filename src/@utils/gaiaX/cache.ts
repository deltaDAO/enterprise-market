const DEFAULT_MAX_ENTRIES = 500

export interface MemoCache {
  /**
   * Returns the cached value for `key`, or computes it. Concurrent calls for
   * the same key share one computation. `ttlMs` decides per value how long it
   * is kept; 0 (or a rejected computation) is not cached at all.
   */
  memo<T>(
    key: string,
    compute: () => Promise<T>,
    ttlMs: (value: T) => number
  ): Promise<T>
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, ttlMs: number): void
}

interface Entry {
  expiresAt: number
  value: unknown
}

export function createMemoCache({
  maxEntries = DEFAULT_MAX_ENTRIES,
  now = Date.now
}: { maxEntries?: number; now?: () => number } = {}): MemoCache {
  const entries = new Map<string, Entry>()
  const inflight = new Map<string, Promise<unknown>>()

  function get<T>(key: string): T | undefined {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now()) {
      entries.delete(key)
      return undefined
    }
    return entry.value as T
  }

  function set<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return
    entries.delete(key)
    entries.set(key, { expiresAt: now() + ttlMs, value })
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value)
  }

  async function memo<T>(
    key: string,
    compute: () => Promise<T>,
    ttlMs: (value: T) => number
  ): Promise<T> {
    const cached = get<T>(key)
    if (cached !== undefined) return cached
    if (inflight.has(key)) return inflight.get(key) as Promise<T>

    const promise = compute()
      .then((value) => {
        set(key, value, ttlMs(value))
        return value
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, promise)
    return promise
  }

  return { memo, get, set }
}

// Pass-through cache, e.g. for tests
export const noCache: MemoCache = {
  memo: (_key, compute) => compute(),
  get: () => undefined,
  set: () => undefined
}

/**
 * Fixed-window rate limiter per client key. In-memory, so on serverless
 * platforms the limit applies per instance.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxClients = 10_000
}: {
  limit: number
  windowMs: number
  now?: () => number
  maxClients?: number
}) {
  const windows = new Map<string, { resetAt: number; count: number }>()

  return function hit(client: string): {
    allowed: boolean
    retryAfterSeconds: number
  } {
    const current = now()
    let window = windows.get(client)
    if (!window || window.resetAt <= current) {
      window = { resetAt: current + windowMs, count: 0 }
      windows.delete(client)
      windows.set(client, window)
      if (windows.size > maxClients) windows.delete(windows.keys().next().value)
    }
    window.count += 1
    return {
      allowed: window.count <= limit,
      retryAfterSeconds: Math.ceil((window.resetAt - current) / 1000)
    }
  }
}
