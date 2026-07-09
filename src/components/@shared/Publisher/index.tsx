import { ReactElement } from 'react'
import styles from './index.module.css'
import Link from 'next/link'
import { accountTruncate } from '@utils/wallet'
import { usePontusXIdentity } from '@deltadao/pontusx-registry-hooks'

interface PublisherProps {
  account: string
  minimal?: boolean
  className?: string
}

export default function Publisher({
  account,
  minimal,
  className
}: PublisherProps): ReactElement {
  const { legalName } = usePontusXIdentity(account)
  const name = legalName || accountTruncate(account)

  if (minimal) {
    return <span className={styles.publisher}>{name}</span>
  }

  return (
    <div className={`${styles.publisher} ${className || ''}`}>
      <span className={styles.hoverReveal}>
        <Link
          href={`/profile/${account}`}
          className={styles.truncated}
          title="Show profile page."
        >
          {name}
        </Link>

        <span className={styles.fullValue}>{account}</span>
      </span>
    </div>
  )
}
