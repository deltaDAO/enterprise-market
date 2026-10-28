import { ReactElement } from 'react'
import Accordion from '@shared/Accordion'
import { getTypeLabel } from '@utils/gaiaX/labels'
import { Trust } from '@utils/gaiaX/trust'
import { CredentialReport } from '@utils/gaiaX/types'
import { safeExternalWebUrl } from '@utils/url'
import CredentialFields from './CredentialFields'
import RawCredential from './RawCredential'
import TrustIcon from './TrustIcon'
import styles from './index.module.css'

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString() : '—'
}

export default function CredentialCard({
  title,
  report,
  trust
}: {
  title: string
  report: CredentialReport
  trust: Trust
}): ReactElement {
  const name = report.subject?.['schema:name']

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <TrustIcon state={trust.state} size={20} />
        <div>
          <h4 className={styles.cardTitle}>
            {typeof name === 'string' ? name : title}
          </h4>
          <span className={styles.cardType}>
            {title} · {report.expectedType}
          </span>
        </div>
      </header>

      <p className={styles[`message_${trust.state}`]}>{trust.message}</p>

      {report.subject && <CredentialFields node={report.subject} />}

      <dl className={styles.meta}>
        <div>
          <dt>Issuer</dt>
          <dd>{report.source?.issuer ?? report.issuer ?? '—'}</dd>
        </div>
        <div>
          <dt>Valid</dt>
          <dd>
            {formatDate(report.source?.validFrom ?? report.validFrom)} –{' '}
            {formatDate(report.source?.validUntil ?? report.validUntil)}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <a
              href={safeExternalWebUrl(report.url)}
              target="_blank"
              rel="noreferrer"
            >
              {report.url}
            </a>
          </dd>
        </div>
      </dl>

      {report.terms?.length > 0 && (
        <ul className={styles.checks}>
          {report.terms.map((terms, index) => (
            <li key={`${terms.type}-${index}`}>
              <TrustIcon status={terms.result.status} />
              <span>
                {getTypeLabel(terms.type)}: {terms.result.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      {report.credentials.length > 0 && (
        <Accordion
          compact
          titleClassName={styles.accordionTitle}
          title={`Credentials in this presentation (${report.credentials.length})`}
        >
          <ul className={styles.checks}>
            {report.credentials.map((credential, index) => {
              const failed = [credential.signature, credential.validity].find(
                (check) => check.status !== 'pass'
              )
              return (
                <li key={`${credential.id}-${index}`}>
                  <TrustIcon status={failed?.status ?? 'pass'} />
                  <span>
                    <strong>{getTypeLabel(credential.types)}</strong> ·{' '}
                    {credential.issuer} ·{' '}
                    {failed?.message ?? credential.signature.message}
                  </span>
                </li>
              )
            })}
          </ul>
        </Accordion>
      )}

      <RawCredential payload={report.payload} jwt={report.jwt} />
    </article>
  )
}
