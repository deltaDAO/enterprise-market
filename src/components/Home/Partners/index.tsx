import { ReactElement } from 'react'
import styles from './index.module.css'
import Container from '@shared/atoms/Container'

interface Partner {
  name: string
  logo: string
  url?: string
}

const partners: Partner[] = [
  { name: 'SIMAVI', logo: '/images/projectPartners/a-simavi.webp' },
  { name: 'Airbus', logo: '/images/projectPartners/b-airbus.webp' },
  { name: 'Continental', logo: '/images/projectPartners/c-continental.webp' },
  { name: 'deltaDAO', logo: '/images/projectPartners/d-deltaDao.webp' },
  { name: 'ENGISOFT', logo: '/images/projectPartners/e-engisoft.webp' },
  { name: 'Aarhus University', logo: '/images/projectPartners/f-au.webp' },
  { name: 'HWR Berlin', logo: '/images/projectPartners/g-hochschule.webp' },
  { name: 'Tronico', logo: '/images/projectPartners/h-tronico.png' },
  { name: 'iED', logo: '/images/projectPartners/i-ied.webp' },
  {
    name: 'IMT Atlantique',
    logo: '/images/projectPartners/j-imt-atlantique.webp'
  },
  {
    name: 'Fraunhofer IAO',
    logo: '/images/projectPartners/k-fraunhofer-iao.webp'
  }
]

export default function Partners(): ReactElement {
  return (
    <section className={styles.section}>
      <Container>
        <h2 className={styles.heading}>OUR PARTNERS</h2>
        <div className={styles.grid}>
          {partners.map((partner) => (
            <div key={partner.name} className={styles.card}>
              <img
                className={styles.logo}
                src={partner.logo}
                alt={partner.name}
              />
            </div>
          ))}
        </div>
        <div className={styles.allPartners}>
          <a
            className={styles.link}
            href="https://accurateproject.eu/partners"
            target="_blank"
            rel="noopener noreferrer"
          >
            ALL PROJECT PARTNERS ↗
          </a>
        </div>
      </Container>
    </section>
  )
}
