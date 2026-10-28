import { ReactElement } from 'react'
import Alert from '@shared/atoms/Alert'
import Loader from '@shared/atoms/Loader'
import { useGaiaXVerification } from '@hooks/useGaiaXVerification'
import { getGaiaXVerifyRequest } from '@utils/gaiaX/metadata'
import { Asset } from 'src/@types/Asset'
import GaiaXTrustView, { isLegacyProvidedBy } from './GaiaXTrustView'
import styles from './index.module.css'

export default function GaiaXTrust({ ddo }: { ddo: Asset }): ReactElement {
  const request = getGaiaXVerifyRequest(ddo)
  const { data, error, isLoading, freshness } = useGaiaXVerification(request)

  if (!request) return null
  if (isLoading) {
    return (
      <section className={styles.trust}>
        <h3 className={styles.title}>Gaia-X Trust Information</h3>
        <Loader message="Verifying Gaia-X credentials..." />
      </section>
    )
  }
  if (!data) {
    return (
      <section className={styles.trust}>
        <h3 className={styles.title}>Gaia-X Trust Information</h3>
        <Alert state="warning">
          <p>
            Not verified: {error?.message ?? 'verification service unavailable'}
          </p>
        </Alert>
      </section>
    )
  }
  if (isLegacyProvidedBy(data)) return null

  return <GaiaXTrustView result={data} stale={freshness === 'stale'} />
}
