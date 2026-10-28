import { checkBinding, LEGAL_PERSON, SERVICE_OFFERING } from './binding'
import { MemoCache, noCache } from './cache'
import { ComplianceConfig, PostVp, requestCompliance } from './compliance'
import { digestSri, sha256Hex } from './digest'
import { FetchJson } from './didWeb'
import {
  buildGraph,
  findCredentialByType,
  getCredentialSource,
  resolveReferences
} from './graph'
import { asArray, isObject, parseVp } from './jwt'
import { verifyJwtSignature } from './signature'
import { checkTermsHashes } from './termsHash'
import {
  CheckResult,
  ComplianceReport,
  CredentialEntry,
  CredentialReport,
  GaiaXError,
  GaiaXVerification,
  GaiaXVerifyRequest,
  JsonObject,
  ParsedVp,
  VerificationStatus
} from './types'
import { checkValidity } from './validity'

export interface VerifyDeps {
  fetchText: (url: string) => Promise<string>
  fetchJson: FetchJson
  fetchBytes: (url: string) => Promise<Uint8Array>
  postVp: PostVp
  now: () => Date
  randomId: () => string
  compliance: ComplianceConfig
  maxAgeSeconds: number
  trustedNotaries?: string[]
  // Shared across requests on the server; results are keyed by content
  cache?: MemoCache
}

// A VP references the publisher, notaries and the GXDCH; more is suspicious
export const MAX_DIDS_PER_VERIFICATION = 10
// Failed fetches and outages are retried soon, never kept for the max age
export const TRANSIENT_TTL_MS = 30_000
// Results expire this long before the client considers them stale, so a
// client refresh always gets a new check instead of the same old entry
export const REFRESH_MARGIN_MS = 60_000
const LAST_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000

const TYPE_LABELS: Record<string, string> = {
  [LEGAL_PERSON]: 'participant credential (gx:LegalPerson)',
  [SERVICE_OFFERING]: 'service offering credential (gx:DigitalServiceOffering)'
}

const MAX_VERIFICATION_METHODS = 20

// The parts of a DID document needed to resolve signing keys
export function minimizeDidDocument(document: unknown): JsonObject {
  if (!isObject(document)) return {}
  return {
    id: document.id,
    verificationMethod: asArray(document.verificationMethod)
      .filter(isObject)
      .slice(0, MAX_VERIFICATION_METHODS)
      .map((method) => ({
        id: method.id,
        publicKeyJwk: method.publicKeyJwk
      }))
  }
}

/**
 * DID document resolution for one verification: shared across requests via
 * the cache (successes only) and limited to MAX_DIDS_PER_VERIFICATION
 * distinct documents.
 */
function createDidResolver(deps: VerifyDeps, cache: MemoCache): FetchJson {
  const requested = new Map<string, Promise<unknown>>()
  const ttl = deps.maxAgeSeconds * 1000
  return (url) => {
    if (requested.has(url)) return requested.get(url)
    if (requested.size >= MAX_DIDS_PER_VERIFICATION) {
      return Promise.reject(new Error('Too many DID documents to resolve.'))
    }
    // Only the verification keys are kept, never the whole (attacker-chosen)
    // document
    const document = cache.memo(
      `did:${url}`,
      async () => minimizeDidDocument(await deps.fetchJson(url)),
      () => ttl
    )
    requested.set(url, document)
    return document
  }
}

// Groups failures by message, e.g. "gx:LeiCode, gx:VatID: Expired on …"
function summarize(
  id: string,
  credentials: CredentialEntry[],
  pick: (credential: CredentialEntry) => CheckResult,
  passMessage: string
): CheckResult {
  const failed = credentials.filter(
    (credential) => pick(credential).status === 'fail'
  )
  if (failed.length === 0) return { id, status: 'pass', message: passMessage }

  const byMessage = new Map<string, string[]>()
  failed.forEach((credential) => {
    const { message } = pick(credential)
    const type = credential.types[credential.types.length - 1]
    byMessage.set(message, [...(byMessage.get(message) ?? []), type])
  })

  return {
    id,
    status: 'fail',
    blocking: failed.some((credential) => pick(credential).blocking),
    message: Array.from(byMessage)
      .map(([message, types]) => `${types.join(', ')}: ${message}`)
      .join(' ')
  }
}

async function loadCredential(
  url: string,
  expectedType: string,
  deps: VerifyDeps,
  cache: MemoCache,
  fetchJson: FetchJson
): Promise<{ report: CredentialReport; vp?: ParsedVp }> {
  const report: CredentialReport = {
    url,
    expectedType,
    checks: [],
    credentials: []
  }

  // Fetched on every call (not cached): the verification is keyed by the
  // content, so a credential replaced at the same URL is picked up at once
  let vp: ParsedVp
  try {
    vp = parseVp(await deps.fetchText(url))
  } catch (error) {
    report.error =
      error instanceof GaiaXError
        ? { code: error.code, message: error.message }
        : {
            code: 'UNREACHABLE',
            // No connection details: they would reveal internal hosts
            message: 'Could not load the credential.'
          }
    return { report }
  }

  const now = deps.now()
  Object.assign(report, {
    issuer: vp.issuer,
    validFrom: vp.validFrom,
    validUntil: vp.validUntil,
    jwt: vp.jwt,
    payload: vp.payload
  })

  const vpSignature = await verifyJwtSignature(
    'vp-signature',
    vp.jwt,
    vp.header,
    vp.issuer,
    fetchJson
  )
  report.credentials = await Promise.all(
    vp.credentials.map(async (vc) => ({
      id: vc.id,
      types: vc.types,
      issuer: vc.issuer,
      validFrom: vc.validFrom,
      validUntil: vc.validUntil,
      signature: await verifyJwtSignature(
        'signature',
        vc.jwt,
        vc.header,
        vc.issuer,
        fetchJson
      ),
      validity: checkValidity('validity', vc.validFrom, vc.validUntil, now),
      digest: await digestSri(vc.payload),
      payload: vc.payload,
      jwt: vc.jwt
    }))
  )

  report.checks.push(
    vpSignature,
    checkValidity('vp-validity', vp.validFrom, vp.validUntil, now),
    summarize(
      'vc-signatures',
      report.credentials,
      (vc) => vc.signature,
      `All ${report.credentials.length} credential signatures are valid.`
    ),
    summarize(
      'vc-validity',
      report.credentials,
      (vc) => vc.validity,
      `All ${report.credentials.length} credentials are within their validity period.`
    )
  )

  // Only content with a verified signature is resolved, displayed in detail
  // or used to trigger further downloads
  const verified = vp.credentials.filter(
    (_, index) => report.credentials[index].signature.status === 'pass'
  )
  const main = findCredentialByType(verified, expectedType)

  if (!main) {
    const unsigned = findCredentialByType(vp.credentials, expectedType)
    report.error = unsigned
      ? {
          code: 'WRONG_TYPE',
          message: `The ${TYPE_LABELS[expectedType]} has no valid signature.`
        }
      : {
          code: 'WRONG_TYPE',
          message: `The presentation does not contain a ${TYPE_LABELS[expectedType]}.`
        }
    return { report, vp }
  }

  report.subject = resolveReferences(
    main.subject,
    buildGraph(verified)
  ) as JsonObject
  report.source = getCredentialSource(main)

  if (expectedType === SERVICE_OFFERING && vpSignature.status === 'pass') {
    const ttl = deps.maxAgeSeconds * 1000 - REFRESH_MARGIN_MS
    // Only the hash is cached, never the (up to 5 MB) document itself
    report.terms = await checkTermsHashes(
      verified.filter((vc) => vc.issuer === vp.issuer),
      (documentUrl) =>
        cache.memo(
          `terms:${documentUrl}`,
          async () => sha256Hex(await deps.fetchBytes(documentUrl)),
          () => ttl
        )
    )
  }

  return { report, vp }
}

// True if the compliance result lists every credential by id and digest
export function isCovered(
  credentials: CredentialEntry[],
  compliance?: ComplianceReport
): boolean {
  const entries = compliance?.compliantCredentials ?? []
  return (
    credentials.length > 0 &&
    credentials.every((credential) =>
      entries.some(
        (entry) =>
          entry.matched &&
          entry.id === credential.id &&
          entry.digestSRI === credential.digest
      )
    )
  )
}

function getStatus(
  reports: CredentialReport[],
  binding: CheckResult[],
  compliance: ComplianceReport
): { status: VerificationStatus; blocking: boolean } {
  const checks = [
    ...reports.flatMap((report) => [
      ...report.checks,
      ...(report.terms ?? []).map((terms) => terms.result)
    ]),
    ...binding,
    ...compliance.checks
  ]
  const blocking = checks.some(
    (check) => check.status === 'fail' && check.blocking
  )

  if (
    blocking ||
    reports.some((report) => report.error) ||
    checks.some((check) => check.status === 'fail') ||
    compliance.status === 'fail'
  ) {
    return { status: 'failed', blocking }
  }
  if (
    compliance.status !== 'pass' ||
    checks.some((check) => check.status === 'warn')
  ) {
    return { status: 'warning', blocking }
  }
  return { status: 'verified', blocking }
}

/**
 * Loads, decodes and verifies the Gaia-X participant and service offering
 * credentials linked to an asset: local signature and validity checks,
 * binding to the publisher DID, and a live compliance check at the GXDCH.
 *
 * Expensive results are cached by content (the GXDCH result by the hash of
 * the submitted VP), never by the request, so varying publisher or asset DIDs
 * can't bypass the cache. Binding is cheap and computed on every call.
 */
export async function verifyGaiaXCredentials(
  input: GaiaXVerifyRequest,
  deps: VerifyDeps
): Promise<GaiaXVerification> {
  const cache = deps.cache ?? noCache
  const fetchJson = createDidResolver(deps, cache)

  const [participant, serviceOffering] = await Promise.all([
    input.participantUrl
      ? loadCredential(
          input.participantUrl,
          LEGAL_PERSON,
          deps,
          cache,
          fetchJson
        )
      : undefined,
    input.serviceOfferingUrl
      ? loadCredential(
          input.serviceOfferingUrl,
          SERVICE_OFFERING,
          deps,
          cache,
          fetchJson
        )
      : undefined
  ])

  const binding = checkBinding({
    publisherDid: input.publisherDid,
    assetDid: input.assetDid,
    participant: participant?.report.error ? undefined : participant?.vp,
    serviceOffering: serviceOffering?.report.error
      ? undefined
      : serviceOffering?.vp,
    trustedNotaries: deps.trustedNotaries
  })

  // GXDCH check of one presentation, cached by its content
  async function checkCompliance(
    vp: ParsedVp
  ): Promise<{ report: ComplianceReport; lastSuccess?: string }> {
    const vpHash = await sha256Hex(vp.jwt)
    const key = `gxdch:${deps.compliance.baseUrl}:${deps.compliance.label}:${vpHash}`
    const report = await cache.memo(
      key,
      () =>
        requestCompliance(vp.jwt, vp.credentials, deps.compliance, {
          postVp: deps.postVp,
          fetchJson,
          randomId: deps.randomId,
          now: deps.now
        }),
      (result) =>
        result.status === 'unreachable'
          ? TRANSIENT_TTL_MS
          : deps.maxAgeSeconds * 1000 - REFRESH_MARGIN_MS
    )
    if (report.status === 'pass') {
      cache.set(`gxdch-success:${key}`, report.checkedAt, LAST_SUCCESS_TTL_MS)
    }
    return { report, lastSuccess: cache.get<string>(`gxdch-success:${key}`) }
  }

  // One GXDCH call with the service offering VP covers the participant as
  // well, since the DSO presentation contains the full participant set
  const submitted = !serviceOffering?.report.error
    ? serviceOffering?.vp
    : undefined
  const compliantVp =
    submitted ?? (!participant?.report.error ? participant?.vp : undefined)

  let compliance: ComplianceReport = {
    status: 'skipped',
    message: 'No readable credential to submit for compliance.',
    checks: []
  }
  let participantCompliance: ComplianceReport | undefined
  const lastSuccesses: (string | undefined)[] = []

  if (compliantVp) {
    const main = await checkCompliance(compliantVp)
    compliance = main.report
    lastSuccesses.push(main.lastSuccess)

    // If the separately linked participant VP holds other versions of the
    // participant VCs than the DSO VP (e.g. re-issued), the DSO result does
    // not certify what the participant card shows: check that VP on its own
    const participantVp = participant?.report.error
      ? undefined
      : participant?.vp
    if (
      participantVp &&
      compliantVp !== participantVp &&
      !isCovered(participant.report.credentials, compliance)
    ) {
      const own = await checkCompliance(participantVp)
      participantCompliance = own.report
      lastSuccesses.push(own.lastSuccess)
    }
  }

  const reports = [participant?.report, serviceOffering?.report].filter(Boolean)
  const complianceReports = [compliance, participantCompliance].filter(Boolean)
  // Freshness is measured from the oldest GXDCH check, not this request
  const checkedAt = complianceReports
    .map((report) => report.checkedAt)
    .filter(Boolean)
    .sort()[0]
  const lastSuccessfulCheckAt = lastSuccesses.includes(undefined)
    ? undefined
    : lastSuccesses.sort()[0]

  const status = getStatus(reports, binding, compliance)
  const participantStatus = participantCompliance
    ? getStatus([], [], participantCompliance)
    : undefined

  return {
    ...(participantStatus?.status === 'failed' ||
    (participantStatus?.status === 'warning' && status.status === 'verified')
      ? { ...status, status: participantStatus.status }
      : status),
    checkedAt: checkedAt ?? deps.now().toISOString(),
    // Lets clients measure the age of checkedAt despite clock skew
    serverTime: deps.now().toISOString(),
    lastSuccessfulCheckAt,
    participantCompliance,
    maxAgeSeconds: deps.maxAgeSeconds,
    publisherDid: input.publisherDid,
    participant: participant?.report,
    serviceOffering: serviceOffering?.report,
    binding,
    compliance
  }
}
