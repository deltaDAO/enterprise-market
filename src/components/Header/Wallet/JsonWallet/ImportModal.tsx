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
import { useConnect, useConnectors } from 'wagmi'
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
  const { connect } = useConnect()
  const connectors = useConnectors()
  const { setEncryptedWalletJson } = useUserPreferences()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rawJson, setRawJson] = useState<string>('')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptProgress, setDecryptProgress] = useState(0)
  const [error, setError] = useState('')

  const hasFile = !!walletAddress

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
    onClose()
  }, [onClose, reset])

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
    if (!rawJson || !password) return

    setError('')
    setIsDecrypting(true)
    setDecryptProgress(0)

    try {
      const privateKey = await decryptJsonWallet(rawJson, password, (percent) =>
        setDecryptProgress(percent)
      )

      const connector = connectors.find(
        (c) => c.id === JSON_WALLET_CONNECTOR_ID
      )
      if (!connector) {
        throw new Error('JSON Wallet connector not found.')
      }

      // Load the private key into the connector
      ;(connector as unknown as JsonWalletConnectorProperties).loadWallet(
        privateKey
      )

      // Save encrypted JSON for future sessions
      setEncryptedWalletJson(rawJson)

      // Connect via wagmi
      connect(
        { connector },
        {
          onSuccess: () => {
            toast.success(`Wallet ${accountTruncate(walletAddress)} connected.`)
            handleClose()
          },
          onError: (err) => {
            LoggerInstance.error('[ImportModal] Connection failed:', err)
            setError('Failed to connect wallet.')
            setIsDecrypting(false)
          }
        }
      )
    } catch (e: any) {
      LoggerInstance.error('[ImportModal] Decryption failed:', e)
      setError(
        e?.message?.includes('invalid password')
          ? 'Incorrect password.'
          : 'Failed to decrypt wallet file.'
      )
      setIsDecrypting(false)
    }
  }, [
    rawJson,
    password,
    connectors,
    connect,
    setEncryptedWalletJson,
    walletAddress,
    handleClose
  ])

  return (
    <Modal
      title="Import JSON Wallet"
      isOpen={isOpen}
      onToggleModal={handleClose}
      className={styles.importModal}
    >
      <div className={styles.step}>
        {!hasFile ? (
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
              {walletAddress}
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
                  <Button
                    style="text"
                    size="small"
                    onClick={reset}
                    type="button"
                  >
                    Back
                  </Button>
                  <Button
                    style="primary"
                    size="small"
                    onClick={handleDecrypt}
                    disabled={!password}
                    type="button"
                  >
                    Decrypt &amp; Connect
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
