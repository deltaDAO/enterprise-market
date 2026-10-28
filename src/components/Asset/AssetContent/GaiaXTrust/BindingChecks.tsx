import { ReactElement } from 'react'
import { CheckResult } from '@utils/gaiaX/types'
import TrustIcon from './TrustIcon'
import styles from './index.module.css'

export default function BindingChecks({
  checks
}: {
  checks: CheckResult[]
}): ReactElement {
  if (checks.length === 0) return null

  return (
    <article className={styles.card}>
      <h4 className={styles.cardTitle}>Publisher binding</h4>
      <ul className={styles.checks}>
        {checks.map((check) => (
          <li key={check.id}>
            <TrustIcon status={check.status} />
            <span>{check.message}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}
