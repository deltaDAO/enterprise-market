import { ReactElement, useEffect, useRef, useState } from 'react'
import Account from './Account'
import Details from './Details'
import Tooltip from '@shared/atoms/Tooltip'
import styles from './index.module.css'
import { useAccount } from 'wagmi'
import Network from './Network'
import DecryptPrompt from './JsonWallet/DecryptPrompt'
import { useUserPreferences } from '@context/UserPreferences'
import { getAddressFromJsonWallet } from '@utils/wallet/jsonWalletUtils'

export default function Wallet(): ReactElement {
  const { address: accountId } = useAccount()
  const { encryptedWalletJson } = useUserPreferences()
  const [isSsiModalOpen, setIsSsiModalOpen] = useState(false)
  const tooltipRef = useRef<any>(null)

  const storedWalletAddress = encryptedWalletJson
    ? getAddressFromJsonWallet(encryptedWalletJson)
    : null
  const showDecryptPrompt = !accountId && !!storedWalletAddress

  useEffect(() => {
    if (isSsiModalOpen) {
      tooltipRef.current?.hide?.()
    }
  }, [isSsiModalOpen])

  return (
    <div className={styles.wallet}>
      {accountId && <Network />}
      {showDecryptPrompt ? (
        <DecryptPrompt walletAddress={storedWalletAddress} />
      ) : !accountId ? (
        <Account onSsiModalOpenChange={setIsSsiModalOpen} />
      ) : (
        <Tooltip
          content={<Details />}
          trigger="click focus mouseenter"
          disabled={isSsiModalOpen}
          onCreate={(instance) => {
            tooltipRef.current = instance
          }}
        >
          <Account onSsiModalOpenChange={setIsSsiModalOpen} />
        </Tooltip>
      )}
    </div>
  )
}
