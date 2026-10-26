import { ReactElement } from 'react'
import Alert from '@shared/atoms/Alert'
import { getCredentialTrust, getOverallTrust } from '@utils/gaiaX/trust'
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

// A providedBy URL that is not a credential (e.g. a company website) is legacy
// metadata, not a failed verification
export function isLegacyProvidedBy(result: GaiaXVerification): boolean {
  return (
    !result.serviceOffering &&
    ['NOT_JWT', 'NOT_VP'].includes(result.participant?.error?.code)
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
      <Alert state={ALERT_STATES[overall.state]} text={overall.message} />

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
          stale={stale}
          blocked={result.blocking}
        />
        <BindingChecks checks={result.binding} />
      </div>
    </section>
  )
}
