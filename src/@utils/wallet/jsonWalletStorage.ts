import { useCallback, useState } from 'react'

const STORAGE_KEY = 'jsonWallet:encryptedJson'
const LEGACY_PREFERENCES_KEY = 'ocean-user-preferences-v4'

/**
 * The imported keystore lives in its own localStorage entry rather than in
 * UserPreferences. It is not a preference: it is state the user created by an
 * explicit action, it must survive declining optional cookies, and at ~2.5-3.5kB
 * once stringified and percent-encoded it would both crowd the ~4kB cookie
 * budget and be transmitted on every request for no benefit — nothing
 * server-side reads it. This keeps it alongside the connector's own
 * `jsonWallet:` session keys.
 */
function readStorage(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(key) || ''
  } catch {
    // Web Storage can be blocked by the browser.
    return ''
  }
}

/**
 * Lift the keystore out of the pre-1.5 `ocean-user-preferences-v4` blob, where
 * it used to be persisted as part of UserPreferences.
 *
 * This runs at module evaluation, not from an effect, and that is deliberate:
 * UserPreferencesProvider deletes the legacy blob from a mount effect, and
 * React runs child effects before parent ones, so any effect-based migration
 * would race it and lose. Module scope is evaluated during hydration, before
 * effects fire.
 */
function migrateFromUserPreferences(): void {
  if (typeof window === 'undefined') return

  const legacy = readStorage(LEGACY_PREFERENCES_KEY)
  if (!legacy) return

  try {
    const parsed = JSON.parse(legacy)
    const stored = parsed?.encryptedWalletJson
    if (typeof stored !== 'string' || !stored) return
    if (readStorage(STORAGE_KEY)) return

    window.localStorage.setItem(STORAGE_KEY, stored)
  } catch {
    // A malformed legacy blob is not recoverable and not worth reporting.
  }
}

migrateFromUserPreferences()

export function readEncryptedWalletJson(): string {
  migrateFromUserPreferences()
  return readStorage(STORAGE_KEY)
}

export function writeEncryptedWalletJson(json: string): void {
  if (typeof window === 'undefined') return
  try {
    if (json) {
      window.localStorage.setItem(STORAGE_KEY, json)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Nothing to do if the browser blocks site data.
  }
}

export function clearEncryptedWalletJson(): void {
  writeEncryptedWalletJson('')
}

/**
 * Drop-in replacement for the `encryptedWalletJson` / `setEncryptedWalletJson`
 * pair that UserPreferences used to provide.
 */
export function useEncryptedWalletJson(): [string, (json: string) => void] {
  const [encryptedWalletJson, setState] = useState<string>(() =>
    readEncryptedWalletJson()
  )

  const setEncryptedWalletJson = useCallback((json: string) => {
    writeEncryptedWalletJson(json)
    setState(json)
  }, [])

  return [encryptedWalletJson, setEncryptedWalletJson]
}
