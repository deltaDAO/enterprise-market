/**
 * @jest-environment node
 */
import {
  createDeps,
  createIssuer,
  DELTA_DAO_DID,
  fixture,
  PARTICIPANT_URL,
  SERVICE_OFFERING_URL,
  sign,
  tamper,
  TestIssuer,
  vc,
  vp
} from '../../../.jest/__fixtures__/gaiaX'
import { matchDigests } from './compliance'
import { digestSri } from './digest'
import { asArray, parseVc, parseVp } from './jwt'
import { CheckResult, SOURCE_KEY } from './types'
import { verifyGaiaXCredentials } from './verify'

const participantVp = fixture('participant.vp.jwt').trim()
const serviceOfferingVp = fixture('serviceOffering.vp.jwt').trim()
const participantCompliance = fixture('participant.compliance.jwt').trim()
const serviceOfferingCompliance = fixture(
  'serviceOffering.compliance.jwt'
).trim()

const realDeps = (overrides = {}) =>
  createDeps(
    {
      texts: {
        [PARTICIPANT_URL]: participantVp,
        [SERVICE_OFFERING_URL]: serviceOfferingVp
      },
      compliance: {
        [participantVp]: { status: 201, body: participantCompliance },
        [serviceOfferingVp]: { status: 201, body: serviceOfferingCompliance }
      }
    },
    {
      // The recorded GXDCH responses were issued for this request id
      randomId: () => '3b1f0c2e-ddao-906-spike-participant',
      trustedNotaries: ['did:web:www.delta-dao.com:notary:v2'],
      ...overrides
    }
  )

const failed = (checks: CheckResult[]) =>
  checks.filter((check) => check.status === 'fail')

describe('verifyGaiaXCredentials with the deltaDAO example credentials', () => {
  it('verifies the participant credential end to end', async () => {
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: DELTA_DAO_DID },
      realDeps()
    )

    expect(result.status).toBe('verified')
    expect(result.blocking).toBe(false)
    expect(failed(result.participant.checks)).toEqual([])
    expect(result.participant.credentials).toHaveLength(5)
    expect(result.participant.subject['schema:name']).toBe('deltaDAO AG')

    expect(result.compliance).toMatchObject({
      status: 'pass',
      issuer: 'did:web:www.delta-dao.com:compliance:v2',
      labelLevel: 'SC',
      engineVersion: '2.15.0',
      rulesVersion: 'CD4.0.0'
    })
    expect(result.compliance.compliantCredentials).toHaveLength(5)
    expect(
      result.compliance.compliantCredentials.every((entry) => entry.matched)
    ).toBe(true)
  })

  it('resolves registration number references with their notary credential', async () => {
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: DELTA_DAO_DID },
      realDeps()
    )
    const numbers = result.participant.subject[
      'gx:registrationNumber'
    ] as Record<string, unknown>[]

    expect(
      numbers.map((entry) => entry['gx:vatID'] ?? entry['gx:eori'])
    ).toEqual(['DE346013532', 'DE390726175076766', undefined])
    expect(numbers[2]['schema:leiCode']).toBe('391200FJBNU0YW987L26')
    expect(numbers[0][SOURCE_KEY]).toMatchObject({
      issuer: 'did:web:www.delta-dao.com:notary:v2',
      evidence: { 'gx:evidenceOf': 'gx:VatID' }
    })
  })

  it('matches every digestSRI of the service offering compliance credential', async () => {
    const result = await matchDigests(
      asArray(
        parseVc(serviceOfferingCompliance).subject['gx:compliantCredentials']
      ),
      parseVp(serviceOfferingVp).credentials
    )

    expect(result).toHaveLength(13)
    expect(result.filter((entry) => !entry.matched)).toEqual([])
  })

  it('reports a service offering presentation without a DSO credential', async () => {
    const result = await verifyGaiaXCredentials(
      {
        participantUrl: PARTICIPANT_URL,
        serviceOfferingUrl: SERVICE_OFFERING_URL,
        publisherDid: DELTA_DAO_DID
      },
      realDeps()
    )

    // The published service offering VP currently lacks the DSO VC itself
    expect(result.serviceOffering.error.code).toBe('WRONG_TYPE')
    expect(result.status).toBe('failed')
    expect(result.blocking).toBe(false)
  })

  it('blocks credentials of another publisher', async () => {
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: 'did:web:example.com' },
      realDeps()
    )

    expect(result.status).toBe('failed')
    expect(result.blocking).toBe(true)
    expect(failed(result.binding).map((check) => check.id)).toEqual([
      'Participant-vp-issuer',
      'Participant-vc-issuers'
    ])
  })

  it('warns when the publisher has no did:web', async () => {
    const result = await verifyGaiaXCredentials(
      {
        participantUrl: PARTICIPANT_URL,
        publisherDid: '0x4C84a36fCDb7Bc750294A7f3B5ad5CA8F74C4A52'
      },
      realDeps()
    )

    expect(result.status).toBe('warning')
    expect(result.blocking).toBe(false)
    expect(result.binding).toEqual([
      expect.objectContaining({ id: 'publisher-did', status: 'warn' })
    ])
  })

  it('fails expired credentials without blocking', async () => {
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: DELTA_DAO_DID },
      realDeps({ now: () => new Date('2026-10-23T08:00:00Z') })
    )

    expect(result.status).toBe('failed')
    expect(result.blocking).toBe(false)
    expect(
      result.participant.checks.find((check) => check.id === 'vc-validity')
        .status
    ).toBe('fail')
  })

  it('blocks a tampered credential', async () => {
    const tampered = tamper(participantVp, (payload) => {
      payload.validUntil = '2099-01-01T00:00:00Z'
    })
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: DELTA_DAO_DID },
      createDeps({ texts: { [PARTICIPANT_URL]: tampered } })
    )

    expect(result.blocking).toBe(true)
    expect(
      result.participant.checks.find((check) => check.id === 'vp-signature')
    ).toMatchObject({ status: 'fail', message: 'Invalid signature.' })
  })

  it('shows an unreachable clearing house as a warning', async () => {
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: DELTA_DAO_DID },
      createDeps({ texts: { [PARTICIPANT_URL]: participantVp } })
    )

    expect(result.compliance.status).toBe('unreachable')
    expect(result.status).toBe('warning')
  })

  it('treats a rejected presentation as not compliant', async () => {
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: DELTA_DAO_DID },
      createDeps({
        texts: { [PARTICIPANT_URL]: participantVp },
        compliance: {
          [participantVp]: {
            status: 409,
            body: JSON.stringify({ message: ['VC expired'] })
          }
        }
      })
    )

    expect(result.compliance).toMatchObject({
      status: 'fail',
      message: 'Not compliant: VC expired'
    })
    expect(result.blocking).toBe(false)
  })

  it('reports unreadable documents', async () => {
    const result = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL, publisherDid: DELTA_DAO_DID },
      createDeps({ texts: { [PARTICIPANT_URL]: '<html>Not found</html>' } })
    )
    expect(result.participant.error.code).toBe('NOT_JWT')

    const missing = await verifyGaiaXCredentials(
      { participantUrl: PARTICIPANT_URL },
      createDeps({})
    )
    expect(missing.participant.error.code).toBe('UNREACHABLE')
    expect(missing.compliance.status).toBe('skipped')
  })
})

describe('verifyGaiaXCredentials with a service offering', () => {
  const ASSET_DID = 'did:ope:1234'
  let publisher: TestIssuer
  let attacker: TestIssuer
  let gxdch: TestIssuer

  beforeAll(async () => {
    publisher = await createIssuer('provider.example')
    attacker = await createIssuer('attacker.example')
    gxdch = await createIssuer('gxdch.example', ['v2'])
  })

  async function buildServiceOffering(
    issuer: TestIssuer,
    {
      providedBy,
      scope = ASSET_DID
    }: { providedBy?: string; scope?: string } = {}
  ) {
    const base = `https://${issuer.did.split(':')[2]}`
    const legalPerson = await sign(
      vc(`${base}/lp.json`, 'gx:LegalPerson', issuer.did, {
        'schema:name': 'Provider GmbH'
      }),
      issuer
    )
    const contact = await sign(
      vc(`${base}/contact.json`, 'gx:ContactInformation', issuer.did, {
        'gx:email': 'hello@provider.example'
      }),
      issuer
    )
    const dso = await sign(
      vc(`${base}/dso.json`, 'gx:DigitalServiceOffering', issuer.did, {
        'schema:name': 'Weather API',
        'gx:providedBy': { id: providedBy ?? `${base}/lp.json#cs` },
        'gx:providerContactInformation': { id: `${base}/contact.json#cs` },
        'gx:serviceScope': `Data service ${scope}`
      }),
      issuer
    )
    return { jwt: await vp(issuer, [legalPerson, contact, dso]) }
  }

  async function complianceFor(vpJwt: string, signer = gxdch) {
    const vcs = JSON.parse(
      Buffer.from(vpJwt.split('.')[1], 'base64url').toString()
    ).verifiableCredential.map((entry: { id: string }) =>
      JSON.parse(
        Buffer.from(
          entry.id.split(',')[1].split('.')[1],
          'base64url'
        ).toString()
      )
    )
    return sign(
      {
        type: ['VerifiableCredential', 'gx:LabelCredential'],
        id: 'urn:uuid:test-id',
        issuer: signer.did,
        validFrom: '2026-10-22T15:59:00Z',
        validUntil: '2027-01-20T00:00:00Z',
        credentialSubject: {
          id: 'urn:uuid:test-id#cs',
          'gx:labelLevel': 'SC',
          'gx:engineVersion': '2.15.0',
          'gx:rulesVersion': 'CD4.0.0',
          'gx:validatedCriteria': ['https://docs.gaia-x.eu/#DS1.1.1'],
          'gx:compliantCredentials': await Promise.all(
            vcs.map(async (payload: { id: string; type: string[] }) => ({
              id: payload.id,
              'gx:credentialType': payload.type[1],
              digestSRI: await digestSri(payload)
            }))
          )
        }
      },
      signer
    )
  }

  async function run(
    serviceOffering: string,
    {
      publisherDid = publisher.did,
      compliance,
      complianceSigner
    }: {
      publisherDid?: string
      compliance?: string
      complianceSigner?: TestIssuer
    } = {}
  ) {
    const url = 'https://provider.example/dso.jwt'
    return verifyGaiaXCredentials(
      { serviceOfferingUrl: url, publisherDid, assetDid: ASSET_DID },
      createDeps(
        {
          texts: { [url]: serviceOffering },
          documents: {
            [publisher.didDocumentUrl]: publisher.didDocument,
            [attacker.didDocumentUrl]: attacker.didDocument,
            [gxdch.didDocumentUrl]: gxdch.didDocument
          },
          compliance: {
            [serviceOffering]: {
              status: 201,
              body:
                compliance ??
                (await complianceFor(serviceOffering, complianceSigner))
            }
          }
        },
        {
          compliance: {
            baseUrl: 'https://gxdch.example/v2',
            label: 'standard-compliance'
          }
        }
      )
    )
  }

  it('verifies a service offering and resolves its references', async () => {
    const { jwt } = await buildServiceOffering(publisher)
    const result = await run(jwt)

    expect(result.status).toBe('verified')
    expect(failed(result.binding)).toEqual([])
    expect(result.serviceOffering.subject['gx:providedBy']).toMatchObject({
      'schema:name': 'Provider GmbH'
    })
    expect(
      result.serviceOffering.subject['gx:providerContactInformation']
    ).toMatchObject({ 'gx:email': 'hello@provider.example' })
    expect(result.compliance.compliantCredentials).toHaveLength(3)
  })

  it('blocks a service offering provided by another participant', async () => {
    const { jwt } = await buildServiceOffering(publisher, {
      providedBy: 'https://someone.else/lp.json#cs'
    })
    const result = await run(jwt)

    expect(result.blocking).toBe(true)
    expect(
      result.binding.find((check) => check.id === 'provided-by').status
    ).toBe('fail')
  })

  it('warns when the service scope does not reference the asset', async () => {
    const { jwt } = await buildServiceOffering(publisher, {
      scope: 'did:ope:other'
    })
    const result = await run(jwt)

    expect(result.status).toBe('warning')
    expect(
      result.binding.find((check) => check.id === 'service-scope').status
    ).toBe('warn')
  })

  it('blocks a foreign credential set linked by another publisher', async () => {
    const { jwt } = await buildServiceOffering(attacker)
    const result = await run(jwt)

    expect(result.blocking).toBe(true)
  })

  it('blocks credentials signed with a key of another DID', async () => {
    const forged = await sign(
      vc(
        'https://provider.example/dso.json',
        'gx:DigitalServiceOffering',
        publisher.did,
        {
          'gx:providedBy': { id: 'https://provider.example/lp.json#cs' }
        }
      ),
      attacker
    )
    const result = await run(await vp(publisher, [forged]))

    expect(result.blocking).toBe(true)
    expect(
      result.serviceOffering.checks.find(
        (check) => check.id === 'vc-signatures'
      ).message
    ).toContain('Signed by did:web:attacker.example')
  })

  it('rejects compliance credentials from another clearing house', async () => {
    const { jwt } = await buildServiceOffering(publisher)
    const result = await run(jwt, { complianceSigner: attacker })

    expect(result.compliance.status).toBe('fail')
    expect(
      result.compliance.checks.find((check) => check.id === 'compliance-issuer')
        .status
    ).toBe('fail')
  })

  it('rejects compliance credentials with mismatching digests', async () => {
    const { jwt } = await buildServiceOffering(publisher)
    const other = await buildServiceOffering(publisher, { scope: 'changed' })
    const result = await run(jwt, {
      compliance: await complianceFor(other.jwt)
    })

    expect(
      result.compliance.compliantCredentials.filter((entry) => !entry.matched)
    ).toHaveLength(1)
    expect(result.compliance.status).toBe('fail')
  })
})
