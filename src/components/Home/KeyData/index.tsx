import { ReactElement } from 'react'
import styles from './index.module.css'

interface KeyDataItem {
  value: string
  label: string
}

const keyData: KeyDataItem[] = [
  { value: '11', label: 'EU Key Players' },
  { value: '6', label: 'EU Countries' },
  { value: '3', label: 'Pilots' }
]

export default function KeyData(): ReactElement {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.heading}>KEY DATA</h2>
        <div className={styles.grid}>
          {keyData.map((item, index) => (
            <div key={index} className={styles.card}>
              <span className={styles.value}>{item.value}</span>
              <span className={styles.label}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
