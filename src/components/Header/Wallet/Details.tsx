import { ReactElement, ReactNode, useState } from 'react'
import { useDisconnect, useAccount, useSwitchChain } from 'wagmi'
import styles from './Details.module.css'
import Avatar from '@components/@shared/atoms/Avatar'
import Bookmark from '@images/bookmark.svg'
import DisconnectWallet from '@images/disconnect.svg'
import LogoutIcon from '@images/logout.svg'
import Copy from '@shared/atoms/Copy'
import AddTokenList from './AddTokenList'
import { useSsiWallet } from '@context/SsiWallet'
import { disconnectFromWallet } from '@utils/wallet/ssiWallet'
import { LoggerInstance } from '@oceanprotocol/lib'
import { useAuth } from '@hooks/useAuth'
import { useModal } from 'connectkit'
import { useRouter } from 'next/router'
import { useUserPreferences } from '@context/UserPreferences'
import {
  getLogoutRedirect,
  getVM3LogoutUrl,
  getAuthMeta,
  saveVM3SessionData
} from '@utils/logoutRouter'
import { useAuthStore } from '@hooks/stores/authStore'
import { JSON_WALLET_CONNECTOR_ID } from '@utils/wallet/jsonWalletConnector'
import { toast } from 'react-toastify'
import NetworkName from '@shared/NetworkName'

interface DetailsProps {
  onRequestClose?: () => void
}

function formatWalletAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 8)}...${address.slice(-4)}`
}

interface MenuRowProps {
  icon: ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  className?: string
}

function MenuRow({
  icon,
  label,
  onClick,
  disabled = false,
  className
}: MenuRowProps): ReactElement {
  return (
    <button
      type="button"
      className={`${styles.menuRow} ${disabled ? styles.menuRowDisabled : ''} ${
        className || ''
      }`}
      onClick={() => {
        if (disabled) return
        onClick?.()
      }}
      disabled={disabled}
    >
      <span className={styles.menuRowIcon}>{icon}</span>
      <span className={styles.menuRowLabel}>{label}</span>
    </button>
  )
}

interface ActionButtonProps {
  icon: ReactNode
  title: string
  description?: string
  onClick: () => void
  tone?: 'default' | 'danger'
  isLoading?: boolean
}

function ActionButton({
  icon,
  title,
  description,
  onClick,
  tone = 'default',
  isLoading = false
}: ActionButtonProps): ReactElement {
  const isDanger = tone === 'danger'
  const hasDescription = Boolean(description)

  return (
    <button
      type="button"
      className={`${styles.actionButton} ${
        isDanger ? styles.actionButtonDanger : ''
      } ${!hasDescription ? styles.actionButtonCompact : ''}`}
      onClick={onClick}
      disabled={isLoading}
    >
      <span
        className={`${styles.actionIconBadge} ${
          isDanger ? styles.actionIconBadgeDanger : ''
        }`}
        aria-hidden="true"
      >
        {isLoading ? <span className={styles.spinner} /> : icon}
      </span>
      <span className={styles.actionContent}>
        <span className={styles.actionTitle}>{title}</span>
        {description && (
          <span className={styles.actionDescription}>{description}</span>
        )}
      </span>
    </button>
  )
}

export default function Details({
  onRequestClose
}: DetailsProps): ReactElement {
  const {
    connector: activeConnector,
    address: accountId,
    chainId: connectedChainId
  } = useAccount()
  const { disconnect } = useDisconnect()
  const { logout, isAuthenticated, user, authEnabled } = useAuth()
  const storeLogout = useAuthStore((s) => s.logout)
  const { setOpen } = useModal()
  const router = useRouter()
  const { showOnboardingModule, setEncryptedWalletJson } = useUserPreferences()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { chains, switchChain } = useSwitchChain()

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

  const isWalletConnected = Boolean(accountId)
  const hasMarketplaceSession = authEnabled && isAuthenticated && Boolean(user)
  const walletLabel = activeConnector?.name || 'Web3 wallet disconnected'
  const walletDescription = isWalletConnected
    ? formatWalletAddress(accountId)
    : 'Connect your web3 wallet to restore marketplace actions'
  const showTokenList =
    isWalletConnected && activeConnector?.name === 'MetaMask'
  const showActionDescriptions = showOnboardingModule

  const handleNavigation = async (href: string) => {
    onRequestClose?.()
    await router.push(href)
  }

  const handleConnectWallet = () => {
    onRequestClose?.()
    setOpen(true)
  }

  const handleDisconnectWallet = async () => {
    disconnect()
    // eslint-disable-next-line promise/param-names
    await new Promise((r) => setTimeout(r, 500))
    await disconnectSsiWallet()
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)

    try {
      if (isWalletConnected) {
        await handleDisconnectWallet()
      } else {
        await disconnectSsiWallet()
      }
    } catch (error) {
      console.error('wallet logout error', error)
    }

    const callbackUrl = getLogoutRedirect()
    const meta = getAuthMeta()

    const isVm3 =
      meta?.issuer?.includes('vm3') ||
      meta?.upstream_idp?.toLowerCase?.().includes('vm3')

    if (isVm3) {
      const vm3Url = getVM3LogoutUrl()
      sessionStorage.setItem('logout_flow', 'vm3')
      saveVM3SessionData()

      const timeoutId = setTimeout(() => {
        if (sessionStorage.getItem('logout_flow') === 'vm3') {
          console.warn('VM3 logout timeout, forcing cleanup')
          sessionStorage.setItem('vm3_logout_timeout', 'true')
          window.location.href = callbackUrl
        }
      }, 5000)

      sessionStorage.setItem('vm3_timeout_id', String(timeoutId))
      window.location.href = `${vm3Url}?post_logout_redirect_uri=${encodeURIComponent(
        callbackUrl
      )}`
      return
    }

    sessionStorage.setItem('logout_flow', 'vm2')
    await logout()
    onRequestClose?.()
    setIsLoggingOut(false)
  }

  return (
    <div className={styles.details}>
      <div className={styles.section}>
        <MenuRow
          icon={
            accountId ? (
              <Avatar accountId={accountId} />
            ) : (
              <span className={styles.placeholderAvatar} aria-hidden="true" />
            )
          }
          label="View Profile"
          onClick={() => handleNavigation('/profile')}
          disabled={!isWalletConnected}
        />
        <MenuRow
          icon={<Bookmark />}
          label="View Bookmarks"
          onClick={() => handleNavigation('/bookmarks')}
          disabled={!isWalletConnected}
          className={styles.bookmarksRow}
        />
      </div>

      <div className={styles.section}>
        <div className={styles.walletInfo}>
          <div className={styles.walletHeading}>{walletLabel}</div>
          {isWalletConnected ? (
            <div className={styles.walletAddressRow}>
              <span className={styles.walletDescription} title={accountId}>
                {walletDescription}
              </span>
              <Copy text={accountId} />
            </div>
          ) : (
            <div className={styles.walletDescription}>{walletDescription}</div>
          )}
          {showTokenList && <AddTokenList disabled={!isWalletConnected} />}
        </div>

        {isJsonWallet && isWalletConnected && chains.length > 0 && (
          <div className={styles.chainSwitcher}>
            <span className={styles.chainSwitcherLabel}>Switch Network</span>
            <div className={styles.chainList}>
              {chains.map((chain) => (
                <button
                  key={chain.id}
                  type="button"
                  className={`${styles.chainItem} ${
                    chain.id === connectedChainId ? styles.chainItemActive : ''
                  }`}
                  disabled={chain.id === connectedChainId}
                  onClick={() =>
                    switchChain(
                      { chainId: chain.id },
                      {
                        onSuccess: (data) =>
                          toast.success(`Switched to ${data.name}`),
                        onError: (err) =>
                          toast.error(
                            `Failed to switch network: ${err.message}`
                          )
                      }
                    )
                  }
                >
                  <NetworkName networkId={chain.id} minimal />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <ActionButton
          icon={<DisconnectWallet className={styles.actionGlyph} />}
          title={
            isWalletConnected ? 'Disconnect web3 wallet' : 'Connect web3 wallet'
          }
          description={
            showActionDescriptions
              ? isWalletConnected
                ? 'Stop the active wallet connection for this browser session.'
                : 'Reconnect your wallet to restore web3 actions in the marketplace.'
              : undefined
          }
          onClick={
            isWalletConnected ? handleDisconnectWallet : handleConnectWallet
          }
        />

        {isJsonWallet && isWalletConnected && (
          <ActionButton
            icon={<DisconnectWallet className={styles.actionGlyph} />}
            title="Remove JSON wallet"
            description={
              showActionDescriptions
                ? 'Remove the stored wallet file and disconnect.'
                : undefined
            }
            onClick={() => {
              disconnect()
              setEncryptedWalletJson('')
              toast.info('Wallet removed.')
            }}
            tone="danger"
          />
        )}

        {hasMarketplaceSession && (
          <ActionButton
            icon={<LogoutIcon className={styles.actionGlyph} />}
            title="Sign out of marketplace"
            description={
              showActionDescriptions
                ? isWalletConnected
                  ? 'End your marketplace session and disconnect this linked wallet.'
                  : 'End your marketplace session on this browser.'
                : undefined
            }
            onClick={handleLogout}
            tone="danger"
            isLoading={isLoggingOut}
          />
        )}
      </div>

      {hasMarketplaceSession && user && (
        <div className={styles.userInfo}>
          <div className={styles.userEmail}>{user.email}</div>
          <div className={styles.userProvider}>
            Signed in with {user.authProvider}
          </div>
        </div>
      )}
    </div>
  )
}
