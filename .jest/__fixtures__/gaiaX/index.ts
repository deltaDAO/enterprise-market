import { readFileSync } from 'fs'
import { join } from 'path'
import { exportJWK, generateKeyPair, KeyLike, SignJWT } from 'jose'
import { JsonObject } from '@utils/gaiaX/types'
import { VerifyDeps } from '@utils/gaiaX/verify'

const FIXTURES = __dirname

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

export const PARTICIPANT_URL =
  'https://delta-dao.com/.well-known/40_gx_legalperson_deltaDAO.jwt'
export const SERVICE_OFFERING_URL =
  'https://delta-dao.com/.well-known/40_gx_digitalserviceoffering_noise_levels.jwt'
export const DELTA_DAO_DID = 'did:web:delta-dao.com'
export const DELTA_DAO_COMPLIANCE = 'https://www.delta-dao.com/compliance/v2'
// Before the notary VCs in the fixtures expire (2026-10-22T23:59:59Z)
export const FIXTURE_NOW = new Date('2026-10-22T16:00:00Z')

export const REAL_DOCUMENTS: Record<string, unknown> = {
  'https://delta-dao.com/.well-known/did.json': JSON.parse(
    fixture('did.delta-dao.com.json')
  ),
  'https://www.delta-dao.com/notary/v2/did.json': JSON.parse(
    fixture('did.notary.json')
  ),
  'https://www.delta-dao.com/compliance/v2/did.json': JSON.parse(
    fixture('did.compliance.json')
  )
}

export function createDeps(
  {
    texts = {},
    documents = {},
    compliance = {}
  }: {
    texts?: Record<string, string>
    documents?: Record<string, unknown>
    // VP JWT → compliance response
    compliance?: Record<string, { status: number; body: string }>
  },
  overrides: Partial<VerifyDeps> = {}
): VerifyDeps {
  const allDocuments = { ...REAL_DOCUMENTS, ...documents }
  return {
    fetchText: async (url) => {
      if (!(url in texts)) throw new Error('HTTP 404')
      return texts[url]
    },
    fetchJson: async (url) => {
      if (!(url in allDocuments)) throw new Error('HTTP 404')
      return allDocuments[url]
    },
    fetchBytes: async () => {
      throw new Error('offline')
    },
    postVp: async (_url, body) => {
      const response = compliance[body]
      if (!response) throw new Error('connect ECONNREFUSED')
      return response
    },
    now: () => FIXTURE_NOW,
    randomId: () => 'test-id',
    compliance: { baseUrl: DELTA_DAO_COMPLIANCE, label: 'standard-compliance' },
    maxAgeSeconds: 600,
    ...overrides
  }
}

export interface TestIssuer {
  did: string
  kid: string
  privateKey: KeyLike
  didDocumentUrl: string
  didDocument: JsonObject
}

export async function createIssuer(
  host: string,
  path: string[] = []
): Promise<TestIssuer> {
  const { publicKey, privateKey } = await generateKeyPair('PS256')
  const did = ['did:web', host, ...path].join(':')
  const kid = `${did}#key-1`
  return {
    did,
    kid,
    privateKey,
    didDocumentUrl: path.length
      ? `https://${host}/${path.join('/')}/did.json`
      : `https://${host}/.well-known/did.json`,
    didDocument: {
      id: did,
      verificationMethod: [
        {
          id: kid,
          type: 'JsonWebKey',
          controller: did,
          publicKeyJwk: await exportJWK(publicKey)
        }
      ]
    }
  }
}

export function sign(
  payload: JsonObject,
  issuer: TestIssuer,
  typ = 'vc+jwt'
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'PS256', typ, kid: issuer.kid, iss: issuer.did })
    .sign(issuer.privateKey)
}

export function envelope(jwt: string): JsonObject {
  return {
    '@context': 'https://www.w3.org/ns/credentials/v2',
    id: `data:application/vc+jwt,${jwt}`,
    type: 'EnvelopedVerifiableCredential'
  }
}

export function vc(
  id: string,
  type: string,
  issuer: string,
  subject: JsonObject
): JsonObject {
  return {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential', type],
    id,
    issuer,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-01-01T00:00:00Z',
    credentialSubject: { id: `${id}#cs`, ...subject }
  }
}

export async function vp(
  issuer: TestIssuer,
  credentials: string[]
): Promise<string> {
  return sign(
    {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: 'VerifiablePresentation',
      issuer: issuer.did,
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: '2027-01-01T00:00:00Z',
      verifiableCredential: credentials.map(envelope)
    },
    issuer,
    'vp+jwt'
  )
}

// Re-encodes the payload of a JWT while keeping the original signature
export function tamper(
  jwt: string,
  change: (payload: JsonObject) => void
): string {
  const [header, payload, signature] = jwt.split('.')
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
  change(decoded)
  return [
    header,
    Buffer.from(JSON.stringify(decoded)).toString('base64url'),
    signature
  ].join('.')
}
