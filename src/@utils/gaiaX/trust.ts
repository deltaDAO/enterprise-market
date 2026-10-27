import { CredentialReport, GaiaXVerification } from './types'

export type TrustState = 'verified' | 'unverified' | 'failed'

export interface Trust {
  state: TrustState
  message: string
}

function formatTime(iso?: string): string | undefined {
  return iso ? new Date(iso).toLocaleString() : undefined
}

/**
 * True if the credentials are bound to a publisher identified by did:web and
 * nothing blocking failed. Without that, no trust badge may be shown at all,
 * not even for a passing GXDCH result: anyone can link public credentials.
 */
export function isBoundToPublisher(result: GaiaXVerification): boolean {
  return (
    !result.blocking &&
    !result.binding.some(
      (check) => check.id === 'publisher-did' && check.status === 'warn'
    )
  )
}

export function getUnverifiedReason(
  result: GaiaXVerification,
  stale: boolean
): string | undefined {
  const lastSuccess = formatTime(result.lastSuccessfulCheckAt)
  const lastSuccessText = lastSuccess
    ? ` Last successful check at ${lastSuccess}.`
    : ''

  if (stale) {
    return `Not verified: the last check is older than ${Math.round(
      result.maxAgeSeconds / 60
    )} minutes.${lastSuccessText}`
  }
  if (result.compliance.status !== 'pass') {
    return `Not verified: ${result.compliance.message}${lastSuccessText}`
  }
  const publisherWarning = result.binding.find(
    (check) => check.id === 'publisher-did' && check.status === 'warn'
  )
  return publisherWarning
    ? `Not verified: ${publisherWarning.message}`
    : undefined
}

// Every credential shown for this report must be in the compliance result
// with the same id and the same digest: matching by id alone would let a
// publisher show content the GXDCH never saw
function isCoveredByCompliance(
  result: GaiaXVerification,
  report: CredentialReport
): boolean {
  const entries = result.compliance.compliantCredentials ?? []
  return (
    report.credentials.length > 0 &&
    report.credentials.every((credential) =>
      entries.some(
        (entry) =>
          entry.matched &&
          entry.id === credential.id &&
          entry.digestSRI === credential.digest
      )
    )
  )
}

/**
 * Trust badge of a single credential. A green checkmark requires a fresh,
 * passing GXDCH result that covers every displayed credential by id and
 * digest, a publisher bound by did:web, and no blocking failure anywhere
 * (e.g. a DID mismatch hides all badges).
 */
export function getCredentialTrust(
  result: GaiaXVerification,
  report: CredentialReport,
  stale: boolean
): Trust {
  const blockingFailure = [...report.checks, ...result.binding].find(
    (check) => check.status === 'fail' && check.blocking
  )
  if (blockingFailure)
    return { state: 'failed', message: blockingFailure.message }
  // A blocking failure elsewhere (e.g. the other credential) hides all badges
  if (result.blocking) {
    return {
      state: 'failed',
      message: 'Not verified: a blocking check failed for these credentials.'
    }
  }
  if (report.error) return { state: 'failed', message: report.error.message }

  const failure = [
    ...report.checks,
    ...(report.terms ?? []).map((terms) => terms.result)
  ].find((check) => check.status === 'fail')
  if (failure) return { state: 'failed', message: failure.message }
  if (!stale && result.compliance.status === 'fail') {
    return { state: 'failed', message: result.compliance.message }
  }

  const reason = getUnverifiedReason(result, stale)
  if (reason) return { state: 'unverified', message: reason }

  if (!isCoveredByCompliance(result, report)) {
    return {
      state: 'unverified',
      message:
        'Not verified: credential is not covered by the compliance result.'
    }
  }

  return {
    state: 'verified',
    message: `Verified by the Gaia-X Digital Clearing House (${result.compliance.rulesVersion}).`
  }
}

export function getOverallTrust(
  result: GaiaXVerification,
  stale: boolean
): Trust {
  const reports = [result.participant, result.serviceOffering].filter(Boolean)
  const trusts = reports.map((report) =>
    getCredentialTrust(result, report, stale)
  )

  const failed = trusts.find((trust) => trust.state === 'failed')
  if (failed) return failed
  const unverified = trusts.find((trust) => trust.state === 'unverified')
  if (unverified) return unverified

  return {
    state: 'verified',
    message: 'All Gaia-X credentials are verified and bound to the publisher.'
  }
}
