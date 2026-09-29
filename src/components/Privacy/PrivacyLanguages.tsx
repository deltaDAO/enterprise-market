import { Fragment, ReactElement } from 'react'
import styles from './PrivacyLanguages.module.css'
import { usePrivacyMetadata } from '@hooks/usePrivacyMetadata'
import Link from 'next/link'

export default function PrivacyLanguages({
  label
}: {
  label?: string
}): ReactElement {
  const { policies } = usePrivacyMetadata()

  return (
    <div className={styles.langSelect}>
      <span className={styles.langLabel}>{label || 'Language'}</span>
      <div className={styles.langOptions}>
        {policies.map((policy, i) => {
          const slug = `/privacy/${policy.policy}`
          return (
            <Fragment key={policy.policy}>
              {i > 0 && ' — '}
              <Link href={slug}>{policy.language}</Link>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
