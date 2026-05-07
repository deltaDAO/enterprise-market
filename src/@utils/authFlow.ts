export type PendingAuthMode = 'login' | 'signup'

const pendingCallbackUrlStorageKey = 'auth_callback_url'
const pendingAuthModeStorageKey = 'auth_mode'

export function getPendingCallbackUrl(): string | null {
  if (typeof window === 'undefined') return null

  return sessionStorage.getItem(pendingCallbackUrlStorageKey)
}

export function setPendingCallbackUrl(url: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(pendingCallbackUrlStorageKey, url)
}

export function clearPendingCallbackUrl(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(pendingCallbackUrlStorageKey)
}

export function getPendingAuthMode(): PendingAuthMode | null {
  if (typeof window === 'undefined') return null

  const mode = sessionStorage.getItem(pendingAuthModeStorageKey)
  return mode === 'login' || mode === 'signup' ? mode : null
}

export function setPendingAuthMode(mode: PendingAuthMode): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(pendingAuthModeStorageKey, mode)
}

export function clearPendingAuthMode(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(pendingAuthModeStorageKey)
}
