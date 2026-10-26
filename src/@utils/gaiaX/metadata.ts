import { Asset } from 'src/@types/Asset'
import { Metadata } from 'src/@types/ddo/Metadata'
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
