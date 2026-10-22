/**
 * @jest-environment node
 */
import { createVerificationCache } from './cache'
import { getGaiaXServerConfig } from './config'
import { didWebToUrl, urlToDidWeb } from './didWeb'
import { canonicalJson } from './digest'
import { isPrivateAddress } from './fetch'
import { numericDateToIso } from './jwt'
import { getFieldLabel, getTypeLabel } from './labels'
import { GaiaXVerification } from './types'

describe('did:web', () => {
  it('maps DIDs to DID document URLs', () => {
    expect(didWebToUrl('did:web:delta-dao.com')).toBe(
      'https://delta-dao.com/.well-known/did.json'
    )
    expect(didWebToUrl('did:web:www.delta-dao.com:notary:v2')).toBe(
      'https://www.delta-dao.com/notary/v2/did.json'
    )
    expect(didWebToUrl('did:web:localhost%3A8443')).toBe(
      'https://localhost:8443/.well-known/did.json'
    )
    expect(() => didWebToUrl('did:key:z6Mk')).toThrow()
  })

  it('derives the DID of a clearing house from its base URL', () => {
    expect(urlToDidWeb('https://www.delta-dao.com/compliance/v2')).toBe(
      'did:web:www.delta-dao.com:compliance:v2'
    )
    expect(urlToDidWeb('https://compliance.lab.gaia-x.eu/development/')).toBe(
      'did:web:compliance.lab.gaia-x.eu:development'
    )
  })
})

describe('canonicalJson', () => {
  it('sorts keys recursively and keeps non-ASCII characters', () => {
    expect(
      canonicalJson({ b: [{ z: 1, a: 'Straße' }], a: null, c: undefined })
    ).toBe('{"a":null,"b":[{"a":"Straße","z":1}]}')
  })
})

describe('numericDateToIso', () => {
  it('accepts seconds and milliseconds', () => {
    expect(numericDateToIso(1792681854)).toBe('2026-10-22T15:10:54.000Z')
    expect(numericDateToIso(1792681854610)).toBe('2026-10-22T15:10:54.610Z')
    expect(numericDateToIso('soon')).toBeUndefined()
  })
})

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1'
  ])('rejects %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['1.1.1.1', '76.76.21.21', '2606:4700::1111'])(
    'allows %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    }
  )
})

describe('labels', () => {
  it('uses readable labels with a humanized fallback', () => {
    expect(getFieldLabel('gx:legalAddress')).toBe('Legal address')
    expect(getFieldLabel('gx:someNewProperty')).toBe('Some new property')
    expect(getTypeLabel(['VerifiableCredential', 'gx:VatID'])).toBe('VAT ID')
    expect(getTypeLabel('gx:BrandNewThing')).toBe('Brand new thing')
  })
})

describe('getGaiaXServerConfig', () => {
  it('defaults to a 10 minute max age and clamps it', () => {
    expect(getGaiaXServerConfig({}).maxAgeSeconds).toBe(600)
    expect(
      getGaiaXServerConfig({ GAIAX_VERIFICATION_MAX_AGE_SECONDS: '3600' })
        .maxAgeSeconds
    ).toBe(600)
    expect(
      getGaiaXServerConfig({ GAIAX_VERIFICATION_MAX_AGE_SECONDS: '300' })
        .maxAgeSeconds
    ).toBe(300)
    expect(getGaiaXServerConfig({}).compliance).toEqual({
      baseUrl: undefined,
      label: 'standard-compliance',
      minRulesVersion: undefined
    })
  })
})

describe('createVerificationCache', () => {
  const result = (
    status: GaiaXVerification['compliance']['status'],
    checkedAt: string
  ): GaiaXVerification => ({
    status: status === 'pass' ? 'verified' : 'warning',
    blocking: false,
    checkedAt,
    maxAgeSeconds: 600,
    binding: [],
    compliance: { status, message: '', checks: [] }
  })
  const input = { participantUrl: 'https://example.com/vp.jwt' }

  it('serves results until their max age and shares concurrent requests', async () => {
    let time = 0
    const cache = createVerificationCache(() => time)
    const verify = jest.fn(async () => result('pass', `t${time}`))

    const [first, second] = await Promise.all([
      cache(input, verify),
      cache(input, verify)
    ])
    expect(verify).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)

    time = 599_000
    await cache(input, verify)
    expect(verify).toHaveBeenCalledTimes(1)

    time = 600_001
    await cache(input, verify)
    expect(verify).toHaveBeenCalledTimes(2)
  })

  it('remembers the last successful check and retries outages sooner', async () => {
    let time = 0
    const cache = createVerificationCache(() => time)
    await cache(input, async () => result('pass', 'first'))

    time = 700_000
    const outage = await cache(input, async () =>
      result('unreachable', 'second')
    )
    expect(outage.lastSuccessfulCheckAt).toBe('first')

    const verify = jest.fn(async () => result('pass', 'third'))
    time = 731_000
    await cache(input, verify)
    expect(verify).toHaveBeenCalledTimes(1)
  })
})
