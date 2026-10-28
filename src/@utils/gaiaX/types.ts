export type JsonObject = { [key: string]: unknown }

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skipped'

export interface CheckResult {
  id: string
  status: CheckStatus
  message: string
  // A failed blocking check prevents publishing and hides all trust badges
  blocking?: boolean
}

export type GaiaXErrorCode =
  | 'UNREACHABLE'
  | 'NOT_JWT'
  | 'NOT_VP'
  | 'WRONG_TYPE'
  | 'INVALID_URL'
  | 'TOO_LARGE'

export class GaiaXError extends Error {
  code: GaiaXErrorCode

  constructor(code: GaiaXErrorCode, message: string) {
    super(message)
    this.name = 'GaiaXError'
    this.code = code
  }
}

export interface JwtHeader extends JsonObject {
  alg?: string
  kid?: string
  iss?: string
  typ?: string
}

export interface ParsedVc {
  jwt: string
  header: JwtHeader
  payload: JsonObject
  id?: string
  types: string[]
  issuer?: string
  subject: JsonObject
  subjectId?: string
  validFrom?: string
  validUntil?: string
}

export interface ParsedVp {
  jwt: string
  header: JwtHeader
  payload: JsonObject
  issuer?: string
  validFrom?: string
  validUntil?: string
  credentials: ParsedVc[]
}

// Metadata of the VC a resolved credentialSubject came from
export interface CredentialSource {
  id?: string
  types: string[]
  issuer?: string
  validFrom?: string
  validUntil?: string
  evidence?: unknown
  // Set on references to a subject that is expanded elsewhere in the result
  repeated?: boolean
}

export const SOURCE_KEY = '$credential'

export interface CredentialEntry {
  id?: string
  types: string[]
  issuer?: string
  validFrom?: string
  validUntil?: string
  signature: CheckResult
  validity: CheckResult
  // digestSRI of the payload, compared with the GXDCH compliance result
  digest: string
  payload: JsonObject
  jwt: string
}

export interface TermsCheck {
  type: string
  url?: string
  expectedHash?: string
  result: CheckResult
}

export interface CredentialReport {
  url: string
  // Gaia-X class this report is about, e.g. gx:LegalPerson
  expectedType: string
  error?: { code: GaiaXErrorCode; message: string }
  issuer?: string
  validFrom?: string
  validUntil?: string
  // Main credentialSubject with all @id references resolved
  subject?: JsonObject
  source?: CredentialSource
  checks: CheckResult[]
  credentials: CredentialEntry[]
  terms?: TermsCheck[]
  jwt?: string
  payload?: JsonObject
}

export interface CompliantCredential {
  id: string
  type?: string
  digestSRI?: string
  matched: boolean
}

export interface ComplianceReport {
  status: 'pass' | 'fail' | 'unreachable' | 'skipped'
  message: string
  // When the GXDCH was asked; the freshness of a result is measured from here
  checkedAt?: string
  endpoint?: string
  issuer?: string
  expectedIssuer?: string
  labelLevel?: string
  engineVersion?: string
  rulesVersion?: string
  issuedAt?: string
  validUntil?: string
  validatedCriteria?: string[]
  compliantCredentials?: CompliantCredential[]
  checks: CheckResult[]
  jwt?: string
  payload?: JsonObject
}

export type VerificationStatus = 'verified' | 'warning' | 'failed'

export interface GaiaXVerification {
  status: VerificationStatus
  blocking: boolean
  checkedAt: string
  // Server clock at response time, to correct client clock skew
  serverTime?: string
  maxAgeSeconds: number
  lastSuccessfulCheckAt?: string
  publisherDid?: string
  participant?: CredentialReport
  serviceOffering?: CredentialReport
  binding: CheckResult[]
  compliance: ComplianceReport
  // Separate GXDCH check of the participant VP, when the service offering
  // result does not cover the participant VCs that are displayed
  participantCompliance?: ComplianceReport
}

export interface GaiaXVerifyRequest {
  participantUrl?: string
  serviceOfferingUrl?: string
  publisherDid?: string
  assetDid?: string
}
