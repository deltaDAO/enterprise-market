/**
 * @jest-environment node
 */
// Regression tests for the security review of the verification core (#8)
import {
  createDeps,
  createIssuer,
  sign,
  TestIssuer,
  vc,
  vp
} from '../../../.jest/__fixtures__/gaiaX'
import { SignJWT } from 'jose'
import { checkBinding } from './binding'
import { createMemoCache } from './cache'
import { requestCompliance } from './compliance'
import { digestSri } from './digest'
import { buildGraph, MAX_RESOLVED_NODES, resolveReferences } from './graph'
import { MAX_CREDENTIALS_PER_VP, parseVc, parseVp } from './jwt'
import { MAX_TERMS_DOCUMENTS } from './termsHash'
import { JsonObject, ParsedVc } from './types'
import {
  isCovered,
  minimizeDidDocument,
  MAX_DIDS_PER_VERIFICATION,
  verifyGaiaXCredentials
} from './verify'

const GXDCH = {
  baseUrl: 'https://gxdch.example/v2',
  label: 'standard-compliance'
}

describe('resolveReferences', () => {
  // k subjects that each reference all k subjects used to expand to ~k³ nodes
  const subjects = (count: number): ParsedVc[] =>
    Array.from({ length: count }, (_, index) => {
      const id = `https://example.com/${index}#cs`
      const subject: JsonObject = {
        id,
        'schema:name': `Subject ${index}`,
        'gx:links': Array.from({ length: count }, (__, target) => ({
          id: `https://example.com/${target}#cs`
        }))
      }
      return {
        jwt: '',
        header: {},
        payload: {},
        types: ['VerifiableCredential', 'gx:Thing'],
        subject,
        subjectId: id
      }
    })

  it('stays bounded for densely linked subjects', () => {
    const credentials = subjects(MAX_CREDENTIALS_PER_VP)
    const started = Date.now()
    const resolved = resolveReferences(
      credentials[0].subject,
      buildGraph(credentials)
    )
    const size = JSON.stringify(resolved).length

    expect(Date.now() - started).toBeLessThan(1000)
    expect(size).toBeLessThan(MAX_RESOLVED_NODES * 1000)
  })

  it('expands each subject once and marks repeated references', () => {
    const credentials = subjects(3)
    const resolved = resolveReferences(
      {
        first: { id: credentials[1].subjectId },
        again: { id: credentials[1].subjectId }
      },
      buildGraph(credentials)
    ) as Record<string, JsonObject>

    expect(Array.isArray(resolved.first['gx:links'])).toBe(true)
    expect(resolved.again).toEqual({
      id: credentials[1].subjectId,
      $credential: { id: undefined, types: ['gx:Thing'], repeated: true }
    })
  })

  // Review PoC: one large subject + large evidence referenced ~500 times
  it('keeps the serialized result proportional to the input', () => {
    const big = 'x'.repeat(200_000)
    const target: ParsedVc = {
      jwt: '',
      header: {},
      payload: {
        evidence: { 'gx:evidenceURL': 'https://e.example', blob: big }
      },
      types: ['VerifiableCredential', 'gx:LeiCode'],
      subject: { id: 'https://example.com/big#cs', 'schema:leiCode': big },
      subjectId: 'https://example.com/big#cs'
    }
    const legalPerson = {
      id: 'https://example.com/lp#cs',
      'gx:registrationNumber': Array.from({ length: 500 }, () => ({
        id: target.subjectId
      }))
    }
    const inputSize = JSON.stringify([target, legalPerson]).length

    const output = JSON.stringify(
      resolveReferences(legalPerson, buildGraph([target]))
    )

    expect(output.length).toBeLessThan(inputSize * 2)
    expect(output).not.toContain('"blob"')
  })
})

describe('parseVp limits', () => {
  it('rejects presentations with too many credentials', async () => {
    const issuer = await createIssuer('provider.example')
    const credential = await sign(
      vc('https://provider.example/a.json', 'gx:Thing', issuer.did, {}),
      issuer
    )
    const jwt = await vp(
      issuer,
      Array(MAX_CREDENTIALS_PER_VP + 1).fill(credential)
    )
    expect(() => parseVp(jwt)).toThrow(
      expect.objectContaining({ code: 'TOO_LARGE' })
    )
  })
})

describe('notary exemption', () => {
  let publisher: TestIssuer
  let notary: TestIssuer
  let rogueNotary: TestIssuer

  beforeAll(async () => {
    publisher = await createIssuer('provider.example')
    notary = await createIssuer('gxdch.example', ['notary', 'v2'])
    rogueNotary = await createIssuer('rogue.example', ['notary'])
  })

  async function participantVp({
    notaryIssuer = notary,
    referenced = true,
    types = ['gx:LeiCode']
  }: {
    notaryIssuer?: TestIssuer
    referenced?: boolean
    types?: string[]
  } = {}) {
    const leiId = 'https://provider.example/lei.json'
    const lei = await sign(
      {
        ...vc(leiId, types[0], notaryIssuer.did, {
          'schema:leiCode': 'LEI123'
        }),
        type: ['VerifiableCredential', ...types]
      },
      notaryIssuer
    )
    const legalPerson = await sign(
      vc('https://provider.example/lp.json', 'gx:LegalPerson', publisher.did, {
        'schema:name': 'Provider GmbH',
        'gx:registrationNumber': referenced ? [{ id: `${leiId}#cs` }] : []
      }),
      publisher
    )
    return parseVp(await vp(publisher, [legalPerson, lei]))
  }

  const bind = async (options = {}) =>
    checkBinding({
      publisherDid: publisher.did,
      participant: await participantVp(options),
      trustedNotaries: [notary.did]
    })

  it('accepts a referenced registration number from a trusted notary', async () => {
    const results = await bind()
    expect(results.every((check) => check.status === 'pass')).toBe(true)
  })

  it('rejects a registration number from an untrusted notary', async () => {
    const results = await bind({ notaryIssuer: rogueNotary })
    expect(
      results.find((check) => check.id === 'Participant-vc-issuers')
    ).toMatchObject({
      status: 'fail',
      blocking: true
    })
  })

  it('rejects a registration number the participant does not reference', async () => {
    const results = await bind({ referenced: false })
    expect(
      results.find((check) => check.id === 'Participant-vc-issuers')?.status
    ).toBe('fail')
  })

  it('rejects a mixed-type credential issued by a notary', async () => {
    const results = await bind({ types: ['gx:LeiCode', 'gx:LegalPerson'] })
    expect(
      results.find((check) => check.id === 'Participant-vc-issuers')?.status
    ).toBe('fail')
  })

  it('accepts any notary with a warning when no allowlist is configured', async () => {
    // e.g. the Gaia-X lab notary from the ticket's example data
    const labNotary = await createIssuer(
      'registrationnumber.notary.lab.gaia-x.eu',
      ['development']
    )
    const results = checkBinding({
      publisherDid: publisher.did,
      participant: await participantVp({ notaryIssuer: labNotary }),
      trustedNotaries: []
    })

    expect(
      results.find((check) => check.id === 'Participant-vc-issuers')?.status
    ).toBe('pass')
    expect(
      results.find((check) => check.id === 'notary-allowlist')
    ).toMatchObject({
      status: 'warn',
      message: expect.stringContaining(labNotary.did)
    })
    expect(results.some((check) => check.blocking)).toBe(false)
  })
})

describe('compliance rules version', () => {
  it('passes or fails against GAIAX_MIN_RULES_VERSION', async () => {
    const publisher = await createIssuer('provider.example')
    const gxdch = await createIssuer('gxdch.example', ['v2'])
    const vpJwt = await vp(publisher, [
      await sign(
        vc(
          'https://provider.example/lp.json',
          'gx:LegalPerson',
          publisher.did,
          {}
        ),
        publisher
      )
    ])
    const label = await sign(
      {
        type: ['VerifiableCredential', 'gx:LabelCredential'],
        id: 'urn:uuid:test-id',
        issuer: gxdch.did,
        validFrom: '2026-10-22T15:59:00Z',
        validUntil: '2027-01-20T00:00:00Z',
        credentialSubject: {
          id: 'urn:uuid:test-id#cs',
          'gx:rulesVersion': 'CD4.0.0',
          'gx:compliantCredentials': await Promise.all(
            parseVp(vpJwt).credentials.map(async (credential) => ({
              id: credential.id,
              digestSRI: await digestSri(credential.payload)
            }))
          )
        }
      },
      gxdch
    )
    const run = (minRulesVersion: string) =>
      requestCompliance(
        vpJwt,
        parseVp(vpJwt).credentials,
        {
          baseUrl: 'https://gxdch.example/v2',
          label: 'standard-compliance',
          minRulesVersion
        },
        {
          postVp: async () => ({ status: 201, body: label }),
          fetchJson: async () => gxdch.didDocument,
          randomId: () => 'test-id',
          now: () => new Date('2026-10-22T16:00:00Z')
        }
      )

    const sufficient = await run('CD4.0.0')
    expect(sufficient.status).toBe('pass')
    expect(
      sufficient.checks.find((check) => check.id === 'compliance-rules-version')
        ?.status
    ).toBe('pass')

    const tooOld = await run('CD5.0.0')
    expect(tooOld.status).toBe('fail')
    expect(
      tooOld.checks.find((check) => check.id === 'compliance-rules-version')
    ).toMatchObject({
      status: 'fail',
      message: 'Rules CD4.0.0 older than required CD5.0.0.'
    })
  })
})

describe('minimizeDidDocument', () => {
  it('keeps only the verification keys', () => {
    expect(
      minimizeDidDocument({
        id: 'did:web:example.com',
        service: [{ blob: 'x'.repeat(10_000) }],
        verificationMethod: [
          {
            id: 'did:web:example.com#key-1',
            type: 'JsonWebKey2020',
            controller: 'did:web:example.com',
            publicKeyJwk: { kty: 'RSA', n: 'abc', e: 'AQAB' },
            junk: 'x'.repeat(10_000)
          }
        ]
      })
    ).toEqual({
      id: 'did:web:example.com',
      verificationMethod: [
        {
          id: 'did:web:example.com#key-1',
          publicKeyJwk: { kty: 'RSA', n: 'abc', e: 'AQAB' }
        }
      ]
    })
    expect(minimizeDidDocument('nope')).toEqual({})
  })
})

describe('verifyGaiaXCredentials hardening', () => {
  const URL = 'https://provider.example/vp.jwt'
  let publisher: TestIssuer
  let gxdch: TestIssuer

  beforeAll(async () => {
    publisher = await createIssuer('provider.example')
    gxdch = await createIssuer('gxdch.example', ['v2'])
  })

  async function legalPerson(subject: JsonObject = {}) {
    return sign(
      vc('https://provider.example/lp.json', 'gx:LegalPerson', publisher.did, {
        'schema:name': 'Provider GmbH',
        ...subject
      }),
      publisher
    )
  }

  async function complianceFor(
    vpJwt: string,
    { id = 'urn:uuid:test-id', validUntil = '2027-01-20T00:00:00Z' } = {}
  ) {
    const vcs = parseVp(vpJwt).credentials
    return sign(
      {
        type: ['VerifiableCredential', 'gx:LabelCredential'],
        id,
        issuer: gxdch.did,
        validFrom: '2026-10-22T15:59:00Z',
        validUntil,
        credentialSubject: {
          id: `${id}#cs`,
          'gx:labelLevel': 'SC',
          'gx:rulesVersion': 'CD4.0.0',
          'gx:compliantCredentials': await Promise.all(
            vcs.map(async (credential) => ({
              id: credential.id,
              'gx:credentialType': credential.types[1],
              digestSRI: await digestSri(credential.payload)
            }))
          )
        }
      },
      gxdch
    )
  }

  function deps(
    vpJwt: string,
    compliance: string | undefined,
    extra: Record<string, unknown> = {}
  ) {
    return createDeps(
      {
        texts: { [URL]: vpJwt },
        documents: {
          [publisher.didDocumentUrl]: publisher.didDocument,
          [gxdch.didDocumentUrl]: gxdch.didDocument
        },
        compliance: compliance
          ? { [vpJwt]: { status: 201, body: compliance } }
          : {}
      },
      { compliance: GXDCH, ...extra }
    )
  }

  it('fails a credential without an issuer', async () => {
    const payload = vc(
      'https://provider.example/lp.json',
      'gx:LegalPerson',
      publisher.did,
      {}
    )
    delete payload.issuer
    // No issuer in the payload and no `iss` in the header either
    const unsigned = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'PS256', typ: 'vc+jwt', kid: publisher.kid })
      .sign(publisher.privateKey)
    const jwt = await vp(publisher, [unsigned])
    const result = await verifyGaiaXCredentials(
      { participantUrl: URL, publisherDid: publisher.did },
      deps(jwt, undefined)
    )

    expect(result.participant.credentials[0].signature).toMatchObject({
      status: 'fail',
      message: 'Credential has no issuer.'
    })
    expect(result.participant.error.message).toContain('no valid signature')
  })

  it('rejects a compliance credential issued for another request', async () => {
    const jwt = await vp(publisher, [await legalPerson()])
    const result = await verifyGaiaXCredentials(
      { participantUrl: URL, publisherDid: publisher.did },
      deps(jwt, await complianceFor(jwt, { id: 'urn:uuid:replayed' }))
    )

    expect(result.compliance.status).toBe('fail')
    expect(
      result.compliance.checks.find((check) => check.id === 'compliance-id')
        ?.status
    ).toBe('fail')
  })

  it('rejects an expired compliance credential', async () => {
    const jwt = await vp(publisher, [await legalPerson()])
    const result = await verifyGaiaXCredentials(
      { participantUrl: URL, publisherDid: publisher.did },
      deps(
        jwt,
        await complianceFor(jwt, { validUntil: '2026-10-01T00:00:00Z' })
      )
    )

    expect(
      result.compliance.checks.find(
        (check) => check.id === 'compliance-validity'
      )?.status
    ).toBe('fail')
  })

  it(`resolves at most ${MAX_DIDS_PER_VERIFICATION} DID documents`, async () => {
    const issuers = await Promise.all(
      Array.from({ length: MAX_DIDS_PER_VERIFICATION + 2 }, (_, index) =>
        createIssuer(`issuer${index}.example`)
      )
    )
    const credentials = await Promise.all(
      issuers.map((issuer, index) =>
        sign(
          vc(
            `https://issuer${index}.example/x.json`,
            'gx:Thing',
            issuer.did,
            {}
          ),
          issuer
        )
      )
    )
    const jwt = await vp(publisher, [await legalPerson(), ...credentials])
    const fetchJson = jest.fn(async () => ({}))

    await verifyGaiaXCredentials(
      { participantUrl: URL, publisherDid: publisher.did },
      deps(jwt, undefined, { fetchJson })
    )

    expect(fetchJson.mock.calls.length).toBeLessThanOrEqual(
      MAX_DIDS_PER_VERIFICATION
    )
  })

  it('downloads only a few T&C documents, and only signed ones', async () => {
    const dsoId = 'https://provider.example/dso.json'
    const terms = await Promise.all(
      Array.from({ length: MAX_TERMS_DOCUMENTS + 3 }, (_, index) =>
        sign(
          vc(
            `https://provider.example/tc${index}.json`,
            'gx:TermsAndConditions',
            publisher.did,
            {
              'gx:url': { id: `https://docs.example/tc${index}.pdf` },
              'gx:hash': 'ab'.repeat(32)
            }
          ),
          publisher
        )
      )
    )
    const forged = await sign(
      vc(
        'https://provider.example/forged.json',
        'gx:TermsAndConditions',
        publisher.did,
        {
          'gx:url': { id: 'https://victim.example/huge.bin' },
          'gx:hash': 'cd'.repeat(32)
        }
      ),
      await createIssuer('provider.example')
    )
    const dso = await sign(
      vc(dsoId, 'gx:DigitalServiceOffering', publisher.did, {
        'gx:providedBy': { id: 'https://provider.example/lp.json#cs' }
      }),
      publisher
    )
    const jwt = await vp(publisher, [
      forged,
      await legalPerson(),
      dso,
      ...terms
    ])
    const fetchBytes = jest.fn(async () => new Uint8Array([1]))

    await verifyGaiaXCredentials(
      { serviceOfferingUrl: URL, publisherDid: publisher.did },
      deps(jwt, undefined, { fetchBytes })
    )

    expect(fetchBytes).toHaveBeenCalledTimes(MAX_TERMS_DOCUMENTS)
    expect(fetchBytes).not.toHaveBeenCalledWith(
      'https://victim.example/huge.bin'
    )
  })

  it('checks a participant VP on its own when the DSO result does not cover it', async () => {
    const PARTICIPANT_URL = 'https://provider.example/participant.jwt'
    const dso = await sign(
      vc(
        'https://provider.example/dso.json',
        'gx:DigitalServiceOffering',
        publisher.did,
        {
          'gx:providedBy': { id: 'https://provider.example/lp.json#cs' }
        }
      ),
      publisher
    )
    // Same id, different content: a re-issued LegalPerson
    const dsoVp = await vp(publisher, [await legalPerson(), dso])
    const participantJwt = await vp(publisher, [
      await legalPerson({ 'schema:description': 'Re-issued' })
    ])
    const postVp = jest.fn(async (_url: string, body: string) => ({
      status: 201,
      body: await complianceFor(body)
    }))

    const result = await verifyGaiaXCredentials(
      {
        participantUrl: PARTICIPANT_URL,
        serviceOfferingUrl: URL,
        publisherDid: publisher.did
      },
      createDeps(
        {
          texts: { [URL]: dsoVp, [PARTICIPANT_URL]: participantJwt },
          documents: {
            [publisher.didDocumentUrl]: publisher.didDocument,
            [gxdch.didDocumentUrl]: gxdch.didDocument
          }
        },
        { compliance: GXDCH, postVp }
      )
    )

    expect(postVp).toHaveBeenCalledTimes(2)
    expect(isCovered(result.participant.credentials, result.compliance)).toBe(
      false
    )
    expect(
      isCovered(result.participant.credentials, result.participantCompliance)
    ).toBe(true)
    expect(result.status).toBe('verified')
  })

  it('needs one GXDCH call when the DSO VP covers the participant', async () => {
    const PARTICIPANT_URL = 'https://provider.example/participant.jwt'
    const lp = await legalPerson()
    const dso = await sign(
      vc(
        'https://provider.example/dso.json',
        'gx:DigitalServiceOffering',
        publisher.did,
        {
          'gx:providedBy': { id: 'https://provider.example/lp.json#cs' }
        }
      ),
      publisher
    )
    const dsoVp = await vp(publisher, [lp, dso])
    const postVp = jest.fn(async (_url: string, body: string) => ({
      status: 201,
      body: await complianceFor(body)
    }))

    const result = await verifyGaiaXCredentials(
      {
        participantUrl: PARTICIPANT_URL,
        serviceOfferingUrl: URL,
        publisherDid: publisher.did
      },
      createDeps(
        {
          texts: { [URL]: dsoVp, [PARTICIPANT_URL]: await vp(publisher, [lp]) },
          documents: {
            [publisher.didDocumentUrl]: publisher.didDocument,
            [gxdch.didDocumentUrl]: gxdch.didDocument
          }
        },
        { compliance: GXDCH, postVp }
      )
    )

    expect(postVp).toHaveBeenCalledTimes(1)
    expect(result.participantCompliance).toBeUndefined()
  })

  it('caches the GXDCH result by presentation, not by request', async () => {
    const jwt = await vp(publisher, [await legalPerson()])
    const cache = createMemoCache()
    const compliance = await complianceFor(jwt)
    const postVp = jest.fn(async () => ({ status: 201, body: compliance }))

    const run = (assetDid: string, publisherDid = publisher.did) =>
      verifyGaiaXCredentials(
        { participantUrl: URL, publisherDid, assetDid },
        deps(jwt, compliance, { cache, postVp })
      )

    const first = await run('did:ope:1')
    await run('did:ope:2')
    const foreign = await run('did:ope:3', 'did:web:someone-else.example')

    expect(postVp).toHaveBeenCalledTimes(1)
    expect(first.status).toBe('verified')
    // Binding is still computed for every request
    expect(foreign.blocking).toBe(true)
  })

  it('retries an unreachable GXDCH soon instead of caching the outage', async () => {
    const jwt = await vp(publisher, [await legalPerson()])
    let time = Date.parse('2026-10-22T16:00:00Z')
    const cache = createMemoCache({ now: () => time })
    const postVp = jest.fn(async () => {
      throw new Error('offline')
    })
    const run = () =>
      verifyGaiaXCredentials(
        { participantUrl: URL, publisherDid: publisher.did },
        deps(jwt, undefined, { cache, postVp, now: () => new Date(time) })
      )

    await run()
    await run()
    expect(postVp).toHaveBeenCalledTimes(1)

    time += 31_000
    await run()
    expect(postVp).toHaveBeenCalledTimes(2)
  })
})

describe('matchDigests', () => {
  it('matches each VC with the same id by its own digest', async () => {
    const issuer = await createIssuer('provider.example')
    const a = parseVc(
      await sign(
        vc('https://provider.example/x.json', 'gx:Thing', issuer.did, { v: 1 }),
        issuer
      )
    )
    const b = parseVc(
      await sign(
        vc('https://provider.example/x.json', 'gx:Thing', issuer.did, { v: 2 }),
        issuer
      )
    )
    const { matchDigests } = await import('./compliance')
    const result = await matchDigests(
      [{ id: a.id, digestSRI: await digestSri(a.payload) }],
      [a, b]
    )
    expect(result[0].matched).toBe(true)
  })
})
