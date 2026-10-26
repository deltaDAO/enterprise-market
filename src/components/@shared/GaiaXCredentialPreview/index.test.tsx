import { act, render, screen } from '@testing-library/react'
import { Formik, useFormikContext } from 'formik'
import verification from '../../../../.jest/__fixtures__/gaiaX/verification.json'
import { useGaiaXVerification } from '@hooks/useGaiaXVerification'
import { GaiaXVerification } from '@utils/gaiaX/types'
import GaiaXCredentialPreview from '.'

jest.mock('@hooks/useGaiaXVerification', () => ({
  useGaiaXVerification: jest.fn()
}))

const mockHook = useGaiaXVerification as jest.Mock
const result = verification as unknown as GaiaXVerification
const participantUrl =
  'https://delta-dao.com/.well-known/40_gx_legalperson_deltaDAO.jwt'

function BlockingValue(): JSX.Element {
  const { values } = useFormikContext<{ gaiaXBlocking: boolean }>()
  return <output data-testid="blocking">{String(values.gaiaXBlocking)}</output>
}

function renderPreview(url = participantUrl) {
  return render(
    <Formik initialValues={{ gaiaXBlocking: false }} onSubmit={jest.fn()}>
      <>
        <GaiaXCredentialPreview
          participantUrl={url}
          publisherDid="did:web:delta-dao.com"
          blockingFieldName="gaiaXBlocking"
        />
        <BlockingValue />
      </>
    </Formik>
  )
}

describe('GaiaXCredentialPreview', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('renders nothing without an https credential URL', async () => {
    mockHook.mockReturnValue({ data: undefined, freshness: 'stale' })
    renderPreview('http://delta-dao.com/vc.json')
    await act(async () => {
      jest.advanceTimersByTime(700)
    })

    expect(screen.queryByText(/Verifying/)).not.toBeInTheDocument()
    expect(screen.getByTestId('blocking')).toHaveTextContent('false')
  })

  it('previews a verified participant credential', async () => {
    mockHook.mockReturnValue({
      data: { ...result, serviceOffering: undefined },
      freshness: 'fresh'
    })
    renderPreview()
    await act(async () => {
      jest.advanceTimersByTime(700)
    })

    expect(screen.getByText('Participant credential')).toBeInTheDocument()
    expect(screen.getByText('· deltaDAO AG')).toBeInTheDocument()
    expect(screen.getByText(/Standard Compliance/)).toBeInTheDocument()
    expect(screen.getByTestId('blocking')).toHaveTextContent('false')
  })

  it('blocks the form on a DID mismatch', async () => {
    mockHook.mockReturnValue({
      data: {
        ...result,
        blocking: true,
        binding: [
          {
            id: 'Participant-vp-issuer',
            status: 'fail',
            blocking: true,
            message: 'DID mismatch: credential not issued by the publisher.'
          }
        ]
      },
      freshness: 'fresh'
    })
    renderPreview()
    await act(async () => {
      jest.advanceTimersByTime(700)
    })

    expect(
      screen.getByText(
        'Publishing is blocked: DID mismatch: credential not issued by the publisher.'
      )
    ).toBeInTheDocument()
    expect(screen.getByTestId('blocking')).toHaveTextContent('true')
  })

  it('only warns when the verification service fails', async () => {
    mockHook.mockReturnValue({
      data: undefined,
      error: new Error('HTTP 500'),
      isFetching: false,
      freshness: 'stale'
    })
    renderPreview()
    await act(async () => {
      jest.advanceTimersByTime(700)
    })

    expect(
      screen.getByText('Credentials could not be verified: HTTP 500')
    ).toBeInTheDocument()
    expect(screen.getByTestId('blocking')).toHaveTextContent('false')
  })
})
