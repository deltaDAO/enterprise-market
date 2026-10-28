import { ReactElement, ReactNode } from 'react'
import { getNodeId, isObject } from '@utils/gaiaX/jwt'
import {
  getFieldLabel,
  getNodeSummary,
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

// Nested subjects start collapsed with a one-line summary, so deeply linked
// credentials (addresses, registration numbers, the participant repeated in
// a service offering) don't flood the card
function NestedNode({
  node,
  depth
}: {
  node: JsonObject
  depth: number
}): ReactElement {
  const source = node[SOURCE_KEY] as CredentialSource | undefined
  const typeLabel = getTypeLabel((node.type as string) ?? source?.types)
  const summary = getNodeSummary(node)

  return (
    <details className={styles.nested}>
      <summary>
        {typeLabel && <span className={styles.nestedType}>{typeLabel}</span>}
        {typeLabel && summary && ' · '}
        {summary && <span>{summary}</span>}
      </summary>
      {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
      <CredentialFields node={node} depth={depth + 1} nested />
    </details>
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
          {value.map((item, index) => (
            <span key={`${item}-${index}`} className={styles.chip}>
              {item as string}
            </span>
          ))}
        </span>
      )
    }
    return (
      <ul className={styles.list}>
        {value.map((item, index) => (
          <li key={`${getNodeId(item) ?? ''}-${index}`}>
            {renderValue(item, depth)}
          </li>
        ))}
      </ul>
    )
  }
  if (isObject(value)) {
    const keys = Object.keys(value).filter(
      (key) => !HIDDEN_KEYS.includes(key) && key !== SOURCE_KEY
    )
    const id = getNodeId(value)
    const source = value[SOURCE_KEY] as CredentialSource | undefined
    // A subject that is already shown in full elsewhere in this card
    if (source?.repeated) {
      return (
        <span className={styles.repeated}>
          {getTypeLabel(source.types) ?? 'Credential'} (shown above)
        </span>
      )
    }
    // An unresolved reference, e.g. a link to a document or website
    if (keys.length === 0) return id ? <ExternalLink href={id} /> : '—'
    return <NestedNode node={value} depth={depth} />
  }
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return <ExternalLink href={value} />
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return <time dateTime={value}>{formatDate(value)}</time>
  }
  return String(value)
}

/**
 * Renders every attribute of a resolved credentialSubject with readable
 * labels. Referenced subjects are shown as collapsible sections with their
 * own type, issuer and notary evidence.
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
  const keys = sortFields(
    Object.keys(node).filter(
      (key) => !HIDDEN_KEYS.includes(key) && key !== SOURCE_KEY
    )
  )

  return (
    <div className={nested ? styles.nestedFields : styles.fieldsContainer}>
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
