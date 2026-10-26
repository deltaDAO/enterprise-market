import { checkBinding, LEGAL_PERSON, SERVICE_OFFERING } from './binding'
import { ComplianceConfig, PostVp, requestCompliance } from './compliance'
import { FetchJson } from './didWeb'
import {
  buildGraph,
  findCredentialByType,
  getCredentialSource,
  resolveReferences
} from './graph'
import { parseVp } from './jwt'
import { verifyJwtSignature } from './signature'
import { checkTermsHashes, FetchBytes } from './termsHash'
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
  fetchBytes: FetchBytes
  postVp: PostVp
  now: () => Date
  randomId: () => string
  compliance: ComplianceConfig
  maxAgeSeconds: number
}

const TYPE_LABELS: Record<string, string> = {
  [LEGAL_PERSON]: 'participant credential (gx:LegalPerson)',
  [SERVICE_OFFERING]: 'service offering credential (gx:DigitalServiceOffering)'
}

function memoize<T>(fn: (key: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>()
  return (key: string) => {
    if (!cache.has(key)) cache.set(key, fn(key))
    return cache.get(key)
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
  fetchJson: FetchJson
): Promise<{ report: CredentialReport; vp?: ParsedVp }> {
  const report: CredentialReport = {
    url,
    expectedType,
    checks: [],
    credentials: []
  }

  let vp: ParsedVp
  try {
    vp = parseVp(await deps.fetchText(url))
  } catch (error) {
    report.error =
      error instanceof GaiaXError
        ? { code: error.code, message: error.message }
        : {
            code: 'UNREACHABLE',
            message: `Could not load the credential: ${
              (error as Error).message
            }`
          }
    return { report }
  }

  const now = deps.now()
  const main = findCredentialByType(vp.credentials, expectedType)
  Object.assign(report, {
    issuer: vp.issuer,
    validFrom: vp.validFrom,
    validUntil: vp.validUntil,
    jwt: vp.jwt,
    payload: vp.payload
  })

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
      payload: vc.payload,
      jwt: vc.jwt
    }))
  )

  report.checks.push(
    await verifyJwtSignature(
      'vp-signature',
      vp.jwt,
      vp.header,
      vp.issuer,
      fetchJson
    ),
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

  if (!main) {
    report.error = {
      code: 'WRONG_TYPE',
      message: `The presentation does not contain a ${TYPE_LABELS[expectedType]}.`
    }
    return { report, vp }
  }

  report.subject = resolveReferences(
    main.subject,
    buildGraph(vp.credentials)
  ) as JsonObject
  report.source = getCredentialSource(main)

  if (expectedType === SERVICE_OFFERING) {
    report.terms = await checkTermsHashes(vp.credentials, deps.fetchBytes)
  }

  return { report, vp }
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
 */
export async function verifyGaiaXCredentials(
  input: GaiaXVerifyRequest,
  deps: VerifyDeps
): Promise<GaiaXVerification> {
  const fetchJson = memoize(deps.fetchJson)

  const [participant, serviceOffering] = await Promise.all([
    input.participantUrl
      ? loadCredential(input.participantUrl, LEGAL_PERSON, deps, fetchJson)
      : undefined,
    input.serviceOfferingUrl
      ? loadCredential(
          input.serviceOfferingUrl,
          SERVICE_OFFERING,
          deps,
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
      : serviceOffering?.vp
  })

  // One GXDCH call with the service offering VP covers the participant as
  // well, since the DSO presentation contains the full participant set
  const submitted = !serviceOffering?.report.error
    ? serviceOffering?.vp
    : undefined
  const compliantVp =
    submitted ?? (!participant?.report.error ? participant?.vp : undefined)

  const compliance: ComplianceReport = compliantVp
    ? await requestCompliance(
        compliantVp.jwt,
        compliantVp.credentials,
        deps.compliance,
        { postVp: deps.postVp, fetchJson, randomId: deps.randomId }
      )
    : {
        status: 'skipped',
        message: 'No readable credential to submit for compliance.',
        checks: []
      }

  const reports = [participant?.report, serviceOffering?.report].filter(Boolean)

  return {
    ...getStatus(reports, binding, compliance),
    checkedAt: deps.now().toISOString(),
    maxAgeSeconds: deps.maxAgeSeconds,
    publisherDid: input.publisherDid,
    participant: participant?.report,
    serviceOffering: serviceOffering?.report,
    binding,
    compliance
  }
}
