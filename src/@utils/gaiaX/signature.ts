import { compactVerify } from 'jose'
import { FetchJson, getDidFromKid, resolveVerificationKey } from './didWeb'
import { CheckResult, JwtHeader } from './types'

const ALLOWED_ALGORITHMS = ['RS256', 'PS256', 'ES256', 'ES384', 'EdDSA']

/**
 * Verifies a JWS against the key referenced by its `kid`, resolved via
 * did:web. The DID of the signing key must match the claimed issuer,
 * otherwise anyone could sign a credential "issued" by somebody else.
 */
export async function verifyJwtSignature(
  id: string,
  jwt: string,
  header: JwtHeader,
  claimedIssuer: string | undefined,
  fetchJson: FetchJson
): Promise<CheckResult> {
  const fail = (message: string): CheckResult => ({
    id,
    status: 'fail',
    message,
    blocking: true
  })

  if (!header.kid || !header.alg) return fail('Signature has no key id.')
  if (!ALLOWED_ALGORITHMS.includes(header.alg)) {
    return fail(`Unsupported signature algorithm ${header.alg}.`)
  }

  // Without a claimed issuer, any did:web could sign; there is nothing to
  // bind the signature to
  if (!claimedIssuer) return fail('Credential has no issuer.')

  const signerDid = getDidFromKid(header.kid)
  if (signerDid !== claimedIssuer) {
    return fail(
      `Signed by ${signerDid}, but the credential claims ${claimedIssuer} as issuer.`
    )
  }
  if (!signerDid.startsWith('did:web:')) {
    return fail(`Signer ${signerDid} is not a did:web.`)
  }

  let key: Awaited<ReturnType<typeof resolveVerificationKey>>
  try {
    key = await resolveVerificationKey(header.kid, header.alg, fetchJson)
  } catch (error) {
    return {
      id,
      status: 'fail',
      message: `Could not resolve signing key: ${(error as Error).message}`
    }
  }

  try {
    await compactVerify(jwt, key, { algorithms: ALLOWED_ALGORITHMS })
    return {
      id,
      status: 'pass',
      message: `Valid ${header.alg} signature by ${signerDid}.`
    }
  } catch {
    return fail('Invalid signature.')
  }
}
