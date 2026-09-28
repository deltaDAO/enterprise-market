import { ReactElement } from 'react'
import { useRouter } from 'next/router'
import styles from './index.module.css'

// An item needs an `href` (navigate to that page, optionally to `anchor` on
// it) or an `anchor` alone (scroll to that id on the current page). Only set
// `anchor` when the target page really renders an element with that id.
interface AnchorItem {
  label: string
  anchor?: string
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
      router.push(item.anchor ? `${item.href}#${item.anchor}` : item.href)
    } else if (item.anchor) {
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
          key={item.label}
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
