import { ReactElement } from 'react'
import styles from './Footer.module.css'
import Links from './Links'
import { useMarketMetadata } from '@context/MarketMetadata'

export default function Footer(): ReactElement {
  const { siteContent } = useMarketMetadata()
  const { footer } = siteContent
  const copyright = footer.copyright.replace(
    /\b\d{4}\b/g,
    String(new Date().getFullYear())
  )

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.logoSection}>
          <img
            className={styles.logo}
            src="/images/accurate-logo.webp"
            alt="Accurate Marketplace"
          />
        </div>
        <Links />
      </div>
      <p className={styles.copyright}>{copyright}</p>
    </footer>
  )
}
