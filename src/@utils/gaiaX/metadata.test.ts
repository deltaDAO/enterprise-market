import { withServiceOfferingCredential } from './metadata'
import { getGaiaXBlockingReason, getPublisherDid } from './publisher'

describe('withServiceOfferingCredential', () => {
  const url = 'https://delta-dao.com/.well-known/so.jwt'

  it('stores the URL in the reserved gaiaX key and keeps other keys', () => {
    expect(
      withServiceOfferingCredential({ termsAndConditions: true }, ` ${url} `)
    ).toEqual({
      termsAndConditions: true,
      gaiaX: { serviceOfferingCredential: url }
    })
  })

  it('replaces a previous value', () => {
    expect(
      withServiceOfferingCredential(
        { gaiaX: { serviceOfferingCredential: 'https://old.example/so.jwt' } },
        url
      )
    ).toEqual({ gaiaX: { serviceOfferingCredential: url } })
  })

  it('removes the key when the URL is cleared', () => {
    expect(
      withServiceOfferingCredential(
        { termsAndConditions: true, gaiaX: { serviceOfferingCredential: url } },
        ''
      )
    ).toEqual({ termsAndConditions: true })
    expect(withServiceOfferingCredential(undefined, undefined)).toEqual({})
  })

  it('keeps other keys under gaiaX when setting or clearing', () => {
    const existing = {
      saas: { redirectUrl: 'https://app.example', paymentMode: 'Subscription' },
      gaiaX: { serviceOfferingCredential: url, labelLevel: 'L1' }
    } as const

    expect(
      withServiceOfferingCredential(existing, 'https://new.example/so.jwt')
    ).toEqual({
      saas: existing.saas,
      gaiaX: {
        labelLevel: 'L1',
        serviceOfferingCredential: 'https://new.example/so.jwt'
      }
    })
    expect(withServiceOfferingCredential(existing, '')).toEqual({
      saas: existing.saas,
      gaiaX: { labelLevel: 'L1' }
    })
  })
})

describe('getPublisherDid', () => {
  it('uses the SSI DID with SSI enabled and the wallet otherwise', () => {
    expect(
      getPublisherDid({
        ssiEnabled: true,
        selectedDid: 'did:web:delta-dao.com',
        walletAddress: '0xabc'
      })
    ).toBe('did:web:delta-dao.com')
    expect(
      getPublisherDid({
        ssiEnabled: false,
        selectedDid: 'did:web:delta-dao.com',
        walletAddress: '0xabc'
      })
    ).toBe('0xabc')
    // Never falls back to the wallet with SSI enabled: signing wouldn't either
    expect(
      getPublisherDid({ ssiEnabled: true, walletAddress: '0xabc' })
    ).toBeUndefined()
  })
})

describe('getGaiaXBlockingReason', () => {
  const request = {
    participantUrl: 'https://delta-dao.com/vp.jwt',
    publisherDid: 'did:web:other.example'
  }
  const mockFetch = (body: unknown) => {
    global.fetch = jest.fn(async () => ({
      json: async () => body
    })) as unknown as typeof fetch
  }
  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch
  })

  it('returns the blocking check message', async () => {
    mockFetch({
      success: true,
      result: {
        blocking: true,
        binding: [
          {
            id: 'Participant-vp-issuer',
            status: 'fail',
            blocking: true,
            message: 'DID mismatch: credential not issued by the publisher.'
          }
        ]
      }
    })
    await expect(getGaiaXBlockingReason(request)).resolves.toBe(
      'DID mismatch: credential not issued by the publisher.'
    )
  })

  it('does not block on unblocked results or a failing service', async () => {
    mockFetch({ success: true, result: { blocking: false, binding: [] } })
    await expect(getGaiaXBlockingReason(request)).resolves.toBeUndefined()

    global.fetch = jest.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(getGaiaXBlockingReason(request)).resolves.toBeUndefined()

    await expect(getGaiaXBlockingReason({})).resolves.toBeUndefined()
  })
})
