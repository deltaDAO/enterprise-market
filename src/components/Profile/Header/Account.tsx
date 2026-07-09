import { useUserPreferences } from '@context/UserPreferences'
import { usePontusXIdentity } from '@deltadao/pontusx-registry-hooks'
import { useAuth } from '@hooks/useAuth'
import Jellyfish from '@oceanprotocol/art/creatures/jellyfish/jellyfish-grid.svg'
import Avatar from '@shared/atoms/Avatar'
import Copy from '@shared/atoms/Copy'
import ExplorerLink from '@shared/ExplorerLink'
import NetworkName from '@shared/NetworkName'
import { accountTruncate } from '@utils/wallet'
import { ReactElement } from 'react'
import { useAccount } from 'wagmi'
import styles from './Account.module.css'

export default function Account({
  accountId
}: {
  accountId: string
}): ReactElement {
  const { legalName } = usePontusXIdentity(accountId)
  const { chainIds, debug } = useUserPreferences()
  const { user, isAuthenticated, authEnabled } = useAuth()
  const { address: connectedAccountId } = useAccount()

  const isOwnAuthenticatedProfile =
    authEnabled &&
    isAuthenticated &&
    Boolean(user?.id) &&
    Boolean(connectedAccountId) &&
    connectedAccountId.toLowerCase() === accountId.toLowerCase()

  const displayName = isOwnAuthenticatedProfile
    ? user.name
    : legalName || accountTruncate(accountId)
  const displayEmail =
    isOwnAuthenticatedProfile && user?.email ? user.email : undefined
  const normalizedDisplayName = displayName?.trim().toLowerCase()
  const normalizedDisplayEmail = displayEmail?.trim().toLowerCase()
  const normalizedUsername = user?.username?.trim().toLowerCase()
  const displayUsername =
    isOwnAuthenticatedProfile &&
    debug === true &&
    user?.username &&
    normalizedUsername !== normalizedDisplayName &&
    normalizedUsername !== normalizedDisplayEmail
      ? user.username
      : undefined

  return (
    <div className={styles.account}>
      <figure className={styles.imageWrap}>
        {accountId ? (
          <Avatar accountId={accountId} className={styles.image} />
        ) : (
          <Jellyfish className={styles.image} />
        )}
      </figure>
      <div>
        <h3 className={styles.name}>{displayName}</h3>
        {displayUsername && (
          <p className={styles.username}>{displayUsername}</p>
        )}
        {displayEmail && <p className={styles.email}>{displayEmail}</p>}

        {accountId && (
          <code className={styles.accountId}>
            {accountId} <Copy text={accountId} />
          </code>
        )}
        <p>
          {accountId &&
            chainIds.map((value) => (
              <ExplorerLink
                className={styles.explorer}
                networkId={value}
                path={`address/${accountId}`}
                key={value}
              >
                <NetworkName networkId={value} />
              </ExplorerLink>
            ))}
        </p>
      </div>
    </div>
  )
}
