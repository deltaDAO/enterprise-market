import { ReactElement } from 'react'
import { useUserPreferences } from '@context/UserPreferences'
import styles from './Links.module.css'
import { useMarketMetadata } from '@context/MarketMetadata'
import Link from 'next/link'

export default function Links(): ReactElement {
  const { appConfig, siteContent } = useMarketMetadata()
  const { setShowPPC } = useUserPreferences()

  const { content } = siteContent.footer

  return (
    <div className={styles.container}>
      {content?.map((section, i) => (
        <div key={i} className={styles.section}>
          <p className={styles.title}>{section.title}</p>
          <div className={styles.links}>
            {section.links.map((e, i) => {
              const isCookiePolicyLink = e.link === '/privacy/cookie-policy'
              const hideCookiePolicyLink =
                isCookiePolicyLink &&
                appConfig.privacyPreferenceCenter !== 'true'

              if (hideCookiePolicyLink) return null

              const linkLabel =
                e.name === 'Log' ? (
                  <>
                    <span>Log</span>
                    <span className={styles.logIcon}>&nbsp;↗</span>{' '}
                  </>
                ) : (
                  e.name
                )

              const isInternalLink = e.link.startsWith('/')
              if (isInternalLink) {
                return (
                  <Link
                    key={i}
                    className={styles.link}
                    href={e.link}
                    onClick={
                      isCookiePolicyLink
                        ? () => {
                            setShowPPC(true)
                          }
                        : undefined
                    }
                  >
                    {linkLabel}
                  </Link>
                )
              }

              return (
                <a
                  key={i}
                  className={styles.link}
                  href={e.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {linkLabel}
                </a>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
