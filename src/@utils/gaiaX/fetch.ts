// Server-only: fetches user-supplied URLs (credentials, DID documents, T&C
// documents) from the API route without exposing internal networks.
import { lookup as dnsLookup, LookupAddress } from 'node:dns'
import { request } from 'node:https'
import { BlockList, isIP, LookupFunction } from 'node:net'

const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 2
export const MAX_CREDENTIAL_BYTES = 2 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_DID_DOCUMENT_BYTES = 256 * 1024

// Messages are generic on purpose: connection details of internal hosts
// must not leak to the client
export class FetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FetchError'
  }
}

// Special-purpose ranges (RFC 6890 and successors) that must never be reached
const blockList = new BlockList()
;(
  [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4]
  ] as const
).forEach(([network, prefix]) => blockList.addSubnet(network, prefix, 'ipv4'))
;(
  [
    // ::/96 (incl. :: and ::1) and ::ffff:0:0/96 are handled in
    // isPrivateAddress: as BlockList rules they would also match all IPv4
    ['64:ff9b::', 96], // NAT64
    ['64:ff9b:1::', 48], // local-use NAT64
    ['100::', 64], // discard
    ['2001::', 23], // IETF protocol assignments (Teredo, ORCHID, …)
    ['2001:db8::', 32], // documentation
    ['2002::', 16], // 6to4
    ['fc00::', 7], // unique local
    ['fe80::', 10], // link-local
    ['fec0::', 10], // site-local (deprecated)
    ['ff00::', 8] // multicast
  ] as const
).forEach(([network, prefix]) => blockList.addSubnet(network, prefix, 'ipv6'))

// Expands an IPv6 address to its 8 hextets (handles "::" and dotted tails)
function expandIPv6(address: string): number[] {
  let value = address.toLowerCase().split('%')[0]
  const dotted = value.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const [a, b, c, d] = dotted[1].split('.').map(Number)
    value = value.replace(
      dotted[1],
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
    )
  }
  const [head, tail = ''] = value.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = value.includes('::')
    ? 8 - headParts.length - tailParts.length
    : 0
  return [...headParts, ...Array(missing).fill('0'), ...tailParts].map((part) =>
    parseInt(part || '0', 16)
  )
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return blockList.check(address, 'ipv4')
  if (family !== 6) return true

  const hextets = expandIPv6(address)
  const zeroPrefix = hextets.slice(0, 5).every((part) => part === 0)
  // ::/96: unspecified, loopback and deprecated IPv4-compatible addresses
  if (zeroPrefix && hextets[5] === 0) return true
  // IPv4-mapped addresses in any notation (::ffff:127.0.0.1, ::ffff:7f00:1)
  if (zeroPrefix && hextets[5] === 0xffff) {
    const ipv4 = [
      hextets[6] >> 8,
      hextets[6] & 0xff,
      hextets[7] >> 8,
      hextets[7] & 0xff
    ].join('.')
    return blockList.check(ipv4, 'ipv4')
  }
  return blockList.check(address, 'ipv6')
}

type Resolve = (
  hostname: string,
  callback: (error: Error | null, addresses?: LookupAddress[]) => void
) => void

const resolveAll: Resolve = (hostname, callback) =>
  dnsLookup(hostname, { all: true }, callback)

/**
 * DNS lookup for the TLS socket that rejects private addresses. Because the
 * socket connects to exactly the address checked here, DNS rebinding between
 * a separate check and the connection is not possible.
 */
export function createGuardedLookup(
  resolve: Resolve = resolveAll
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, (error, addresses) => {
      if (error || !addresses?.length) {
        callback(new FetchError('unreachable'), '', 0)
        return
      }
      if (addresses.some(({ address }) => isPrivateAddress(address))) {
        callback(new FetchError('blocked'), '', 0)
        return
      }
      if ((options as { all?: boolean })?.all) {
        ;(callback as unknown as (e: null, a: LookupAddress[]) => void)(
          null,
          addresses
        )
        return
      }
      callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

const guardedLookup = createGuardedLookup()

interface FetchOptions {
  method?: 'GET' | 'POST'
  body?: string
  headers?: Record<string, string>
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
}

function requestOnce(
  url: URL,
  { method, body, headers, maxBytes, timeoutMs }: FetchOptions
): Promise<{ status: number; location?: string; bytes: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(hostname) && isPrivateAddress(hostname)) {
      reject(new FetchError('blocked'))
      return
    }

    const req = request(
      url,
      { method, headers, lookup: guardedLookup, timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0
        const { location } = res.headers
        if (status >= 300 && status < 400 && location) {
          res.resume()
          resolve({ status, location, bytes: new Uint8Array() })
          return
        }
        if (Number(res.headers['content-length']) > maxBytes) {
          res.destroy()
          reject(new FetchError('too large'))
          return
        }
        const chunks: Buffer[] = []
        let total = 0
        res.on('data', (chunk: Buffer) => {
          total += chunk.length
          if (total > maxBytes) {
            res.destroy()
            reject(new FetchError('too large'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () =>
          resolve({ status, bytes: new Uint8Array(Buffer.concat(chunks)) })
        )
        res.on('error', () => reject(new FetchError('unreachable')))
      }
    )
    const deadline = setTimeout(() => {
      req.destroy(new FetchError('timeout'))
    }, timeoutMs)
    req.on('timeout', () => req.destroy(new FetchError('timeout')))
    req.on('error', (error) =>
      reject(
        error instanceof FetchError ? error : new FetchError('unreachable')
      )
    )
    req.on('close', () => clearTimeout(deadline))
    req.end(body)
  })
}

export async function safeFetch(
  url: string,
  {
    method = 'GET',
    body,
    headers,
    maxBytes = MAX_CREDENTIAL_BYTES,
    timeoutMs = TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS
  }: FetchOptions = {}
): Promise<{ status: number; bytes: Uint8Array }> {
  let current = new URL(url)
  for (let hop = 0; ; hop++) {
    if (current.protocol !== 'https:') throw new FetchError('https only')
    const response = await requestOnce(current, {
      method,
      body,
      headers,
      maxBytes,
      timeoutMs
    })
    if (!response.location) return response
    if (hop >= maxRedirects) throw new FetchError('too many redirects')
    current = new URL(response.location, current)
  }
}

const decoder = new TextDecoder()

export async function fetchText(url: string): Promise<string> {
  const { status, bytes } = await safeFetch(url)
  if (status !== 200) throw new FetchError(`HTTP ${status}`)
  return decoder.decode(bytes)
}

// Only used for DID documents, which are a few KB in practice
export async function fetchJson(url: string): Promise<unknown> {
  const { status, bytes } = await safeFetch(url, {
    maxBytes: MAX_DID_DOCUMENT_BYTES
  })
  if (status !== 200) throw new FetchError(`HTTP ${status}`)
  return JSON.parse(decoder.decode(bytes))
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const { status, bytes } = await safeFetch(url, {
    maxBytes: MAX_DOCUMENT_BYTES
  })
  if (status !== 200) throw new FetchError(`HTTP ${status}`)
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
    timeoutMs: 30_000,
    // Never re-send the presentation to another host
    maxRedirects: 0
  })
  return { status, body: decoder.decode(bytes) }
}
