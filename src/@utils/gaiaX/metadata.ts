import { Asset } from 'src/@types/Asset'
import { AdditionalInformation, Metadata } from 'src/@types/ddo/Metadata'
import { isObject } from './jwt'
import { GaiaXVerifyRequest } from './types'

// Reserved DDO metadata location of the service offering credential URL:
// metadata.additionalInformation.gaiaX.serviceOfferingCredential
export const GAIAX_METADATA_KEY = 'gaiaX'

function asHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.startsWith('https://') ? trimmed : undefined
}

export function getServiceOfferingCredentialUrl(
  metadata?: Metadata
): string | undefined {
  const gaiaX = metadata?.additionalInformation?.[GAIAX_METADATA_KEY]
  return isObject(gaiaX)
    ? asHttpsUrl(gaiaX.serviceOfferingCredential)
    : undefined
}

/**
 * Sets the service offering credential URL in additionalInformation, or
 * removes it when the URL is cleared (a plain spread of the existing metadata
 * would otherwise keep the old value). Other keys under `gaiaX` (from later
 * versions or other tools) are kept; `gaiaX` is dropped only when empty.
 */
export function withServiceOfferingCredential(
  additionalInformation: AdditionalInformation | undefined,
  url: string | undefined
): AdditionalInformation {
  const { [GAIAX_METADATA_KEY]: previous, ...rest } =
    additionalInformation ?? {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { serviceOfferingCredential: _old, ...otherGaiaXKeys } = isObject(
    previous
  )
    ? previous
    : {}
  const trimmed = url?.trim()
  const gaiaX = trimmed
    ? { ...otherGaiaXKeys, serviceOfferingCredential: trimmed }
    : otherGaiaXKeys

  return Object.keys(gaiaX).length > 0
    ? { ...rest, [GAIAX_METADATA_KEY]: gaiaX as AdditionalInformation[string] }
    : rest
}

/**
 * Builds the verification request for an asset: the participant credential
 * (`metadata.providedBy`) and service offering credential URLs, bound to the
 * publisher DID (`issuer`) and the asset DID. Undefined without credentials.
 */
export function getGaiaXVerifyRequest(
  ddo?: Asset
): GaiaXVerifyRequest | undefined {
  const metadata = ddo?.credentialSubject?.metadata
  const participantUrl = asHttpsUrl(metadata?.providedBy)
  const serviceOfferingUrl = getServiceOfferingCredentialUrl(metadata)
  if (!participantUrl && !serviceOfferingUrl) return undefined

  return {
    participantUrl,
    serviceOfferingUrl,
    publisherDid: ddo.issuer || undefined,
    assetDid: ddo.id || undefined
  }
}
