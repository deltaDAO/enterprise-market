import { validationSchema as publishValidationSchema } from './_validation'
import { metadataValidationSchema } from '@components/Asset/Edit/_validation'

// @oceanprotocol/lib does not load in jsdom (setImmediate) and is not needed
// to validate the Gaia-X credential fields.
jest.mock('@oceanprotocol/lib', () => ({
  LoggerInstance: { error: jest.fn() }
}))

const publish = (field: string, value: unknown) =>
  publishValidationSchema.validateAt(`metadata.${field}`, {
    metadata: { [field]: value }
  })
const edit = (field: string, value: unknown) =>
  metadataValidationSchema.validateAt(field, { [field]: value })

describe('Gaia-X credential validation', () => {
  it.each([
    '',
    'https://delta-dao.com/.well-known/40_gx_digitalserviceoffering.jwt'
  ])('accepts service offering credential %p', async (value) => {
    await expect(
      publish('gaiaXServiceOfferingCredential', value)
    ).resolves.toBe(value)
    await expect(edit('gaiaXServiceOfferingCredential', value)).resolves.toBe(
      value
    )
  })

  it.each(['http://delta-dao.com/so.jwt', 'delta-dao.com/so.jwt', 'nope'])(
    'rejects service offering credential %p',
    async (value) => {
      await expect(
        publish('gaiaXServiceOfferingCredential', value)
      ).rejects.toThrow('Service offering credential must be an https URL.')
      await expect(
        edit('gaiaXServiceOfferingCredential', value)
      ).rejects.toThrow('Service offering credential must be an https URL.')
    }
  )

  it('blocks publishing and saving while the credentials are blocking', async () => {
    await expect(publish('gaiaXBlocking', false)).resolves.toBe(false)
    await expect(publish('gaiaXBlocking', true)).rejects.toThrow(
      'Fix the Gaia-X credentials before publishing.'
    )
    await expect(edit('gaiaXBlocking', true)).rejects.toThrow(
      'Fix the Gaia-X credentials before saving.'
    )
  })
})
