import { ReactElement } from 'react'
import Link from 'next/link'
import Logo from '@shared/atoms/Logo'
import Networks from '../../Header/UserPreferences/Networks'
import Wallet from '../../Header/Wallet'
import styles from './index.module.css'
import { useMarketMetadata } from '@context/MarketMetadata'
import UserPreferences from '../../Header/UserPreferences'
import AuthEntry from '../../Header/AuthEntry'
import { useAuth } from '@hooks/useAuth'
import { SsiWallet } from '../../Header/SsiWallet'

export default function Menu(): ReactElement {
  const { validatedSupportedChains } = useMarketMetadata()
  const { isAuthenticated, authEnabled } = useAuth()
  const canAccessWalletControls = !authEnabled || isAuthenticated

  return (
    <nav className={styles.menu}>
      <Link href="/" className={styles.logo}>
        <Logo />
      </Link>
      <div className={styles.demoText}>Demonstration MarketPlace</div>
      <div className={styles.actions}>
        {validatedSupportedChains.length > 1 && <Networks />}
        <UserPreferences />
        {canAccessWalletControls && <Wallet />}
        <AuthEntry
          authenticatedContent={
            <SsiWallet walletRequiredMessage="You need to connect to your wallet first" />
          }
          loginClassName={styles.loginButton}
          buttonContentClassName={styles.buttonContent}
          buttonTextClassName={styles.buttonText}
        />
      </div>
    </nav>
  )
}
