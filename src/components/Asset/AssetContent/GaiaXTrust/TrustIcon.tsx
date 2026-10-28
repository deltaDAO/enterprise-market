import { ReactElement } from 'react'
import cs from 'classnames'
import CheckIcon from '@images/circle_check.svg'
import CrossIcon from '@images/cross.svg'
import WarningIcon from '@images/warning.svg'
import { CheckStatus } from '@utils/gaiaX/types'
import { TrustState } from '@utils/gaiaX/trust'
import styles from './index.module.css'

const STATUS_TO_STATE: Record<CheckStatus, TrustState> = {
  pass: 'verified',
  fail: 'failed',
  warn: 'unverified',
  skipped: 'unverified'
}

const LABELS: Record<TrustState, string> = {
  verified: 'Verified',
  unverified: 'Not verified',
  failed: 'Failed'
}

export default function TrustIcon({
  state,
  status,
  size = 16
}: {
  state?: TrustState
  status?: CheckStatus
  size?: number
}): ReactElement {
  const resolved = state ?? STATUS_TO_STATE[status]
  const Icon =
    resolved === 'verified'
      ? CheckIcon
      : resolved === 'failed'
      ? CrossIcon
      : WarningIcon

  return (
    <Icon
      width={size}
      height={size}
      role="img"
      aria-label={LABELS[resolved]}
      className={cs(styles.icon, styles[resolved])}
    />
  )
}
