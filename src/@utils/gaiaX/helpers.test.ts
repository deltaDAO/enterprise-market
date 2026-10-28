/**
 * @jest-environment node
 */
import { createMemoCache, createRateLimiter } from './cache'
import { compareVersions } from './compliance'
import { getGaiaXServerConfig } from './config'
import { didWebToUrl, urlToDidWeb } from './didWeb'
import { canonicalJson } from './digest'
import { createGuardedLookup, isPrivateAddress } from './fetch'
import { numericDateToIso } from './jwt'
import { getFieldLabel, getTypeLabel } from './labels'
import { checkValidity } from './validity'

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
    '::',
    'fd00::1',
    'fe80::1',
    'fec0::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    // WHATWG URL normalizes [::ffff:127.0.0.1] to this form
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    // IPv4-compatible and NAT64
    '::7f00:1',
    '64:ff9b::7f00:1',
    '2001:db8::1',
    'not-an-ip'
  ])('rejects %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each(['1.1.1.1', '76.76.21.21', '2606:4700::1111', '::ffff:4c4c:1515'])(
    'allows %s',
    (address) => {
      expect(isPrivateAddress(address)).toBe(false)
    }
  )

  it('normalizes bracketed URL hosts the same way', () => {
    const { hostname } = new URL('https://[::ffff:127.0.0.1]/')
    expect(isPrivateAddress(hostname.replace(/^\[|\]$/g, ''))).toBe(true)
  })
})

describe('createGuardedLookup', () => {
  const lookupWith = (addresses: { address: string; family: number }[]) =>
    new Promise<{ error: Error | null; address?: unknown }>((resolve) =>
      createGuardedLookup((_host, callback) => callback(null, addresses))(
        'example.com',
        {},
        (error, address) => resolve({ error, address })
      )
    )

  it('connects to the checked public address', async () => {
    await expect(
      lookupWith([{ address: '76.76.21.21', family: 4 }])
    ).resolves.toEqual({ error: null, address: '76.76.21.21' })
  })

  it('rejects hosts that resolve to a private address', async () => {
    const { error } = await lookupWith([
      { address: '76.76.21.21', family: 4 },
      { address: '10.0.0.1', family: 4 }
    ])
    expect(error?.message).toBe('blocked')
  })
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

describe('getGaiaXServerConfig trusted notaries', () => {
  it.each([
    'https://www.delta-dao.com/compliance/v2',
    'https://compliance.lab.gaia-x.eu/development',
    // A host containing "compliance" must never be rewritten
    'https://compliance-gxdch.io/v2'
  ])('is not derived from the clearing house URL %s', (url) => {
    expect(
      getGaiaXServerConfig({ GAIAX_COMPLIANCE_URL: url }).trustedNotaries
    ).toEqual([])
  })

  it('reads the number of trusted proxy hops', () => {
    expect(getGaiaXServerConfig({}).trustedProxyHops).toBe(0)
    expect(
      getGaiaXServerConfig({ GAIAX_TRUSTED_PROXY_HOPS: '1' }).trustedProxyHops
    ).toBe(1)
    expect(
      getGaiaXServerConfig({ GAIAX_TRUSTED_PROXY_HOPS: '-2' }).trustedProxyHops
    ).toBe(0)
  })

  it('prefers an explicit list', () => {
    expect(
      getGaiaXServerConfig({
        GAIAX_COMPLIANCE_URL: 'https://compliance.lab.gaia-x.eu/development',
        GAIAX_TRUSTED_NOTARIES:
          'did:web:registrationnumber.notary.lab.gaia-x.eu:development, did:web:notary.example'
      }).trustedNotaries
    ).toEqual([
      'did:web:registrationnumber.notary.lab.gaia-x.eu:development',
      'did:web:notary.example'
    ])
  })
})

describe('checkValidity', () => {
  const now = new Date('2026-10-28T12:00:00Z')

  it('tolerates issuer clocks running ahead, but not too far', () => {
    expect(
      checkValidity('v', '2026-10-28T12:00:30Z', undefined, now).status
    ).toBe('pass')
    expect(
      checkValidity('v', '2026-10-28T12:10:00Z', undefined, now).status
    ).toBe('fail')
  })

  it('treats expiry strictly', () => {
    expect(
      checkValidity('v', undefined, '2026-10-28T11:59:59Z', now).status
    ).toBe('fail')
  })
})

describe('compareVersions', () => {
  it('compares rules versions numerically', () => {
    expect(compareVersions('CD4.0.0', 'CD3.1.0')).toBeGreaterThan(0)
    expect(compareVersions('CD3.1.0', 'CD3.1.0')).toBe(0)
    expect(compareVersions('CD3.10.0', 'CD3.9.0')).toBeGreaterThan(0)
    expect(compareVersions('CD3', 'CD3.0.1')).toBeLessThan(0)
  })
})

describe('createMemoCache', () => {
  it('shares concurrent computations and expires per value', async () => {
    let time = 0
    const cache = createMemoCache({ now: () => time })
    const compute = jest.fn(async () => 'value')

    const [first, second] = await Promise.all([
      cache.memo('key', compute, () => 1000),
      cache.memo('key', compute, () => 1000)
    ])
    expect(compute).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)

    time = 999
    await cache.memo('key', compute, () => 1000)
    expect(compute).toHaveBeenCalledTimes(1)

    time = 1000
    await cache.memo('key', compute, () => 1000)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures or zero TTLs', async () => {
    const cache = createMemoCache()
    const failing = jest.fn(async () => {
      throw new Error('offline')
    })
    await expect(cache.memo('a', failing, () => 1000)).rejects.toThrow()
    await expect(cache.memo('a', failing, () => 1000)).rejects.toThrow()
    expect(failing).toHaveBeenCalledTimes(2)

    const uncached = jest.fn(async () => 'x')
    await cache.memo('b', uncached, () => 0)
    await cache.memo('b', uncached, () => 0)
    expect(uncached).toHaveBeenCalledTimes(2)
  })

  it('evicts the oldest entry beyond its capacity', () => {
    const cache = createMemoCache({ maxEntries: 2 })
    cache.set('a', 1, 1000)
    cache.set('b', 2, 1000)
    cache.set('c', 3, 1000)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })
})

describe('createRateLimiter', () => {
  it('limits requests per client and window', () => {
    let time = 0
    const hit = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time })

    expect(hit('a').allowed).toBe(true)
    expect(hit('a').allowed).toBe(true)
    expect(hit('a')).toEqual({ allowed: false, retryAfterSeconds: 1 })
    expect(hit('b').allowed).toBe(true)

    time = 1000
    expect(hit('a').allowed).toBe(true)
  })
})
