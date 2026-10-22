import { digestSri } from './digest'
import { FetchJson, urlToDidWeb } from './didWeb'
import { asArray, getNodeId, isObject, numericDateToIso, parseVc } from './jwt'
import { verifyJwtSignature } from './signature'
import {
  CheckResult,
  CompliantCredential,
  ComplianceReport,
  JsonObject,
  ParsedVc
} from './types'

export interface ComplianceConfig {
  // Base URL of the GXDCH compliance service, e.g. https://www.delta-dao.com/compliance/v2
  baseUrl?: string
  // Label offer, e.g. standard-compliance, label-level-1
  label: string
  minRulesVersion?: string
}

export type PostVp = (
  url: string,
  body: string
) => Promise<{ status: number; body: string }>

export const LABEL_LEVELS: Record<string, string> = {
  SC: 'Standard Compliance',
  L1: 'Label Level 1',
  L2: 'Label Level 2',
  L3: 'Label Level 3'
}

export function getComplianceEndpoint(config: ComplianceConfig): string {
  return `${config.baseUrl.replace(/\/+$/, '')}/api/credential-offers/${
    config.label
  }`
}

function compareVersions(left: string, right: string): number {
  const parse = (version: string) => (version.match(/\d+/g) ?? []).map(Number)
  const [a, b] = [parse(left), parse(right)]
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function getErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.message ?? parsed?.error
    if (Array.isArray(message)) return message.join(' ')
    if (typeof message === 'string') return message
  } catch {
    // not JSON
  }
  return body.slice(0, 500)
}

export async function matchDigests(
  entries: unknown[],
  submitted: ParsedVc[]
): Promise<CompliantCredential[]> {
  const digests = new Map<string, string>()
  await Promise.all(
    submitted.map(async (vc) => {
      if (vc.id) digests.set(vc.id, await digestSri(vc.payload))
    })
  )

  return entries.filter(isObject).map((entry) => {
    const id = getNodeId(entry) ?? ''
    const digest =
      typeof entry.digestSRI === 'string' ? entry.digestSRI : undefined
    return {
      id,
      type:
        typeof entry['gx:credentialType'] === 'string'
          ? entry['gx:credentialType']
          : undefined,
      digestSRI: digest,
      matched: Boolean(digest) && digests.get(id) === digest
    }
  })
}

/**
 * Submits a VP to the configured GXDCH and verifies the returned compliance
 * credential (gx:LabelCredential). A compliance VC supplied by the publisher
 * is never used; only this live result counts.
 */
export async function requestCompliance(
  vpJwt: string,
  submitted: ParsedVc[],
  config: ComplianceConfig,
  deps: { postVp: PostVp; fetchJson: FetchJson; randomId: () => string }
): Promise<ComplianceReport> {
  if (!config.baseUrl) {
    return {
      status: 'skipped',
      message: 'No Gaia-X Digital Clearing House configured for this portal.',
      checks: []
    }
  }

  const endpoint = getComplianceEndpoint(config)
  const expectedIssuer = urlToDidWeb(config.baseUrl)
  const vcid = `urn:uuid:${deps.randomId()}`

  let response: { status: number; body: string }
  try {
    response = await deps.postVp(
      `${endpoint}?vcid=${encodeURIComponent(vcid)}`,
      vpJwt
    )
  } catch (error) {
    return {
      status: 'unreachable',
      message: `Gaia-X Digital Clearing House unreachable: ${
        (error as Error).message
      }`,
      endpoint,
      expectedIssuer,
      checks: []
    }
  }

  if (response.status === 400 || response.status === 409) {
    return {
      status: 'fail',
      message: `Not compliant: ${getErrorMessage(response.body)}`,
      endpoint,
      expectedIssuer,
      checks: []
    }
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      status: 'unreachable',
      message: `Gaia-X Digital Clearing House returned HTTP ${response.status}.`,
      endpoint,
      expectedIssuer,
      checks: []
    }
  }

  let vc: ParsedVc
  try {
    vc = parseVc(response.body)
  } catch {
    return {
      status: 'unreachable',
      message: 'Gaia-X Digital Clearing House returned an unreadable response.',
      endpoint,
      expectedIssuer,
      checks: []
    }
  }

  const subject = vc.subject as JsonObject
  const compliantCredentials = await matchDigests(
    asArray(subject['gx:compliantCredentials']),
    submitted
  )
  const rulesVersion =
    typeof subject['gx:rulesVersion'] === 'string'
      ? subject['gx:rulesVersion']
      : undefined

  const checks: CheckResult[] = [
    vc.issuer === expectedIssuer
      ? {
          id: 'compliance-issuer',
          status: 'pass',
          message: `Issued by the configured clearing house ${expectedIssuer}.`
        }
      : {
          id: 'compliance-issuer',
          status: 'fail',
          message: `Issued by ${vc.issuer}, expected ${expectedIssuer}.`
        },
    await verifyJwtSignature(
      'compliance-signature',
      vc.jwt,
      vc.header,
      vc.issuer,
      deps.fetchJson
    ),
    vc.types.includes('gx:LabelCredential')
      ? { id: 'compliance-type', status: 'pass', message: 'gx:LabelCredential' }
      : {
          id: 'compliance-type',
          status: 'fail',
          message: 'Response is not a gx:LabelCredential.'
        },
    compliantCredentials.length > 0 &&
    compliantCredentials.every((entry) => entry.matched)
      ? {
          id: 'compliance-digests',
          status: 'pass',
          message: `All ${compliantCredentials.length} credential digests match.`
        }
      : {
          id: 'compliance-digests',
          status: 'fail',
          message: `${
            compliantCredentials.filter((entry) => !entry.matched).length
          } of ${compliantCredentials.length} credential digests do not match.`
        }
  ]

  if (config.minRulesVersion) {
    const sufficient =
      rulesVersion && compareVersions(rulesVersion, config.minRulesVersion) >= 0
    checks.push({
      id: 'compliance-rules-version',
      status: sufficient ? 'pass' : 'fail',
      message: sufficient
        ? `Rules ${rulesVersion} ≥ ${config.minRulesVersion}.`
        : `Rules ${rulesVersion ?? 'unknown'} older than required ${
            config.minRulesVersion
          }.`
    })
  }

  const passed = checks.every((check) => check.status === 'pass')

  return {
    status: passed ? 'pass' : 'fail',
    message: passed
      ? 'Compliant with the Gaia-X Trust Framework.'
      : 'Compliance credential could not be verified.',
    endpoint,
    issuer: vc.issuer,
    expectedIssuer,
    labelLevel:
      typeof subject['gx:labelLevel'] === 'string'
        ? subject['gx:labelLevel']
        : undefined,
    engineVersion:
      typeof subject['gx:engineVersion'] === 'string'
        ? subject['gx:engineVersion']
        : undefined,
    rulesVersion,
    issuedAt: vc.validFrom ?? numericDateToIso(vc.header.iat),
    validUntil: vc.validUntil,
    validatedCriteria: asArray(subject['gx:validatedCriteria']).filter(
      (entry): entry is string => typeof entry === 'string'
    ),
    compliantCredentials,
    checks,
    jwt: vc.jwt,
    payload: vc.payload
  }
}
