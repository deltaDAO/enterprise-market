import { withServiceOfferingCredential } from './metadata'

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
})
