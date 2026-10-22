// Server-only: fetches user-supplied URLs (credentials, DID documents, T&C
// documents) from the API route without exposing internal networks.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 2
export const MAX_CREDENTIAL_BYTES = 2 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIPv4(address)
  const normalized = address.toLowerCase()
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    normalized.startsWith('ff')
  )
}

async function assertPublicHttpsUrl(url: string): Promise<URL> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https URLs are supported.')
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true })
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error('URL resolves to a private network address.')
  }
  return parsed
}

async function readLimited(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const length = Number(response.headers.get('content-length'))
  if (length > maxBytes) throw new Error('Response too large.')
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error('Response too large.')
    }
    chunks.push(value)
  }

  const result = new Uint8Array(total)
  let offset = 0
  chunks.forEach((chunk) => {
    result.set(chunk, offset)
    offset += chunk.byteLength
  })
  return result
}

export async function safeFetch(
  url: string,
  {
    method = 'GET',
    body,
    headers,
    maxBytes = MAX_CREDENTIAL_BYTES,
    timeoutMs = TIMEOUT_MS
  }: {
    method?: 'GET' | 'POST'
    body?: string
    headers?: Record<string, string>
    maxBytes?: number
    timeoutMs?: number
  } = {}
): Promise<{ status: number; bytes: Uint8Array }> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await assertPublicHttpsUrl(current)
    const response = await fetch(target, {
      method,
      body,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)
    })

    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, target).toString()
      continue
    }
    return {
      status: response.status,
      bytes: await readLimited(response, maxBytes)
    }
  }
  throw new Error('Too many redirects.')
}

const decoder = new TextDecoder()

export async function fetchText(url: string): Promise<string> {
  const { status, bytes } = await safeFetch(url)
  if (status !== 200) throw new Error(`HTTP ${status}`)
  return decoder.decode(bytes)
}

export async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse(await fetchText(url))
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const { status, bytes } = await safeFetch(url, {
    maxBytes: MAX_DOCUMENT_BYTES
  })
  if (status !== 200) throw new Error(`HTTP ${status}`)
  return bytes
}

export async function postVp(
  url: string,
  vpJwt: string
): Promise<{ status: number; body: string }> {
  const { status, bytes } = await safeFetch(url, {
    method: 'POST',
    body: vpJwt,
    headers: { 'Content-Type': 'application/vp+jwt' },
    // The GXDCH validates the whole credential chain, which can take a while
    timeoutMs: 30_000
  })
  return { status, body: decoder.decode(bytes) }
}
