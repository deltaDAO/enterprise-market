import { ReactElement } from 'react'
import { useRouter } from 'next/router'
import styles from './index.module.css'

interface AnchorItem {
  label: string
  anchor: string
  href?: string
}

interface AnchorNavigationProps {
  items: AnchorItem[]
}

export default function AnchorNavigation({
  items
}: AnchorNavigationProps): ReactElement {
  const router = useRouter()

  const handleClick = (item: AnchorItem) => {
    if (item.href) {
      router.push(`${item.href}#${item.anchor}`)
    } else {
      const element = document.getElementById(item.anchor)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  return (
    <div className={styles.container}>
      {items.map((item) => (
        <button
          key={item.anchor}
          className={styles.button}
          onClick={() => handleClick(item)}
          type="button"
        >
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
