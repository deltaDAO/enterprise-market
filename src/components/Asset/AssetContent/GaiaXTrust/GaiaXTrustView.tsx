import { ReactElement } from 'react'
import Alert from '@shared/atoms/Alert'
import {
  getCredentialTrust,
  getOverallTrust,
  getUnverifiedReason,
  isBoundToPublisher
} from '@utils/gaiaX/trust'
import { GaiaXVerification } from '@utils/gaiaX/types'
import BindingChecks from './BindingChecks'
import ComplianceCard from './ComplianceCard'
import CredentialCard from './CredentialCard'
import styles from './index.module.css'

const ALERT_STATES = {
  verified: 'success',
  unverified: 'warning',
  failed: 'error'
} as const

/**
 * A providedBy URL that is not a readable credential (a company website, or
 * a dead link) is legacy metadata, not a failed verification. Old assets
 * with such links don't get a red Gaia-X section.
 */
export function isLegacyProvidedBy(result: GaiaXVerification): boolean {
  return (
    !result.serviceOffering &&
    ['NOT_JWT', 'NOT_VP', 'UNREACHABLE'].includes(
      result.participant?.error?.code
    )
  )
}

export default function GaiaXTrustView({
  result,
  stale
}: {
  result: GaiaXVerification
  stale: boolean
}): ReactElement {
  const overall = getOverallTrust(result, stale)

  return (
    <section className={styles.trust} aria-label="Gaia-X Trust Information">
      <h3 className={styles.title}>Gaia-X Trust Information</h3>
      {/* Plain text on purpose: messages contain values from unverified
          credentials, which must not be rendered as markdown links */}
      <Alert state={ALERT_STATES[overall.state]}>
        <p>{overall.message}</p>
      </Alert>

      <div className={styles.cards}>
        {result.participant && (
          <CredentialCard
            title="Participant"
            report={result.participant}
            trust={getCredentialTrust(result, result.participant, stale)}
          />
        )}
        {result.serviceOffering && (
          <CredentialCard
            title="Service offering"
            report={result.serviceOffering}
            trust={getCredentialTrust(result, result.serviceOffering, stale)}
          />
        )}
        <ComplianceCard
          compliance={result.compliance}
          trusted={isBoundToPublisher(result)}
          staleMessage={stale ? getUnverifiedReason(result, true) : undefined}
        />
        {result.participantCompliance && (
          <ComplianceCard
            title="Gaia-X Compliance (participant credential)"
            compliance={result.participantCompliance}
            trusted={isBoundToPublisher(result)}
            staleMessage={stale ? getUnverifiedReason(result, true) : undefined}
          />
        )}
        <BindingChecks checks={result.binding} />
      </div>
    </section>
  )
}
