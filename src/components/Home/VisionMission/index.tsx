import { ReactElement } from 'react'
import styles from './index.module.css'
import Container from '@shared/atoms/Container'

export default function VisionMission(): ReactElement {
  return (
    <section className={styles.section}>
      <Container>
        <div className={styles.grid}>
          <div className={styles.block}>
            <h2 className={styles.heading}>
              Our Vision: Transforming Manufacturing into a Service
            </h2>
            <p className={styles.text}>
              ACCURATE envisions resilient Manufacturing as a Service (MAAS)
              value chains designed to withstand both prolonged and immediate
              disruptions. Our goal is to redefine the industry, ensuring that
              MAAS not only achieves technical viability but also establishes
              economic sustainability, profitability, and environmental
              friendliness.
            </p>
            <a
              className={styles.link}
              href="https://accurateproject.eu"
              target="_blank"
              rel="noopener noreferrer"
            >
              LEARN MORE ↗
            </a>
          </div>
          <div className={styles.imageContainer}>
            <img
              className={styles.image}
              src="/images/accurate-home-graphic.webp"
              alt="Accurate Vision"
            />
          </div>
        </div>

        <div className={`${styles.grid} ${styles.mirror}`}>
          <div className={styles.block}>
            <h2 className={styles.heading}>Our Mission</h2>
            <p className={styles.text}>
              We&apos;re dedicated to delivering a federated MAAS framework,
              data space, and ecosystem. Fueled by intricate multi-level digital
              twin models of MAAS value chains, our mission is to forge a
              collaborative Decision-Support System. This empowers robust
              planning, resilient operation, and swift recovery for value
              networks and industrial systems.
            </p>
            <a
              className={styles.link}
              href="https://accurateproject.eu"
              target="_blank"
              rel="noopener noreferrer"
            >
              LEARN MORE ↗
            </a>
          </div>
          <div className={styles.imageContainer}>
            <img
              className={styles.image}
              src="/images/accurate-our-mission.webp"
              alt="Accurate Mission"
            />
          </div>
        </div>
      </Container>
    </section>
  )
}
