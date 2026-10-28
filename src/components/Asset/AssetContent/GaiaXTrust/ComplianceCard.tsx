import { ReactElement } from 'react'
import Accordion from '@shared/Accordion'
import Time from '@shared/atoms/Time'
import { LABEL_LEVELS } from '@utils/gaiaX/compliance'
import { getTypeLabel } from '@utils/gaiaX/labels'
import { TrustState } from '@utils/gaiaX/trust'
import { ComplianceReport } from '@utils/gaiaX/types'
import { safeExternalWebUrl } from '@utils/url'
import RawCredential from './RawCredential'
import TrustIcon from './TrustIcon'
import styles from './index.module.css'

function getCriterionLabel(url: string): string {
  return url.split('#').pop() || url
}

export const NOT_BOUND_MESSAGE =
  'Not shown as compliant: the credentials are not bound to the publisher of this asset.'

export default function ComplianceCard({
  compliance,
  trusted,
  staleMessage,
  title = 'Gaia-X Compliance'
}: {
  compliance: ComplianceReport
  title?: string
  // False on a DID mismatch or for publishers without did:web: then no trust
  // badge, label or certification detail is shown, whatever the GXDCH said
  trusted: boolean
  // Set when the result is older than the max age
  staleMessage?: string
}): ReactElement {
  const passed = compliance.status === 'pass'
  const state: TrustState =
    compliance.status === 'fail'
      ? 'failed'
      : passed && trusted && !staleMessage
      ? 'verified'
      : 'unverified'
  const message =
    passed && !trusted ? NOT_BOUND_MESSAGE : staleMessage ?? compliance.message
  // Certification details are trust signals too
  const showDetails = trusted && compliance.status !== 'skipped'

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <TrustIcon state={state} size={20} />
        <div>
          <h4 className={styles.cardTitle}>{title}</h4>
          <span className={styles.cardType}>
            Live check by the Gaia-X Digital Clearing House
          </span>
        </div>
        {state === 'verified' && compliance.labelLevel && (
          <span className={styles.label}>
            {LABEL_LEVELS[compliance.labelLevel] ?? compliance.labelLevel}
          </span>
        )}
      </header>

      <p className={styles[`message_${state}`]}>{message}</p>

      {showDetails ? (
        <dl className={styles.meta}>
          {compliance.rulesVersion && (
            <div>
              <dt>Checked version</dt>
              <dd>
                Rules {compliance.rulesVersion} · Engine{' '}
                {compliance.engineVersion}
              </dd>
            </div>
          )}
          {compliance.issuedAt && (
            <div>
              <dt>Verified</dt>
              <dd>
                <Time date={compliance.issuedAt} relative /> (
                <Time date={compliance.issuedAt} displayFormat="PPpp" />)
              </dd>
            </div>
          )}
          {compliance.validUntil && (
            <div>
              <dt>Compliance credential valid until</dt>
              <dd>
                <Time date={compliance.validUntil} />
              </dd>
            </div>
          )}
          <div>
            <dt>Clearing house</dt>
            <dd>{compliance.issuer ?? compliance.expectedIssuer ?? '—'}</dd>
          </div>
        </dl>
      ) : (
        compliance.expectedIssuer && (
          <dl className={styles.meta}>
            <div>
              <dt>Clearing house</dt>
              <dd>{compliance.expectedIssuer}</dd>
            </div>
          </dl>
        )
      )}

      {showDetails && compliance.validatedCriteria?.length > 0 && (
        <div className={styles.criteria}>
          <h5>Validated criteria</h5>
          <span className={styles.chips}>
            {compliance.validatedCriteria.map((criterion, index) => (
              <a
                key={`${criterion}-${index}`}
                className={styles.chip}
                href={safeExternalWebUrl(criterion)}
                target="_blank"
                rel="noreferrer"
              >
                {getCriterionLabel(criterion)}
              </a>
            ))}
          </span>
        </div>
      )}

      {showDetails && compliance.compliantCredentials?.length > 0 && (
        <Accordion
          compact
          titleClassName={styles.accordionTitle}
          title={`Compliant credentials (${
            compliance.compliantCredentials.filter((entry) => entry.matched)
              .length
          }/${compliance.compliantCredentials.length} digests match)`}
        >
          <ul className={styles.checks}>
            {compliance.compliantCredentials.map((entry, index) => (
              <li key={`${entry.id}-${index}`}>
                <TrustIcon status={entry.matched ? 'pass' : 'fail'} />
                <span>
                  <strong>{getTypeLabel(entry.type) ?? entry.type}</strong> ·{' '}
                  {entry.matched ? 'digest matches' : 'digest mismatch'}
                </span>
              </li>
            ))}
          </ul>
        </Accordion>
      )}

      {compliance.checks.some((check) => check.status !== 'pass') && (
        <ul className={styles.checks}>
          {compliance.checks
            .filter((check) => check.status !== 'pass')
            .map((check) => (
              <li key={check.id}>
                <TrustIcon status={check.status} />
                <span>{check.message}</span>
              </li>
            ))}
        </ul>
      )}

      <RawCredential
        label="Show raw compliance credential"
        payload={compliance.payload}
        jwt={compliance.jwt}
      />
    </article>
  )
}
