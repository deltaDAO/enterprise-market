import { getNodeId } from './jwt'
import { ParsedVc, TermsCheck } from './types'

// Returns the hex SHA-256 of the document at `url`
export type HashDocument = (url: string) => Promise<string>

const TERMS_TYPES = ['gx:TermsAndConditions', 'gx:UsageTermsAndConditions']
// A service offering has one T&C and one usage T&C document
export const MAX_TERMS_DOCUMENTS = 4

async function checkTermsHash(
  vc: ParsedVc,
  hashDocument: HashDocument
): Promise<TermsCheck> {
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
    const hash = await hashDocument(url)
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
}

/**
 * Downloads the documents referenced by (usage) terms and conditions VCs and
 * compares their SHA-256 with the `gx:hash` the publisher signed. Callers
 * pass only VCs whose signature was verified; at most MAX_TERMS_DOCUMENTS
 * documents are downloaded, one after another.
 */
export async function checkTermsHashes(
  credentials: ParsedVc[],
  hashDocument: HashDocument
): Promise<TermsCheck[]> {
  const terms = credentials
    .filter((vc) => vc.types.some((type) => TERMS_TYPES.includes(type)))
    .slice(0, MAX_TERMS_DOCUMENTS)

  const results: TermsCheck[] = []
  for (const vc of terms) {
    results.push(await checkTermsHash(vc, hashDocument))
  }
  return results
}
