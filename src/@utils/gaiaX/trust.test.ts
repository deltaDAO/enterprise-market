import verification from '../../../.jest/__fixtures__/gaiaX/verification.json'
import { getGaiaXVerifyRequest } from './metadata'
import {
  getCredentialTrust,
  getOverallTrust,
  isBoundToPublisher
} from './trust'
import { GaiaXVerification } from './types'
import { Asset } from 'src/@types/Asset'

// Live result: verified participant, service offering VP without a DSO VC
const result = verification as unknown as GaiaXVerification

describe('trust review fixes', () => {
  it('requires every displayed credential to match by id and digest', () => {
    // Same id as the certified LegalPerson, different content
    const swapped: GaiaXVerification = {
      ...result,
      participant: {
        ...result.participant,
        credentials: result.participant.credentials.map((credential) =>
          credential.types.includes('gx:LegalPerson')
            ? { ...credential, digest: 'sha256-not-what-the-gxdch-saw' }
            : credential
        )
      }
    }
    expect(getCredentialTrust(swapped, swapped.participant, false)).toEqual({
      state: 'unverified',
      message:
        'Not verified: credential is not covered by the compliance result.'
    })
  })

  it('accepts a participant certified by its own GXDCH check', () => {
    const reissued = result.participant.credentials.map((credential) =>
      credential.types.includes('gx:LegalPerson')
        ? { ...credential, digest: 'sha256-reissued' }
        : credential
    )
    const ownCompliance = {
      ...result.compliance,
      compliantCredentials: reissued.map((credential) => ({
        id: credential.id,
        digestSRI: credential.digest,
        matched: true
      }))
    }
    const withOwnCheck: GaiaXVerification = {
      ...result,
      participant: { ...result.participant, credentials: reissued },
      participantCompliance: ownCompliance
    }
    expect(
      getCredentialTrust(withOwnCheck, withOwnCheck.participant, false).state
    ).toBe('verified')

    const failedOwnCheck: GaiaXVerification = {
      ...withOwnCheck,
      participantCompliance: {
        status: 'fail',
        message: 'Not compliant: VC expired',
        checks: []
      }
    }
    expect(
      getCredentialTrust(failedOwnCheck, failedOwnCheck.participant, false)
    ).toEqual({
      state: 'failed',
      message: 'Not verified: Not compliant: VC expired'
    })
  })

  it('verifies the participant by its own check when the DSO check fails', () => {
    const dsoFailed: GaiaXVerification = {
      ...result,
      compliance: {
        status: 'fail',
        message: 'Not compliant: DSO rejected',
        checks: []
      },
      participantCompliance: result.compliance
    }
    expect(
      getCredentialTrust(dsoFailed, dsoFailed.participant, false).state
    ).toBe('verified')
  })

  it('never trusts credentials of a publisher without did:web', () => {
    const unbound: GaiaXVerification = {
      ...result,
      binding: [{ id: 'publisher-did', status: 'warn', message: 'No did:web.' }]
    }
    expect(isBoundToPublisher(unbound)).toBe(false)
    expect(isBoundToPublisher({ ...result, blocking: true })).toBe(false)
    expect(isBoundToPublisher(result)).toBe(true)
  })
})

describe('getCredentialTrust', () => {
  it('verifies a fresh participant covered by the compliance credential', () => {
    expect(getCredentialTrust(result, result.participant, false)).toEqual({
      state: 'verified',
      message: 'Verified by the Gaia-X Digital Clearing House (CD4.0.0).'
    })
  })

  it('never shows a checkmark for a stale result', () => {
    const trust = getCredentialTrust(result, result.participant, true)
    expect(trust.state).toBe('unverified')
    expect(trust.message).toContain('older than 10 minutes')
    expect(trust.message).toContain('Last successful check at')
  })

  it('fails a presentation without the expected credential', () => {
    expect(getCredentialTrust(result, result.serviceOffering, false)).toEqual({
      state: 'failed',
      message:
        'The presentation does not contain a service offering credential (gx:DigitalServiceOffering).'
    })
  })

  it('hides all badges on a DID mismatch', () => {
    const mismatch: GaiaXVerification = {
      ...result,
      binding: [
        {
          id: 'Participant-vp-issuer',
          status: 'fail',
          blocking: true,
          message: 'DID mismatch: credential not issued by the publisher.'
        }
      ]
    }
    expect(getCredentialTrust(mismatch, result.participant, false)).toEqual({
      state: 'failed',
      message: 'DID mismatch: credential not issued by the publisher.'
    })
  })

  it('does not verify without a reachable clearing house', () => {
    const outage: GaiaXVerification = {
      ...result,
      compliance: {
        status: 'unreachable',
        message: 'Gaia-X Digital Clearing House unreachable: timeout',
        checks: []
      }
    }
    expect(getCredentialTrust(outage, result.participant, false).state).toBe(
      'unverified'
    )
  })

  it('does not verify credentials of a publisher without did:web', () => {
    const noDidWeb: GaiaXVerification = {
      ...result,
      binding: [{ id: 'publisher-did', status: 'warn', message: 'No did:web.' }]
    }
    expect(getCredentialTrust(noDidWeb, result.participant, false)).toEqual({
      state: 'unverified',
      message: 'Not verified: No did:web.'
    })
  })
})

describe('getOverallTrust', () => {
  it('reports the worst credential state', () => {
    expect(getOverallTrust(result, false).state).toBe('failed')
    expect(
      getOverallTrust({ ...result, serviceOffering: undefined }, false).state
    ).toBe('verified')
  })
})

describe('getGaiaXVerifyRequest', () => {
  const ddo = (metadata: Record<string, unknown>) =>
    ({
      id: 'did:ope:123',
      issuer: 'did:web:delta-dao.com',
      credentialSubject: { metadata }
    } as unknown as Asset)

  it('reads the participant and the reserved service offering field', () => {
    expect(
      getGaiaXVerifyRequest(
        ddo({
          providedBy: 'https://delta-dao.com/lp.jwt',
          additionalInformation: {
            gaiaX: { serviceOfferingCredential: 'https://delta-dao.com/so.jwt' }
          }
        })
      )
    ).toEqual({
      participantUrl: 'https://delta-dao.com/lp.jwt',
      serviceOfferingUrl: 'https://delta-dao.com/so.jwt',
      publisherDid: 'did:web:delta-dao.com',
      assetDid: 'did:ope:123'
    })
  })

  it('ignores missing and non-https credentials', () => {
    expect(getGaiaXVerifyRequest(ddo({ providedBy: '' }))).toBeUndefined()
    expect(
      getGaiaXVerifyRequest(ddo({ providedBy: 'delta-dao.com' }))
    ).toBeUndefined()
    expect(getGaiaXVerifyRequest(undefined)).toBeUndefined()
  })
})
