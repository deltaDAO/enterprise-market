import { ReactElement } from 'react'
import SsiWalletControl from '@components/@shared/SsiWalletControl'
import styles from './index.module.css'

interface SsiWalletProps {
  showConnectedToast?: boolean
  walletRequiredMessage?: string
}

export function SsiWallet({
  showConnectedToast = true,
  walletRequiredMessage = 'You need to connect your EVM wallet first'
}: SsiWalletProps): ReactElement {
  return (
    <SsiWalletControl
      styles={styles}
      showConnectedToast={showConnectedToast}
      walletRequiredMessage={walletRequiredMessage}
    />
  )
}
