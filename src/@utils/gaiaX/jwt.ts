import { decodeJwt, decodeProtectedHeader } from 'jose'
import { GaiaXError, JsonObject, JwtHeader, ParsedVc, ParsedVp } from './types'

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

// JSON-LD allows both `@id` and `id`, the Gaia-X examples use both
export function getNodeId(node: unknown): string | undefined {
  if (!isObject(node)) return undefined
  const id = node['@id'] ?? node.id
  return typeof id === 'string' ? id : undefined
}

export function getTypes(payload: JsonObject): string[] {
  return asArray(payload.type ?? payload['@type']).filter(
    (type): type is string => typeof type === 'string'
  )
}

function getIssuer(payload: JsonObject, header: JwtHeader): string | undefined {
  const { issuer } = payload
  if (typeof issuer === 'string') return issuer
  if (isObject(issuer)) return getNodeId(issuer)
  if (typeof payload.iss === 'string') return payload.iss
  return header.iss
}

/**
 * Converts a JWT NumericDate to an ISO string. Some Gaia-X services (e.g. the
 * notary and compliance services) emit milliseconds instead of seconds.
 */
export function numericDateToIso(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const ms = value > 1e11 ? value : value * 1000
  return new Date(ms).toISOString()
}

function decodeParts(jwt: string): { header: JwtHeader; payload: JsonObject } {
  try {
    const header = decodeProtectedHeader(jwt) as JwtHeader
    const payload = decodeJwt(jwt) as JsonObject
    return { header, payload }
  } catch {
    throw new GaiaXError('NOT_JWT', 'The document is not a valid JWT.')
  }
}

export function parseVc(jwt: string): ParsedVc {
  const { header, payload } = decodeParts(jwt.trim())
  const subject = asArray(payload.credentialSubject).find(isObject) ?? {}

  return {
    jwt: jwt.trim(),
    header,
    payload,
    id: getNodeId(payload),
    types: getTypes(payload),
    issuer: getIssuer(payload, header),
    subject,
    subjectId: getNodeId(subject),
    validFrom:
      typeof payload.validFrom === 'string'
        ? payload.validFrom
        : numericDateToIso(payload.nbf ?? header.iat),
    validUntil:
      typeof payload.validUntil === 'string'
        ? payload.validUntil
        : numericDateToIso(payload.exp ?? header.exp)
  }
}

// Extracts the VC-JWT from an EnvelopedVerifiableCredential data URI
function getEnvelopedJwt(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    return entry.startsWith('data:') ? entry.split(',', 2)[1] : entry
  }
  const id = getNodeId(entry)
  if (id?.startsWith('data:')) return id.slice(id.indexOf(',') + 1)
  return undefined
}

// Real presentations hold ~15 VCs; the cap bounds the work per request
export const MAX_CREDENTIALS_PER_VP = 50

export function parseVp(jwt: string): ParsedVp {
  const { header, payload } = decodeParts(jwt.trim())

  if (!getTypes(payload).includes('VerifiablePresentation')) {
    throw new GaiaXError(
      'NOT_VP',
      'The JWT is not a Verifiable Presentation (VP-JWT).'
    )
  }

  const entries = asArray(payload.verifiableCredential)
  if (entries.length > MAX_CREDENTIALS_PER_VP) {
    throw new GaiaXError(
      'TOO_LARGE',
      `The presentation contains more than ${MAX_CREDENTIALS_PER_VP} credentials.`
    )
  }

  const credentials = entries.map((entry) => {
    const vcJwt = getEnvelopedJwt(entry)
    if (!vcJwt) {
      throw new GaiaXError(
        'NOT_VP',
        'The presentation contains a credential that is not an enveloped VC-JWT.'
      )
    }
    return parseVc(vcJwt)
  })

  return {
    jwt: jwt.trim(),
    header,
    payload,
    issuer: getIssuer(payload, header),
    validFrom:
      typeof payload.validFrom === 'string' ? payload.validFrom : undefined,
    validUntil:
      typeof payload.validUntil === 'string' ? payload.validUntil : undefined,
    credentials
  }
}
