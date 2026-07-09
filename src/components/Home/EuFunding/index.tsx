import { ReactElement } from 'react'
import Image from 'next/image'
import styles from './index.module.css'
import Container from '@shared/atoms/Container'

export default function EuFunding(): ReactElement {
  return (
    <section className={styles.section}>
      <Container>
        <div className={styles.content}>
          <div className={styles.logoContainer}>
            <Image
              src="/images/eu-funded.webp"
              alt="Funded by the European Union"
              className={styles.logo}
              height={80}
              width={320}
            />
          </div>
          <div className={styles.text}>
            <p className={styles.disclaimer}>
              The ACCURATE project is funded by the European Union, under Grant
              Agreement number 101138269. Views and opinions expressed are
              however those of the author(s) only and do not necessarily reflect
              those of the European Union or the European Health and Digital
              Executive Agency. Neither the European Union nor the granting
              authority can be held responsible for them.
            </p>
            <div className={styles.dates}>
              <span>Start: 01/12/2023</span>
              <span>Finish: 30/11/2026</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
