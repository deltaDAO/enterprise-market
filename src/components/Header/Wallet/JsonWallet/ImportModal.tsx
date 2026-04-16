import { ReactElement, useCallback, useRef, useState } from 'react'
import Modal from '@shared/atoms/Modal'
import Button from '@shared/atoms/Button'
import {
  decryptJsonWallet,
  getAddressFromJsonWallet,
  isValidEncryptedWalletJson
} from '@utils/wallet/jsonWalletUtils'
import {
  JSON_WALLET_CONNECTOR_ID,
  JsonWalletConnectorProperties
} from '@utils/wallet/jsonWalletConnector'
import { useConnectors } from 'wagmi'
import { useUserPreferences } from '@context/UserPreferences'
import { toast } from 'react-toastify'
import { LoggerInstance } from '@oceanprotocol/lib'
import { accountTruncate } from '@utils/wallet'
import styles from './ImportModal.module.css'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ImportModal({
  isOpen,
  onClose
}: ImportModalProps): ReactElement {
  const connectors = useConnectors()
  const { encryptedWalletJson, setEncryptedWalletJson } = useUserPreferences()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rawJson, setRawJson] = useState<string>('')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptProgress, setDecryptProgress] = useState(0)
  const [error, setError] = useState('')

  // Determine if we already have a stored wallet to unlock
  const storedAddress = encryptedWalletJson
    ? getAddressFromJsonWallet(encryptedWalletJson)
    : null
  const isUnlockMode = !!storedAddress && !rawJson

  // Show password step when we have a file OR a stored wallet
  const showPasswordStep = !!walletAddress || isUnlockMode

  const reset = useCallback(() => {
    setRawJson('')
    setWalletAddress(null)
    setPassword('')
    setIsDecrypting(false)
    setDecryptProgress(0)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleClose = useCallback(() => {
    reset()

    // Cancel any pending connect promise in the connector
    const connector = connectors.find((c) => c.id === JSON_WALLET_CONNECTOR_ID)
    if (connector) {
      ;(
        connector as unknown as JsonWalletConnectorProperties
      ).cancelPendingConnect()
    }

    onClose()
  }, [onClose, reset, connectors])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError('')
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        if (!isValidEncryptedWalletJson(content)) {
          setError('Invalid encrypted wallet JSON file.')
          return
        }
        const address = getAddressFromJsonWallet(content)
        if (!address) {
          setError('Could not extract address from wallet file.')
          return
        }
        setRawJson(content)
        setWalletAddress(address)
      }
      reader.readAsText(file)
    },
    []
  )

  const handleDecrypt = useCallback(async () => {
    const jsonToDecrypt = rawJson || encryptedWalletJson
    if (!jsonToDecrypt || !password) return

    setError('')
    setIsDecrypting(true)
    setDecryptProgress(0)

    try {
      const privateKey = await decryptJsonWallet(
        jsonToDecrypt,
        password,
        (percent) => setDecryptProgress(percent)
      )

      const connector = connectors.find(
        (c) => c.id === JSON_WALLET_CONNECTOR_ID
      )
      if (!connector) {
        throw new Error('JSON Wallet connector not found.')
      }

      // Load the private key into the connector.
      // This also resolves any pending connect() promise from ConnectKit.
      ;(connector as unknown as JsonWalletConnectorProperties).loadWallet(
        privateKey
      )

      // Save encrypted JSON for future sessions (only for new imports)
      if (rawJson) {
        setEncryptedWalletJson(rawJson)
      }

      const displayAddress = walletAddress || storedAddress
      toast.success(
        `Wallet ${accountTruncate(displayAddress || '')} connected.`
      )
      reset()
      onClose()
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'Failed to decrypt wallet file.'
      LoggerInstance.error('[ImportModal] Decryption failed:', e)
      setError(
        message.includes('invalid password')
          ? 'Incorrect password.'
          : 'Failed to decrypt wallet file.'
      )
      setIsDecrypting(false)
    }
  }, [
    rawJson,
    encryptedWalletJson,
    password,
    connectors,
    setEncryptedWalletJson,
    walletAddress,
    storedAddress,
    reset,
    onClose
  ])

  const handleRemoveStored = useCallback(() => {
    setEncryptedWalletJson('')

    // Cancel any pending connect promise
    const connector = connectors.find((c) => c.id === JSON_WALLET_CONNECTOR_ID)
    if (connector) {
      ;(
        connector as unknown as JsonWalletConnectorProperties
      ).cancelPendingConnect()
    }

    toast.info('Stored wallet removed.')
    reset()
    onClose()
  }, [setEncryptedWalletJson, connectors, reset, onClose])

  return (
    <Modal
      title={isUnlockMode ? 'Unlock JSON Wallet' : 'Import JSON Wallet'}
      isOpen={isOpen}
      onToggleModal={handleClose}
      className={styles.importModal}
      overlayClassName={styles.importOverlay}
    >
      <div className={styles.step}>
        {!showPasswordStep ? (
          <>
            <div
              className={styles.uploadArea}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className={styles.uploadLabel}>
                Click to select an encrypted JSON wallet file
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className={styles.fileInput}
              onChange={handleFileChange}
            />
          </>
        ) : (
          <>
            <div className={styles.addressPreview}>
              <strong>Wallet Address</strong>
              {walletAddress || storedAddress}
            </div>

            {isDecrypting ? (
              <div className={styles.progress}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${Math.round(decryptProgress * 100)}%`
                    }}
                  />
                </div>
                <span className={styles.progressText}>
                  Decrypting… {Math.round(decryptProgress * 100)}%
                </span>
              </div>
            ) : (
              <>
                <div className={styles.passwordField}>
                  <label htmlFor="json-wallet-password">Password</label>
                  <input
                    id="json-wallet-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDecrypt()
                    }}
                    placeholder="Enter wallet password"
                    autoFocus
                  />
                </div>

                <div className={styles.actions}>
                  {isUnlockMode ? (
                    <Button
                      style="text"
                      size="small"
                      onClick={handleRemoveStored}
                      type="button"
                    >
                      Remove Wallet
                    </Button>
                  ) : (
                    <Button
                      style="text"
                      size="small"
                      onClick={reset}
                      type="button"
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    style="primary"
                    size="small"
                    onClick={handleDecrypt}
                    disabled={!password}
                    type="button"
                  >
                    {isUnlockMode ? 'Unlock' : 'Decrypt & Connect'}
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  )
}
