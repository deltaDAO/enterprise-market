import { sha256Hex } from './digest'
import { getNodeId } from './jwt'
import { ParsedVc, TermsCheck } from './types'

export type FetchBytes = (url: string) => Promise<Uint8Array>

const TERMS_TYPES = ['gx:TermsAndConditions', 'gx:UsageTermsAndConditions']

/**
 * Downloads the documents referenced by (usage) terms and conditions VCs and
 * compares their SHA-256 with the `gx:hash` the publisher signed.
 */
export async function checkTermsHashes(
  credentials: ParsedVc[],
  fetchBytes: FetchBytes
): Promise<TermsCheck[]> {
  const terms = credentials.filter((vc) =>
    vc.types.some((type) => TERMS_TYPES.includes(type))
  )

  return Promise.all(
    terms.map(async (vc): Promise<TermsCheck> => {
      const type = TERMS_TYPES.find((entry) => vc.types.includes(entry))
      const urlValue = vc.subject['gx:url']
      const url = typeof urlValue === 'string' ? urlValue : getNodeId(urlValue)
      const expectedHash =
        typeof vc.subject['gx:hash'] === 'string'
          ? vc.subject['gx:hash'].toLowerCase()
          : undefined
      const id = `terms-${type}`

      if (!url || !expectedHash) {
        return {
          type,
          url,
          expectedHash,
          result: { id, status: 'warn', message: 'No document URL or hash.' }
        }
      }

      try {
        const hash = await sha256Hex(await fetchBytes(url))
        return {
          type,
          url,
          expectedHash,
          result:
            hash === expectedHash
              ? { id, status: 'pass', message: 'Document hash matches.' }
              : {
                  id,
                  status: 'fail',
                  message: 'Document changed since the credential was issued.'
                }
        }
      } catch {
        return {
          type,
          url,
          expectedHash,
          result: { id, status: 'warn', message: 'Document unreachable.' }
        }
      }
    })
  )
}
