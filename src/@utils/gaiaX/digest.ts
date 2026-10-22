import { isObject } from './jwt'

/**
 * JSON with recursively sorted keys and no whitespace. Non-ASCII characters
 * are kept as-is (not \u-escaped), matching the GXDCH digest computation.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (isObject(value)) {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// digestSRI as listed in gx:compliantCredentials of a GXDCH compliance VC
export async function digestSri(payload: unknown): Promise<string> {
  return `sha256-${await sha256Hex(canonicalJson(payload))}`
}
