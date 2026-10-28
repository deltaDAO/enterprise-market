import { ReactElement } from 'react'
import { useGaiaXVerification } from '@hooks/useGaiaXVerification'
import { getGaiaXVerifyRequest } from '@utils/gaiaX/metadata'
import { getCredentialTrust } from '@utils/gaiaX/trust'
import { safeExternalWebUrl } from '@utils/url'
import { Asset } from 'src/@types/Asset'
import { isLegacyProvidedBy } from './GaiaXTrustView'
import TrustIcon from './TrustIcon'
import styles from './index.module.css'

/**
 * "Provided By" value: the participant's legal name with a checkmark, but
 * only once the Gaia-X participant credential is verified. In every other
 * state (loading, unverified, DID mismatch) it shows the raw URL with the
 * trust icon, so an unverified name never appears as the provider.
 */
export default function ProvidedBy({ ddo }: { ddo: Asset }): ReactElement {
  const url = ddo.credentialSubject?.metadata?.providedBy
  const { data, freshness } = useGaiaXVerification(getGaiaXVerifyRequest(ddo))
  const report = data?.participant
  const subject = report?.subject
  // gx:legalName is the older ontology's property for the same value
  const name = subject?.['schema:name'] ?? subject?.['gx:legalName']

  const link = (label: string) => (
    <a href={safeExternalWebUrl(url)} target="_blank" rel="noreferrer">
      {label}
    </a>
  )

  // Older assets link a website (or a dead link) here, not a credential:
  // keep the plain link without any trust icon, like before Gaia-X support
  if (!report || isLegacyProvidedBy(data)) return link(url)

  const trust = getCredentialTrust(data, report, freshness === 'stale')
  const label =
    trust.state === 'verified' && typeof name === 'string' ? name : url

  return (
    <span className={styles.providedBy} title={trust.message}>
      {link(label)}
      <TrustIcon state={trust.state} />
    </span>
  )
}
