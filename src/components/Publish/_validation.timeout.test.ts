import { validationSchema as publishValidationSchema } from './_validation'
import {
  newServiceValidationSchema,
  serviceValidationSchema
} from '@components/Asset/Edit/_validation'

// @oceanprotocol/lib does not load in jsdom (setImmediate) and is not needed
// to validate the access duration field.
jest.mock('@oceanprotocol/lib', () => ({
  LoggerInstance: { error: jest.fn() }
}))

const publishTimeout = (timeout: string) =>
  publishValidationSchema.validateAt('services[0].timeout', {
    services: [{ timeout }]
  })

describe('access duration validation', () => {
  it.each(['Forever', '1 minute', '10 minutes', '1 hour', '1 year', '5400'])(
    'accepts %s in the publish and edit schemas',
    async (timeout) => {
      await expect(publishTimeout(timeout)).resolves.toBe(timeout)
      await expect(
        serviceValidationSchema.validateAt('timeout', { timeout })
      ).resolves.toBe(timeout)
      await expect(
        newServiceValidationSchema.validateAt('timeout', { timeout })
      ).resolves.toBe(timeout)
    }
  )

  it.each(['', '0', '1.5', '31556953'])(
    'rejects %p in the publish and edit schemas',
    async (timeout) => {
      await expect(publishTimeout(timeout)).rejects.toThrow()
      await expect(
        serviceValidationSchema.validateAt('timeout', { timeout })
      ).rejects.toThrow()
      await expect(
        newServiceValidationSchema.validateAt('timeout', { timeout })
      ).rejects.toThrow()
    }
  )
})
