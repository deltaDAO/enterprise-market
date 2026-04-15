import { ReactElement, useState } from 'react'
import ImportModal from './ImportModal'
import styles from './ImportButton.module.css'

export default function ImportButton(): ReactElement {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => setIsModalOpen(true)}
      >
        Import JSON Wallet
      </button>
      <ImportModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}
