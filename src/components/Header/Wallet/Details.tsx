import { ReactElement } from 'react'
import Button from '@shared/atoms/Button'
// import { useOrbis } from '@context/DirectMessages'
import {
  useDisconnect,
  useAccount,
  useConnect,
  useConnectors,
  useSwitchChain
} from 'wagmi'
import styles from './Details.module.css'
import Avatar from '@components/@shared/atoms/Avatar'
import Bookmark from '@images/bookmark.svg'
import DisconnectWallet from '@images/disconnect.svg'
import SwitchWallet from '@images/switchWallet.svg'
import { MenuLink } from '../Menu'
import AddTokenList from './AddTokenList'
import { useSsiWallet } from '@context/SsiWallet'
import { disconnectFromWallet } from '@utils/wallet/ssiWallet'
import { LoggerInstance } from '@oceanprotocol/lib'
import { JSON_WALLET_CONNECTOR_ID } from '@utils/wallet/jsonWalletConnector'
import { useUserPreferences } from '@context/UserPreferences'
import { toast } from 'react-toastify'
import NetworkName from '@shared/NetworkName'

export default function Details(): ReactElement {
  const {
    connector: activeConnector,
    address: accountId,
    chainId: connectedChainId
  } = useAccount()
  const connectors = useConnectors()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { chains, switchChain } = useSwitchChain()
  const { setEncryptedWalletJson } = useUserPreferences()

  const isJsonWallet = activeConnector?.id === JSON_WALLET_CONNECTOR_ID

  const {
    setSessionToken,
    ssiWalletCache,
    setCachedCredentials,
    clearVerifierSessionCache
  } = useSsiWallet()

  async function disconnectSsiWallet() {
    try {
      ssiWalletCache.clearCredentials()
      setCachedCredentials([])
      clearVerifierSessionCache()
      disconnectFromWallet()
      setSessionToken(undefined)
    } catch (error) {
      LoggerInstance.error(error)
    }
  }

  const handleConnectClick = async () => {
    const connectorToUse = activeConnector || connectors[0]
    if (connectorToUse) {
      connect({ connector: connectorToUse })
    } else {
      LoggerInstance.warn('No connector available to switch to.')
    }
  }

  return (
    <div className={styles.details}>
      <ul>
        <li className={styles.profileLink}>
          <Avatar accountId={accountId} />
          <MenuLink
            link="/profile"
            name="View Profile"
            className={styles.profileButton}
          />
        </li>
        <li className={styles.bookmarksLink}>
          <Bookmark />
          <MenuLink
            link="/bookmarks"
            name="View Bookmarks"
            className={styles.bookmarksButton}
          />
        </li>
        <li className={styles.actions}>
          <div className={styles.walletInfo}>
            <span className={styles.walletLogoWrap}>
              {/* <img className={styles.walletLogo} src={activeConnector?.logo} /> */}
              {activeConnector?.name}
            </span>
            {/* <AddNetwork
              chainId={Number(activeConnector?.id)}
              networkName={activeConnector?.name}
            /> */}
            {activeConnector?.name === 'MetaMask' && <AddTokenList />}
          </div>

          {isJsonWallet && (
            <div className={styles.chainSwitcher}>
              <span className={styles.chainSwitcherLabel}>Switch Network</span>
              <div className={styles.chainList}>
                {chains.map((chain) => (
                  <button
                    key={chain.id}
                    type="button"
                    className={`${styles.chainItem} ${
                      chain.id === connectedChainId
                        ? styles.chainItemActive
                        : ''
                    }`}
                    disabled={chain.id === connectedChainId}
                    onClick={() => switchChain({ chainId: chain.id })}
                  >
                    <NetworkName networkId={chain.id} minimal />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            {!isJsonWallet && (
              <div className={styles.walletActionRow}>
                <SwitchWallet className={styles.walletActionIcon} />
                <Button style="text" size="small" onClick={handleConnectClick}>
                  Switch Wallet
                </Button>
              </div>
            )}

            <div className={styles.walletActionRow}>
              <DisconnectWallet className={styles.walletActionIcon} />
              <Button
                style="text"
                size="small"
                onClick={async () => {
                  disconnect()
                  // eslint-disable-next-line promise/param-names
                  await new Promise((r) => setTimeout(r, 500))
                  await disconnectSsiWallet()
                }}
              >
                Disconnect
              </Button>
            </div>

            {isJsonWallet && (
              <div className={styles.walletActionRow}>
                <DisconnectWallet className={styles.walletActionIcon} />
                <Button
                  style="text"
                  size="small"
                  onClick={() => {
                    disconnect()
                    setEncryptedWalletJson('')
                    toast.info('Wallet removed.')
                  }}
                >
                  Remove Wallet
                </Button>
              </div>
            )}
          </div>
        </li>
      </ul>
    </div>
  )
}
