import { CredentialReport, GaiaXVerification } from './types'

export type TrustState = 'verified' | 'unverified' | 'failed'

export interface Trust {
  state: TrustState
  message: string
}

function formatTime(iso?: string): string | undefined {
  return iso ? new Date(iso).toLocaleString() : undefined
}

function getUnverifiedReason(
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

/**
 * Trust badge of a single credential. A green checkmark requires a fresh,
 * passing GXDCH result that lists this credential with a matching digest, and
 * no blocking failure anywhere (e.g. a DID mismatch hides all badges).
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

  const covered = result.compliance.compliantCredentials?.find(
    (entry) => entry.id === report.source?.id
  )
  if (!covered?.matched) {
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
