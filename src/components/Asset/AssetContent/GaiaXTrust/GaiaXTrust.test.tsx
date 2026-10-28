import { fireEvent, render, screen } from '@testing-library/react'
import verification from '../../../../../.jest/__fixtures__/gaiaX/verification.json'
import { GaiaXVerification } from '@utils/gaiaX/types'
import { useGaiaXVerification } from '@hooks/useGaiaXVerification'
import { Asset } from 'src/@types/Asset'
import GaiaXTrustView, { isLegacyProvidedBy } from './GaiaXTrustView'
import ProvidedBy from './ProvidedBy'
import { NOT_BOUND_MESSAGE } from './ComplianceCard'

jest.mock('@hooks/useGaiaXVerification', () => ({
  useGaiaXVerification: jest.fn()
}))

const result = verification as unknown as GaiaXVerification
const participantOnly: GaiaXVerification = {
  ...result,
  status: 'verified',
  serviceOffering: undefined
}

describe('GaiaXTrustView', () => {
  it('collapses nested credentials behind a one-line summary', () => {
    render(<GaiaXTrustView result={participantOnly} stale={false} />)
    const summary = (text: string) =>
      screen.getAllByText(
        (_, element) =>
          element?.tagName === 'SUMMARY' && element.textContent === text
      )

    const summaries = [
      ...summary('VAT ID · DE346013532'),
      ...summary('LEI code · 391200FJBNU0YW987L26'),
      ...summary('Address · Katharinenstraße 30a, 20457 Hamburg, DE')
    ]
    expect(summaries).toHaveLength(4)
    summaries.forEach((element) =>
      expect(element.parentElement).not.toHaveAttribute('open')
    )
  })

  it('renders the participant with resolved registration numbers', () => {
    render(<GaiaXTrustView result={participantOnly} stale={false} />)

    expect(screen.getByText('Gaia-X Trust Information')).toBeInTheDocument()
    expect(screen.getAllByText('deltaDAO AG').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DE346013532').length).toBeGreaterThan(0)
    expect(screen.getAllByText('391200FJBNU0YW987L26').length).toBeGreaterThan(
      0
    )
    expect(screen.getAllByText('Legal address').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(/Issued by did:web:www.delta-dao.com:notary:v2/)
    ).toHaveLength(3)
    expect(
      screen.getByText(
        'All Gaia-X credentials are verified and bound to the publisher.'
      )
    ).toBeInTheDocument()
  })

  it('renders the live compliance result', () => {
    render(<GaiaXTrustView result={participantOnly} stale={false} />)

    expect(screen.getByText('Standard Compliance')).toBeInTheDocument()
    expect(screen.getByText(/Rules CD4.0.0/)).toBeInTheDocument()
    expect(screen.getByText('PA1.1')).toBeInTheDocument()
    expect(screen.getAllByText(/digest matches/)).toHaveLength(5)
  })

  it('shows the amber state for a stale result', () => {
    render(<GaiaXTrustView result={participantOnly} stale />)

    expect(
      screen.queryByText(
        'All Gaia-X credentials are verified and bound to the publisher.'
      )
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(/older than 10 minutes/).length).toBeGreaterThan(
      0
    )
    expect(
      screen.queryByText(
        'Verified by the Gaia-X Digital Clearing House (CD4.0.0).'
      )
    ).not.toBeInTheDocument()
  })

  it('hides every trust badge on a DID mismatch', () => {
    render(
      <GaiaXTrustView
        result={{
          ...participantOnly,
          status: 'failed',
          blocking: true,
          binding: [
            {
              id: 'Participant-vp-issuer',
              status: 'fail',
              blocking: true,
              message: 'DID mismatch: credential not issued by the publisher.'
            }
          ]
        }}
        stale={false}
      />
    )

    expect(screen.queryByText('Standard Compliance')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Compliant with the Gaia-X Trust Framework.')
    ).not.toBeInTheDocument()
    expect(screen.getByText(NOT_BOUND_MESSAGE)).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'DID mismatch: credential not issued by the publisher.'
      ).length
    ).toBeGreaterThan(0)
  })

  it('reports a service offering presentation without DSO credential', () => {
    render(<GaiaXTrustView result={result} stale={false} />)

    expect(
      screen.getAllByText(
        'The presentation does not contain a service offering credential (gx:DigitalServiceOffering).'
      ).length
    ).toBeGreaterThan(0)
  })

  it('shows the raw credential on demand', () => {
    render(<GaiaXTrustView result={participantOnly} stale={false} />)

    fireEvent.click(screen.getAllByText('Show raw credential')[0])
    expect(screen.getByText('Decoded')).toBeInTheDocument()
    expect(screen.getByText('JWT')).toBeInTheDocument()
  })

  it('treats a non-credential providedBy URL as legacy metadata', () => {
    expect(
      isLegacyProvidedBy({
        ...result,
        serviceOffering: undefined,
        participant: {
          ...result.participant,
          error: { code: 'NOT_JWT', message: '' }
        }
      })
    ).toBe(true)
    expect(isLegacyProvidedBy(result)).toBe(false)
  })
})

describe('ProvidedBy', () => {
  const url = 'https://delta-dao.com/.well-known/40_gx_legalperson_deltaDAO.jwt'
  const ddo = {
    id: 'did:ope:123',
    issuer: 'did:web:delta-dao.com',
    credentialSubject: { metadata: { providedBy: url } }
  } as unknown as Asset
  const mockHook = useGaiaXVerification as jest.Mock

  it('shows the verified legal name', () => {
    mockHook.mockReturnValue({ data: participantOnly, freshness: 'fresh' })
    render(<ProvidedBy ddo={ddo} />)

    expect(screen.getByText('deltaDAO AG')).toHaveAttribute('href', url)
    expect(screen.getByLabelText('Verified')).toBeInTheDocument()
  })

  it('falls back to the raw URL while loading', () => {
    mockHook.mockReturnValue({ data: undefined, freshness: 'stale' })
    render(<ProvidedBy ddo={ddo} />)

    expect(screen.getByText(url)).toBeInTheDocument()
  })

  it('never shows the legal name of an unverified credential', () => {
    mockHook.mockReturnValue({
      data: { ...participantOnly, blocking: true },
      freshness: 'fresh'
    })
    render(<ProvidedBy ddo={ddo} />)

    expect(screen.queryByText('deltaDAO AG')).not.toBeInTheDocument()
    expect(screen.getByText(url)).toBeInTheDocument()
    expect(screen.getByLabelText('Failed')).toBeInTheDocument()
  })

  it.each([
    ['a website', 'NOT_JWT', 'https://www.example.com'],
    ['a dead link', 'UNREACHABLE', 'https://gone.example.com/vc.json']
  ])('keeps a plain link without icon for %s', (_, code, legacyUrl) => {
    mockHook.mockReturnValue({
      data: {
        ...result,
        serviceOffering: undefined,
        participant: {
          url: legacyUrl,
          expectedType: 'gx:LegalPerson',
          checks: [],
          credentials: [],
          error: { code, message: 'Could not load the credential.' }
        }
      },
      freshness: 'fresh'
    })
    render(
      <ProvidedBy
        ddo={
          {
            ...ddo,
            credentialSubject: { metadata: { providedBy: legacyUrl } }
          } as unknown as Asset
        }
      />
    )

    expect(screen.getByText(legacyUrl)).toHaveAttribute('href', legacyUrl)
    expect(screen.queryByLabelText('Failed')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Not verified')).not.toBeInTheDocument()
  })
})

describe('GaiaXTrustView review fixes', () => {
  it('shows no compliance badge for a publisher without did:web', () => {
    render(
      <GaiaXTrustView
        result={{
          ...participantOnly,
          status: 'warning',
          binding: [
            {
              id: 'publisher-did',
              status: 'warn',
              message: 'Publisher has no did:web.'
            }
          ]
        }}
        stale={false}
      />
    )

    expect(screen.queryByText('Standard Compliance')).not.toBeInTheDocument()
    expect(screen.queryByText(/digest matches/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rules CD4.0.0/)).not.toBeInTheDocument()
    expect(screen.getByText(NOT_BOUND_MESSAGE)).toBeInTheDocument()
  })

  it('does not claim compliance in the stale state', () => {
    render(<GaiaXTrustView result={participantOnly} stale />)

    expect(
      screen.queryByText('Compliant with the Gaia-X Trust Framework.')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Standard Compliance')).not.toBeInTheDocument()
  })

  it('renders messages from credentials as plain text, not markdown', () => {
    const message =
      'DID mismatch: x [Re-verify your wallet](https://phish.example) ![](https://track.example/p.png)'
    render(
      <GaiaXTrustView
        result={{
          ...participantOnly,
          blocking: true,
          binding: [
            {
              id: 'Participant-vp-issuer',
              status: 'fail',
              blocking: true,
              message
            }
          ]
        }}
        stale={false}
      />
    )

    expect(
      screen.queryByRole('link', { name: 'Re-verify your wallet' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '' })).not.toBeInTheDocument()
    expect(screen.getAllByText(message).length).toBeGreaterThan(0)
  })

  it('hides dead legacy providedBy links', () => {
    expect(
      isLegacyProvidedBy({
        ...result,
        serviceOffering: undefined,
        participant: {
          ...result.participant,
          error: {
            code: 'UNREACHABLE',
            message: 'Could not load the credential.'
          }
        }
      })
    ).toBe(true)
  })
})
