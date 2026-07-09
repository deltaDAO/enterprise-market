import { ReactElement } from 'react'
import styles from './features.module.css'

interface FeatureItem {
  title: string
  description: string
  icon: ReactElement
}

const icons = {
  digitalTwin: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  dataExchange: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ecosystem: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
  computeToData: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect
        x="2"
        y="3"
        width="20"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 21h8M12 17v4M7 10l3 2-3 2M12 12h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Features(): ReactElement {
  const features: FeatureItem[] = [
    {
      title: 'Manufacturing as a Service',
      description:
        'A federated MAAS framework and data space enabling flexible production lines and resilient supply chains across the manufacturing value network.',
      icon: icons.digitalTwin
    },
    {
      title: 'Sovereign Data Exchange',
      description:
        'Self-Sovereign Identity and verifiable credentials ensure data providers keep full control over their assets with trusted, compliant sharing.',
      icon: icons.dataExchange
    },
    {
      title: 'Federated European Ecosystem',
      description:
        'Cross-border data exchange across European partners via Pontus-X and Gaia-X — fully compliant with the Data Act, AI Act and GDPR.',
      icon: icons.ecosystem
    },
    {
      title: 'Compute-to-Data',
      description:
        'Privacy-preserving computation where algorithms travel to the data. Run AI and analytics on sensitive manufacturing datasets without exposure.',
      icon: icons.computeToData
    }
  ]

  return (
    <section className={styles.featuresSection}>
      <div className={styles.container}>
        <div className={styles.grid}>
          {features.map((feature, index) => (
            <div key={index} className={styles.featureCard}>
              <div className={styles.iconContainer}>{feature.icon}</div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
