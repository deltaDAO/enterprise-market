import { ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import Account from './Account'
import Details from './Details'
import Tooltip from '@shared/atoms/Tooltip'
import styles from './index.module.css'
import { useAccount, useConnectors } from 'wagmi'
import Network from './Network'
import ImportModal from './JsonWallet/ImportModal'
import {
  JSON_WALLET_CONNECTOR_ID,
  setImportRequestHandler
} from '@utils/wallet/jsonWalletConnector'

export default function Wallet(): ReactElement {
  const { address: accountId } = useAccount()
  const connectors = useConnectors()
  const [isSsiModalOpen, setIsSsiModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const tooltipRef = useRef<{ hide?: () => void } | null>(null)

  // Register handler so the connector can request the import modal
  // (triggered when ConnectKit calls connect() on our connector)
  const handleImportRequest = useCallback(() => {
    setIsImportModalOpen(true)
  }, [])

  useEffect(() => {
    // Only register when the connector is present
    const hasConnector = connectors.some(
      (c) => c.id === JSON_WALLET_CONNECTOR_ID
    )
    if (hasConnector) {
      setImportRequestHandler(handleImportRequest)
    }
    return () => setImportRequestHandler(null)
  }, [connectors, handleImportRequest])

  useEffect(() => {
    if (isSsiModalOpen) {
      tooltipRef.current?.hide?.()
    }
  }, [isSsiModalOpen])

  return (
    <div className={styles.wallet}>
      {accountId && <Network />}
      <Tooltip
        content={
          <Details onRequestClose={() => tooltipRef.current?.hide?.()} />
        }
        trigger="click focus mouseenter"
        disabled={isSsiModalOpen}
        onCreate={(instance) => {
          tooltipRef.current = instance
        }}
      >
        <Account onSsiModalOpenChange={setIsSsiModalOpen} />
      </Tooltip>
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  )
}
