import { ReactElement, ReactNode } from 'react'
import { getNodeId, isObject } from '@utils/gaiaX/jwt'
import {
  getFieldLabel,
  getTypeLabel,
  HIDDEN_KEYS,
  sortFields
} from '@utils/gaiaX/labels'
import { CredentialSource, JsonObject, SOURCE_KEY } from '@utils/gaiaX/types'
import { safeExternalWebUrl } from '@utils/url'
import styles from './index.module.css'

function ExternalLink({ href }: { href: string }): ReactElement {
  return (
    <a href={safeExternalWebUrl(href)} target="_blank" rel="noreferrer">
      {href}
    </a>
  )
}

function getHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function formatDate(value?: string): string | undefined {
  return value ? new Date(value).toLocaleDateString() : undefined
}

function SourceInfo({ source }: { source: CredentialSource }): ReactElement {
  const evidence = isObject(source.evidence) ? source.evidence : undefined
  const evidenceUrl =
    typeof evidence?.['gx:evidenceURL'] === 'string'
      ? evidence['gx:evidenceURL']
      : undefined

  return (
    <div className={styles.source}>
      {source.issuer && <span>Issued by {source.issuer}</span>}
      {source.validUntil && (
        <span>valid until {formatDate(source.validUntil)}</span>
      )}
      {evidenceUrl && (
        <span>
          evidence:{' '}
          <a
            href={safeExternalWebUrl(evidenceUrl)}
            target="_blank"
            rel="noreferrer"
          >
            {getHost(evidenceUrl)}
          </a>
        </span>
      )}
    </div>
  )
}

function renderValue(value: unknown, depth: number): ReactNode {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    if (
      value.every((item) => typeof item === 'string' && !/^https?:/.test(item))
    ) {
      return (
        <span className={styles.chips}>
          {value.map((item) => (
            <span key={item as string} className={styles.chip}>
              {item as string}
            </span>
          ))}
        </span>
      )
    }
    return (
      <ul className={styles.list}>
        {value.map((item, index) => (
          <li key={getNodeId(item) ?? index}>{renderValue(item, depth)}</li>
        ))}
      </ul>
    )
  }
  if (isObject(value)) {
    const keys = Object.keys(value).filter(
      (key) => !HIDDEN_KEYS.includes(key) && key !== SOURCE_KEY
    )
    const id = getNodeId(value)
    // An unresolved reference, e.g. a link to a document or website
    if (keys.length === 0) return id ? <ExternalLink href={id} /> : '—'
    // Fields and values render each other recursively for nested subjects
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return <CredentialFields node={value} depth={depth + 1} nested />
  }
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return <ExternalLink href={value} />
  }
  return String(value)
}

/**
 * Renders every attribute of a resolved credentialSubject with readable
 * labels. Referenced subjects are shown inline with their own type, issuer
 * and notary evidence.
 */
export default function CredentialFields({
  node,
  depth = 0,
  nested = false
}: {
  node: JsonObject
  depth?: number
  nested?: boolean
}): ReactElement {
  const source = node[SOURCE_KEY] as CredentialSource | undefined
  const typeLabel = nested
    ? getTypeLabel((node.type as string) ?? source?.types)
    : undefined
  const keys = sortFields(
    Object.keys(node).filter(
      (key) => !HIDDEN_KEYS.includes(key) && key !== SOURCE_KEY
    )
  )

  return (
    <div className={nested ? styles.nestedFields : undefined}>
      {typeLabel && <div className={styles.nestedType}>{typeLabel}</div>}
      <dl className={styles.fields}>
        {keys.map((key) => (
          <div key={key} className={styles.field}>
            <dt>{getFieldLabel(key)}</dt>
            <dd>{renderValue(node[key], depth)}</dd>
          </div>
        ))}
      </dl>
      {source && <SourceInfo source={source} />}
    </div>
  )
}
