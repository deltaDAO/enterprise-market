import { ReactElement, useEffect, useState } from 'react'
import { useFormikContext } from 'formik'
import Loader from '@shared/atoms/Loader'
import TrustIcon from '@components/Asset/AssetContent/GaiaXTrust/TrustIcon'
import { useGaiaXVerification } from '@hooks/useGaiaXVerification'
import { LABEL_LEVELS } from '@utils/gaiaX/compliance'
import { isObject } from '@utils/gaiaX/jwt'
import { getCredentialTrust, isBoundToPublisher } from '@utils/gaiaX/trust'
import {
  CheckResult,
  CredentialReport,
  GaiaXVerification,
  GaiaXVerifyRequest
} from '@utils/gaiaX/types'
import styles from './index.module.css'

const DEBOUNCE_MS = 600

const ERROR_TITLES: Record<string, string> = {
  UNREACHABLE: 'Unreachable',
  NOT_JWT: 'Not a VP-JWT',
  NOT_VP: 'Not a VP-JWT',
  WRONG_TYPE: 'Wrong credential type',
  INVALID_URL: 'Invalid URL',
  TOO_LARGE: 'Too large'
}

function useDebounced<T>(value: T): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [value])
  return debounced
}

function toHttpsUrl(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed?.startsWith('https://') ? trimmed : undefined
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleDateString() : '—'
}

function getText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isObject(value) && typeof value['schema:name'] === 'string') {
    return value['schema:name']
  }
  return undefined
}

function Problems({ checks }: { checks: CheckResult[] }): ReactElement {
  const problems = checks.filter(
    (check) => check.status === 'fail' || check.status === 'warn'
  )
  if (problems.length === 0) return null
  return (
    <ul className={styles.problems}>
      {problems.map((check) => (
        <li key={check.id}>
          <TrustIcon status={check.status} size={14} />
          <span>{check.message}</span>
        </li>
      ))}
    </ul>
  )
}

function CredentialPreview({
  title,
  report,
  result,
  stale
}: {
  title: string
  report: CredentialReport
  result: GaiaXVerification
  stale: boolean
}): ReactElement {
  const trust = getCredentialTrust(result, report, stale)
  const subject = report.subject ?? {}
  const name = getText(subject['schema:name'])
  const version = getText(subject['gx:version'])
  const provider = getText(subject['gx:providedBy'])

  return (
    <div className={styles.credential}>
      <div className={styles.heading}>
        <TrustIcon state={trust.state} />
        <strong>{title}</strong>
        {name && <span>· {name}</span>}
        {version && <span>· v{version}</span>}
      </div>

      {report.error ? (
        <p className={styles.error}>
          {ERROR_TITLES[report.error.code]}: {report.error.message}
        </p>
      ) : (
        <dl className={styles.details}>
          {provider && (
            <>
              <dt>Provider</dt>
              <dd>{provider}</dd>
            </>
          )}
          <dt>Issuer</dt>
          <dd>{report.source?.issuer ?? report.issuer ?? '—'}</dd>
          <dt>Valid</dt>
          <dd>
            {formatDate(report.source?.validFrom ?? report.validFrom)} –{' '}
            {formatDate(report.source?.validUntil ?? report.validUntil)}
          </dd>
        </dl>
      )}
      <Problems
        checks={[
          ...report.checks,
          ...(report.terms ?? []).map((terms) => terms.result)
        ]}
      />
    </div>
  )
}

/**
 * Inline preview of the Gaia-X credentials entered in the publish and edit
 * forms. Fetches, decodes and verifies them, and flags the form as blocked
 * (`blockingFieldName`) on a DID mismatch or an invalid signature. An
 * unreachable or failing clearing house only warns.
 */
export default function GaiaXCredentialPreview({
  participantUrl,
  serviceOfferingUrl,
  publisherDid,
  assetDid,
  blockingFieldName,
  action = 'Publishing'
}: {
  participantUrl?: string
  serviceOfferingUrl?: string
  publisherDid?: string
  assetDid?: string
  blockingFieldName: string
  // What a blocking result prevents, e.g. "Publishing" or "Saving"
  action?: 'Publishing' | 'Saving'
}): ReactElement {
  const { setFieldValue } = useFormikContext()
  const debouncedParticipant = useDebounced(toHttpsUrl(participantUrl))
  const debouncedServiceOffering = useDebounced(toHttpsUrl(serviceOfferingUrl))
  const [confirmedKey, setConfirmedKey] = useState<string>()

  const request: GaiaXVerifyRequest | undefined =
    debouncedParticipant || debouncedServiceOffering
      ? {
          participantUrl: debouncedParticipant,
          serviceOfferingUrl: debouncedServiceOffering,
          publisherDid: publisherDid || undefined,
          assetDid: assetDid || undefined
        }
      : undefined
  const requestKey = JSON.stringify(request ?? null)
  const { data, error, isFetching, freshness, refetch } =
    useGaiaXVerification(request)
  const pending =
    toHttpsUrl(participantUrl) !== debouncedParticipant ||
    toHttpsUrl(serviceOfferingUrl) !== debouncedServiceOffering ||
    (Boolean(request) && isFetching && !data)
  // If the check itself fails, the user has to retry or explicitly continue
  // without verification for these exact credentials
  const failedToVerify = Boolean(request) && !pending && !data
  const confirmed = confirmedKey === requestKey
  // Block while a check is pending, so a mismatch can't slip through
  const blocking =
    Boolean(request) &&
    (pending || Boolean(data?.blocking) || (failedToVerify && !confirmed))

  useEffect(() => {
    setFieldValue(blockingFieldName, blocking)
  }, [blocking, blockingFieldName, setFieldValue])

  const participantNotHttps =
    Boolean(participantUrl?.trim()) && !toHttpsUrl(participantUrl)
  const httpHint = participantNotHttps && (
    <Problems
      checks={[
        {
          id: 'participant-https',
          status: 'warn',
          message:
            'Only https credential URLs are verified. This participant link will be shown as a plain link.'
        }
      ]}
    />
  )

  if (!request && !pending) {
    return httpHint ? <div className={styles.preview}>{httpHint}</div> : null
  }

  if (pending) {
    return (
      <div className={styles.preview} aria-live="polite">
        <Loader message="Verifying Gaia-X credentials..." />
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.preview} aria-live="polite">
        <Problems
          checks={[
            {
              id: 'service',
              status: 'warn',
              message: `Credentials could not be verified: ${
                error?.message ?? 'verification service unavailable'
              }`
            }
          ]}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.retry}
            onClick={() => refetch()}
          >
            Retry verification
          </button>
          <label className={styles.confirm}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) =>
                setConfirmedKey(event.target.checked ? requestKey : undefined)
              }
            />
            Continue without Gaia-X verification
          </label>
        </div>
        {!confirmed && (
          <p className={styles.blocking}>
            {action} is blocked until the credentials are verified or you
            confirm to continue without verification.
          </p>
        )}
      </div>
    )
  }

  const stale = freshness === 'stale'
  const blockingCheck = [
    ...(data.participant?.checks ?? []),
    ...(data.serviceOffering?.checks ?? []),
    ...data.binding
  ].find((check) => check.status === 'fail' && check.blocking)
  const { compliance } = data
  // Same rule as the asset page: no green compliance for unbound publishers
  const trusted = isBoundToPublisher(data)

  return (
    <div className={styles.preview} aria-live="polite">
      {httpHint}
      {data.participant && (
        <CredentialPreview
          title="Participant credential"
          report={data.participant}
          result={data}
          stale={stale}
        />
      )}
      {data.serviceOffering && (
        <CredentialPreview
          title="Service offering credential"
          report={data.serviceOffering}
          result={data}
          stale={stale}
        />
      )}

      <div className={styles.credential}>
        <div className={styles.heading}>
          <TrustIcon
            state={
              compliance.status === 'fail'
                ? 'failed'
                : compliance.status === 'pass' && trusted
                ? 'verified'
                : 'unverified'
            }
          />
          <strong>Gaia-X compliance</strong>
          {compliance.status === 'pass' && trusted && (
            <span>
              · {LABEL_LEVELS[compliance.labelLevel] ?? compliance.labelLevel} ·
              rules {compliance.rulesVersion}
            </span>
          )}
        </div>
        {compliance.status !== 'pass' && (
          <p className={styles.warning}>{compliance.message}</p>
        )}
        {compliance.status === 'pass' && !trusted && (
          <p className={styles.warning}>
            Not shown as compliant: the credentials are not bound to the
            publisher DID.
          </p>
        )}
      </div>

      <Problems checks={data.binding} />

      {blockingCheck && (
        <p className={styles.blocking}>
          {action} is blocked: {blockingCheck.message}
        </p>
      )}
    </div>
  )
}
