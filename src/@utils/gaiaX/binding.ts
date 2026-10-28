import { findCredentialByType } from './graph'
import { asArray, getNodeId } from './jwt'
import { CheckResult, ParsedVc, ParsedVp } from './types'

export const LEGAL_PERSON = 'gx:LegalPerson'
export const SERVICE_OFFERING = 'gx:DigitalServiceOffering'

// Registration number VCs are issued by a GXDCH notary, not by the publisher
export const NOTARY_CREDENTIAL_TYPES = [
  'gx:LeiCode',
  'gx:VatID',
  'gx:EORI',
  'gx:EUID',
  'gx:TaxID',
  'gx:LocalRegistrationNumber'
]

export const DID_MISMATCH_MESSAGE =
  'DID mismatch: credential not issued by the publisher.'

interface BindingInput {
  publisherDid?: string
  assetDid?: string
  participant?: ParsedVp
  serviceOffering?: ParsedVp
  // DIDs of the notaries allowed to issue registration number VCs. Empty
  // means not configured: any notary is accepted, with a warning.
  trustedNotaries?: string[]
}

// Registration numbers the participant (LegalPerson) of a VP refers to
function getRegistrationNumberIds(vp: ParsedVp): Set<string> {
  const legalPerson = findCredentialByType(vp.credentials, LEGAL_PERSON)
  return new Set(
    asArray(legalPerson?.subject['gx:registrationNumber'])
      .map(getNodeId)
      .filter(Boolean)
  )
}

/**
 * A notary VC is exempt from the publisher-issuer rule only if it is purely a
 * registration number (no other Gaia-X type), issued by a trusted notary, and
 * referenced from the participant's gx:registrationNumber.
 */
function isTrustedNotaryCredential(
  vc: ParsedVc,
  registrationNumbers: Set<string>,
  trustedNotaries: string[]
): boolean {
  const types = vc.types.filter((type) => type !== 'VerifiableCredential')
  return (
    types.length > 0 &&
    types.every((type) => NOTARY_CREDENTIAL_TYPES.includes(type)) &&
    (trustedNotaries.length === 0 || trustedNotaries.includes(vc.issuer)) &&
    Boolean(vc.subjectId) &&
    registrationNumbers.has(vc.subjectId)
  )
}

function checkIssuers(
  label: string,
  vp: ParsedVp,
  publisherDid: string,
  trustedNotaries: string[]
): CheckResult[] {
  const results: CheckResult[] = []
  const registrationNumbers = getRegistrationNumberIds(vp)
  const foreignVcs = vp.credentials.filter(
    (vc) =>
      vc.issuer !== publisherDid &&
      !isTrustedNotaryCredential(vc, registrationNumbers, trustedNotaries)
  )

  results.push(
    vp.issuer === publisherDid
      ? {
          id: `${label}-vp-issuer`,
          status: 'pass',
          message: `${label} presentation issued by the publisher (${publisherDid}).`
        }
      : {
          id: `${label}-vp-issuer`,
          status: 'fail',
          blocking: true,
          message: `${DID_MISMATCH_MESSAGE} ${label} presentation issuer ${
            vp.issuer ?? 'unknown'
          } ≠ publisher ${publisherDid}.`
        }
  )
  results.push(
    foreignVcs.length === 0
      ? {
          id: `${label}-vc-issuers`,
          status: 'pass',
          message: `All ${label.toLowerCase()} credentials issued by the publisher (notary registration numbers excepted).`
        }
      : {
          id: `${label}-vc-issuers`,
          status: 'fail',
          blocking: true,
          message: `${DID_MISMATCH_MESSAGE} ${foreignVcs
            .map((vc) => `${vc.types.slice(-1)[0]} by ${vc.issuer}`)
            .join(', ')}.`
        }
  )
  return results
}

function getNotaryIssuers(vp?: ParsedVp): string[] {
  return (vp?.credentials ?? [])
    .filter((vc) =>
      vc.types.some((type) => NOTARY_CREDENTIAL_TYPES.includes(type))
    )
    .map((vc) => vc.issuer)
    .filter(Boolean)
}

/**
 * Anti-hijacking checks: credentials linked to an asset must be issued by
 * the asset's publisher, and the service offering must be provided by the
 * linked participant (and ideally reference the asset itself).
 */
export function checkBinding({
  publisherDid,
  assetDid,
  participant,
  serviceOffering,
  trustedNotaries = []
}: BindingInput): CheckResult[] {
  const results: CheckResult[] = []

  if (!publisherDid?.startsWith('did:web:')) {
    results.push({
      id: 'publisher-did',
      status: 'warn',
      message: publisherDid
        ? `Publisher is identified by ${publisherDid}, not by a did:web. Credentials cannot be bound to the publisher.`
        : 'Publisher has no did:web. Credentials cannot be bound to the publisher.'
    })
  } else {
    if (participant) {
      results.push(
        ...checkIssuers(
          'Participant',
          participant,
          publisherDid,
          trustedNotaries
        )
      )
    }
    if (serviceOffering) {
      results.push(
        ...checkIssuers(
          'Service offering',
          serviceOffering,
          publisherDid,
          trustedNotaries
        )
      )
    }
    const notaries = Array.from(
      new Set([
        ...getNotaryIssuers(participant),
        ...getNotaryIssuers(serviceOffering)
      ])
    )
    if (trustedNotaries.length === 0 && notaries.length > 0) {
      results.push({
        id: 'notary-allowlist',
        status: 'warn',
        message: `Registration numbers issued by ${notaries.join(
          ', '
        )}. No notary allowlist is configured for this portal.`
      })
    }
  }

  const dso =
    serviceOffering &&
    findCredentialByType(serviceOffering.credentials, SERVICE_OFFERING)
  if (!dso) return results

  const legalPerson =
    (participant &&
      findCredentialByType(participant.credentials, LEGAL_PERSON)) ??
    findCredentialByType(serviceOffering.credentials, LEGAL_PERSON)
  const providedBy = getNodeId(dso.subject['gx:providedBy'])

  results.push(
    legalPerson && providedBy === legalPerson.subjectId
      ? {
          id: 'provided-by',
          status: 'pass',
          message: 'Service offering is provided by the linked participant.'
        }
      : {
          id: 'provided-by',
          status: 'fail',
          blocking: true,
          message: `Service offering is provided by ${
            providedBy ?? 'nobody'
          }, not by the linked participant ${
            legalPerson?.subjectId ?? ''
          }.`.trim()
        }
  )

  if (assetDid) {
    const scope = asArray(dso.subject['gx:serviceScope'])
    const mentionsAsset = scope.some(
      (entry) =>
        (typeof entry === 'string' && entry.includes(assetDid)) ||
        getNodeId(entry) === assetDid
    )
    results.push({
      id: 'service-scope',
      status: mentionsAsset ? 'pass' : 'warn',
      message: mentionsAsset
        ? 'Service offering scope references this asset.'
        : 'Service offering scope does not reference this asset.'
    })
  }

  return results
}
