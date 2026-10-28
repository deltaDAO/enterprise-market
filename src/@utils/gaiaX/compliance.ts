import { digestSri } from './digest'
import { FetchJson, urlToDidWeb } from './didWeb'
import { asArray, getNodeId, isObject, numericDateToIso, parseVc } from './jwt'
import { verifyJwtSignature } from './signature'
import { checkValidity } from './validity'
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

export function compareVersions(left: string, right: string): number {
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
  // A VP may contain several VCs with the same id; each has its own digest
  const digests = new Map<string, Set<string>>()
  await Promise.all(
    submitted.map(async (vc) => {
      if (!vc.id) return
      const digest = await digestSri(vc.payload)
      digests.set(vc.id, (digests.get(vc.id) ?? new Set()).add(digest))
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
      matched: Boolean(digest) && Boolean(digests.get(id)?.has(digest))
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
  deps: {
    postVp: PostVp
    fetchJson: FetchJson
    randomId: () => string
    now: () => Date
  }
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
  const checkedAt = deps.now().toISOString()
  const base = { endpoint, expectedIssuer, checkedAt, checks: [] }

  let response: { status: number; body: string }
  try {
    response = await deps.postVp(
      `${endpoint}?vcid=${encodeURIComponent(vcid)}`,
      vpJwt
    )
  } catch (error) {
    return {
      ...base,
      status: 'unreachable',
      message: `Gaia-X Digital Clearing House unreachable: ${
        (error as Error).message
      }`
    }
  }

  if (response.status === 400 || response.status === 409) {
    return {
      ...base,
      status: 'fail',
      message: `Not compliant: ${getErrorMessage(response.body)}`
    }
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      ...base,
      status: 'unreachable',
      message: `Gaia-X Digital Clearing House returned HTTP ${response.status}.`
    }
  }

  let vc: ParsedVc
  try {
    vc = parseVc(response.body)
  } catch {
    return {
      ...base,
      status: 'unreachable',
      message: 'Gaia-X Digital Clearing House returned an unreadable response.'
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
    // The response must answer this request, not a cached or replayed one
    vc.id === vcid
      ? { id: 'compliance-id', status: 'pass', message: `Issued for ${vcid}.` }
      : {
          id: 'compliance-id',
          status: 'fail',
          message: `Issued for ${vc.id ?? 'unknown'}, requested ${vcid}.`
        },
    checkValidity(
      'compliance-validity',
      vc.validFrom,
      vc.validUntil,
      deps.now()
    ),
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
    checkedAt,
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
