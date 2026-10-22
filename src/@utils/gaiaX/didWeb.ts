import { importJWK, JWK, KeyLike } from 'jose'
import { asArray, isObject } from './jwt'

export type FetchJson = (url: string) => Promise<unknown>

/**
 * did:web:example.com            → https://example.com/.well-known/did.json
 * did:web:example.com:user:alice → https://example.com/user/alice/did.json
 * did:web:example.com%3A8443     → https://example.com:8443/.well-known/did.json
 */
export function didWebToUrl(did: string): string {
  if (!did.startsWith('did:web:')) {
    throw new Error(`Unsupported DID method: ${did}`)
  }
  const [host, ...path] = did.slice('did:web:'.length).split(':')
  if (!host) throw new Error(`Invalid did:web: ${did}`)

  const origin = `https://${decodeURIComponent(host)}`
  return path.length
    ? `${origin}/${path.map(decodeURIComponent).join('/')}/did.json`
    : `${origin}/.well-known/did.json`
}

// Inverse of didWebToUrl for a service base URL, used to derive the DID a
// Gaia-X Digital Clearing House signs its compliance credentials with
export function urlToDidWeb(url: string): string {
  const { host, pathname } = new URL(url)
  const path = pathname.split('/').filter(Boolean)
  return ['did:web', encodeURIComponent(host), ...path].join(':')
}

export function getDidFromKid(kid: string): string {
  return kid.split('#')[0]
}

export async function resolveVerificationKey(
  kid: string,
  alg: string,
  fetchJson: FetchJson
): Promise<KeyLike | Uint8Array> {
  const did = getDidFromKid(kid)
  const document = await fetchJson(didWebToUrl(did))
  if (!isObject(document) || document.id !== did) {
    throw new Error(`DID document for ${did} is invalid.`)
  }

  const fragment = kid.slice(did.length)
  const method = asArray(document.verificationMethod).find(
    (entry) => isObject(entry) && (entry.id === kid || entry.id === fragment)
  )
  if (!isObject(method) || !isObject(method.publicKeyJwk)) {
    throw new Error(`Key ${kid} not found in DID document.`)
  }

  // The key's own `alg` may differ from the signing alg (e.g. RS256 vs PS256
  // for the same RSA key), the JWS header is authoritative here
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { alg: _alg, ...jwk } = method.publicKeyJwk as unknown as JWK
  return importJWK(jwk, alg)
}
