import { initialValues } from './_constants'
import { transformPublishFormToDdo } from './_utils'
import { FormPublishData } from './_types'

// @oceanprotocol/lib does not load in jsdom (setImmediate) and is not needed
// to build the preview DDO metadata
jest.mock('@oceanprotocol/lib', () => ({
  LoggerInstance: { error: jest.fn(), log: jest.fn(), warn: jest.fn() },
  ProviderInstance: { encrypt: jest.fn(async () => '0xencrypted') },
  getHash: jest.fn(() => 'hash'),
  ConfigHelper: class {
    getConfig() {
      return { providerUri: 'https://provider.example', chainId: 32456 }
    }
  }
}))

jest.mock('@utils/ocean', () => ({
  getOceanConfig: () => ({
    providerUri: 'https://provider.example',
    chainId: 32456,
    oceanTokenAddress: '0x0000000000000000000000000000000000000001'
  })
}))

const SERVICE_OFFERING =
  'https://delta-dao.com/.well-known/40_gx_digitalserviceoffering_noise_levels.jwt'

function values(gaiaXServiceOfferingCredential: string): FormPublishData {
  return {
    ...initialValues,
    user: { stepCurrent: 1, accountId: '0x0', chainId: 32456 },
    metadata: {
      ...initialValues.metadata,
      name: 'Noise Levels',
      description: 'Noise level data',
      providedBy:
        'https://delta-dao.com/.well-known/40_gx_legalperson_deltaDAO.jwt',
      gaiaXServiceOfferingCredential,
      gaiaXBlocking: false
    }
  } as FormPublishData
}

describe('transformPublishFormToDdo Gaia-X credentials', () => {
  it('writes the service offering credential to the reserved key', async () => {
    const ddo = await transformPublishFormToDdo(values(SERVICE_OFFERING))
    const { metadata } = ddo.credentialSubject

    expect(metadata.additionalInformation.gaiaX).toEqual({
      serviceOfferingCredential: SERVICE_OFFERING
    })
    expect(metadata.providedBy).toBe(
      'https://delta-dao.com/.well-known/40_gx_legalperson_deltaDAO.jwt'
    )
    // The form-only blocking flag is never persisted
    expect(JSON.stringify(ddo)).not.toContain('gaiaXBlocking')
  })

  it('omits the reserved key without a service offering credential', async () => {
    const ddo = await transformPublishFormToDdo(values(''))
    expect(
      ddo.credentialSubject.metadata.additionalInformation.gaiaX
    ).toBeUndefined()
  })
})
