import { ReactElement } from 'react'
import Time from '@shared/atoms/Time'
import { usePrivacyMetadata } from '@hooks/usePrivacyMetadata'
import PrivacyLanguages from './PrivacyLanguages'
import AnchorNavigation from '@shared/AnchorNavigation'

export default function PrivacyPolicyHeader({
  documentDate,
  fileLastUpdated
}: {
  documentDate?: string
  fileLastUpdated?: string
}): ReactElement {
  const { policies } = usePrivacyMetadata()
  const policyMetadata = policies && policies.length > 0 ? policies[0] : null
  // The document's own `lastUpdated` front matter wins: it is the only source
  // that records when this particular text changed. policies.json describes a
  // single policy and carries one shared date, and fileLastUpdated degrades to
  // the image build date in the container, which ships neither git nor .git.
  const resolvedDate =
    documentDate ||
    policyMetadata?.date ||
    fileLastUpdated ||
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
      href: '/privacy/imprint'
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
      label: 'Data Portal Usage Agreement',
      anchor: 'data-portal-usage-agreement',
      href: '/privacy/data-portal-usage-agreement'
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
