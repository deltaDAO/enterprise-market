import { ReactElement } from 'react'
import Time from '@shared/atoms/Time'
import { usePrivacyMetadata } from '@hooks/usePrivacyMetadata'
import PrivacyLanguages from './PrivacyLanguages'
import AnchorNavigation from '@shared/AnchorNavigation'

export default function PrivacyPolicyHeader({
  lastUpdatedDate
}: {
  lastUpdatedDate?: string
}): ReactElement {
  const { policies } = usePrivacyMetadata()
  const policyMetadata = policies && policies.length > 0 ? policies[0] : null
  const resolvedDate =
    policyMetadata?.date ||
    lastUpdatedDate ||
    new Date().toISOString().split('T')[0]
  const params = policyMetadata?.params || {
    languageLabel: 'Language',
    updated: 'Last updated on',
    dateFormat: 'MMMM dd, yyyy.'
  }

  const navItems = [
    {
      label: 'Imprint',
      anchor: 'imprint',
      href: 'https://www.delta-dao.com/imprint'
    },
    {
      label: 'Terms and Conditions',
      anchor: 'terms-and-conditions',
      href: '/privacy/terms'
    },
    {
      label: 'Privacy Policy',
      anchor: 'privacy-policy',
      href: '/privacy/privacy-policy'
    },
    {
      label: 'Cookie Policy',
      anchor: 'cookie-policy',
      href: '/privacy/cookie-policy'
    }
  ]

  return (
    <div>
      <PrivacyLanguages label={params.languageLabel} />
      <AnchorNavigation items={navItems} />
      <p>
        <em>
          {params?.updated || 'Last updated on'}{' '}
          <Time
            date={resolvedDate}
            displayFormat={params?.dateFormat || 'MMMM dd, yyyy.'}
          />
        </em>
      </p>
    </div>
  )
}
