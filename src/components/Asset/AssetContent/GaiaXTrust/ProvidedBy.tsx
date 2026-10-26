import { ReactElement } from 'react'
import { useGaiaXVerification } from '@hooks/useGaiaXVerification'
import { getGaiaXVerifyRequest } from '@utils/gaiaX/metadata'
import { getCredentialTrust } from '@utils/gaiaX/trust'
import { safeExternalWebUrl } from '@utils/url'
import { Asset } from 'src/@types/Asset'
import TrustIcon from './TrustIcon'
import styles from './index.module.css'

/**
 * "Provided By" value: the participant's legal name with its trust state once
 * the Gaia-X participant credential is verified, the raw URL otherwise.
 * Shares the verification query with the Gaia-X Trust Information section.
 */
export default function ProvidedBy({ ddo }: { ddo: Asset }): ReactElement {
  const url = ddo.credentialSubject?.metadata?.providedBy
  const { data, freshness } = useGaiaXVerification(getGaiaXVerifyRequest(ddo))
  const report = data?.participant
  const name = report?.subject?.['schema:name']

  const link = (label: string) => (
    <a href={safeExternalWebUrl(url)} target="_blank" rel="noreferrer">
      {label}
    </a>
  )

  if (!report || report.error || typeof name !== 'string') return link(url)

  const trust = getCredentialTrust(data, report, freshness === 'stale')
  return (
    <span className={styles.providedBy} title={trust.message}>
      {link(name)}
      <TrustIcon state={trust.state} />
    </span>
  )
}
