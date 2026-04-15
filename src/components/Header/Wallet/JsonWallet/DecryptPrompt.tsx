import { ReactElement, useCallback, useState } from 'react'
import { useConnect, useConnectors } from 'wagmi'
import { useUserPreferences } from '@context/UserPreferences'
import { decryptJsonWallet } from '@utils/wallet/jsonWalletUtils'
import {
  JSON_WALLET_CONNECTOR_ID,
  JsonWalletConnectorProperties
} from '@utils/wallet/jsonWalletConnector'
import { accountTruncate } from '@utils/wallet'
import { LoggerInstance } from '@oceanprotocol/lib'
import { toast } from 'react-toastify'
import styles from './DecryptPrompt.module.css'

interface DecryptPromptProps {
  walletAddress: string
}

export default function DecryptPrompt({
  walletAddress
}: DecryptPromptProps): ReactElement {
  const { connect } = useConnect()
  const connectors = useConnectors()
  const { encryptedWalletJson, setEncryptedWalletJson } = useUserPreferences()

  const [password, setPassword] = useState('')
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptProgress, setDecryptProgress] = useState(0)
  const [error, setError] = useState('')

  const handleUnlock = useCallback(async () => {
    if (!password || !encryptedWalletJson) return

    setError('')
    setIsDecrypting(true)
    setDecryptProgress(0)

    try {
      const privateKey = await decryptJsonWallet(
        encryptedWalletJson,
        password,
        (percent) => setDecryptProgress(percent)
      )

      const connector = connectors.find(
        (c) => c.id === JSON_WALLET_CONNECTOR_ID
      )
      if (!connector) throw new Error('JSON Wallet connector not found.')
      ;(connector as unknown as JsonWalletConnectorProperties).loadWallet(
        privateKey
      )

      connect(
        { connector },
        {
          onSuccess: () => {
            toast.success(`Wallet ${accountTruncate(walletAddress)} connected.`)
          },
          onError: (err) => {
            LoggerInstance.error('[DecryptPrompt] Connection failed:', err)
            setError('Connection failed.')
            setIsDecrypting(false)
          }
        }
      )
    } catch (e: any) {
      LoggerInstance.error('[DecryptPrompt] Decryption failed:', e)
      setError(
        e?.message?.includes('invalid password')
          ? 'Wrong password.'
          : 'Decryption failed.'
      )
      setIsDecrypting(false)
    }
  }, [password, encryptedWalletJson, connectors, connect, walletAddress])

  const handleRemoveWallet = useCallback(() => {
    setEncryptedWalletJson('')
    toast.info('Stored wallet removed.')
  }, [setEncryptedWalletJson])

  return (
    <div className={styles.prompt}>
      <span className={styles.label}>
        Unlock {accountTruncate(walletAddress)}
      </span>

      {isDecrypting ? (
        <span className={styles.progress}>
          Decrypting… {Math.round(decryptProgress * 100)}%
        </span>
      ) : (
        <>
          <div className={styles.inputRow}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUnlock()
              }}
              placeholder="Password"
            />
            <button
              type="button"
              className={styles.unlockButton}
              onClick={handleUnlock}
              disabled={!password}
            >
              Unlock
            </button>
          </div>
          <button
            type="button"
            className={styles.removeButton}
            onClick={handleRemoveWallet}
          >
            Remove stored wallet
          </button>
        </>
      )}

      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
