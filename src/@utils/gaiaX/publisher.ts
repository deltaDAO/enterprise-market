import { GaiaXVerification, GaiaXVerifyRequest } from './types'

/**
 * The DID a DDO is issued (signed) by: the selected SSI DID when SSI is
 * enabled, the wallet address otherwise. Used both for signing and for the
 * Gaia-X binding checks, so they can never drift apart.
 */
export function getPublisherDid({
  ssiEnabled,
  selectedDid,
  walletAddress
}: {
  ssiEnabled: boolean
  selectedDid?: string
  walletAddress?: string
}): string | undefined {
  return (ssiEnabled ? selectedDid : walletAddress) || undefined
}

/**
 * Re-verifies the Gaia-X credentials right before publishing or saving, with
 * the DID the DDO is about to be signed with (it may have changed since the
 * form step). Returns the blocking message, if any. A failing verification
 * service does not block, consistent with the GXDCH outage policy.
 */
export async function getGaiaXBlockingReason(
  request: GaiaXVerifyRequest
): Promise<string | undefined> {
  if (!request.participantUrl && !request.serviceOfferingUrl) return undefined
  try {
    const response = await fetch('/api/gaiax/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    const body = await response.json()
    const result = body?.result as GaiaXVerification | undefined
    if (!result?.blocking) return undefined
    const check = [
      ...(result.participant?.checks ?? []),
      ...(result.serviceOffering?.checks ?? []),
      ...result.binding
    ].find((entry) => entry.status === 'fail' && entry.blocking)
    return check?.message ?? 'The Gaia-X credentials failed a blocking check.'
  } catch {
    return undefined
  }
}
