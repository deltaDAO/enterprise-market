import { ReactElement, useState } from 'react'
import DebugOutput from '@shared/DebugOutput'
import { JsonObject } from '@utils/gaiaX/types'
import styles from './index.module.css'

export default function RawCredential({
  label = 'Show raw credential',
  payload,
  jwt
}: {
  label?: string
  payload?: JsonObject
  jwt?: string
}): ReactElement {
  const [open, setOpen] = useState(false)
  if (!payload && !jwt) return null

  return (
    <div className={styles.raw}>
      <button
        type="button"
        className={styles.rawToggle}
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
      >
        {open ? 'Hide raw credential' : label}
      </button>
      {open && (
        <>
          <DebugOutput title="Decoded" output={payload} />
          <DebugOutput title="JWT" output={jwt} />
        </>
      )}
    </div>
  )
}
