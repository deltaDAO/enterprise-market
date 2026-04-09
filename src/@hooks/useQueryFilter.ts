import queryFilterConfig from '../../queryFilter.config.cjs'

type FilterValue = string | number | boolean | string[] | number[]

interface MatchWrapper {
  match: string
}

type NestedFilterConfig = {
  [key: string]: FilterValue | MatchWrapper | NestedFilterConfig
}

function isMatchWrapper(value: unknown): value is MatchWrapper {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'match' in value &&
    Object.keys(value).length === 1 &&
    typeof (value as MatchWrapper).match === 'string'
  )
}

function isFilterValue(value: unknown): value is FilterValue {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true
  if (
    Array.isArray(value) &&
    value.every((v) => typeof v === 'string' || typeof v === 'number')
  )
    return true
  return false
}

/**
 * Flatten a nested filter config object into an array of Elasticsearch
 * FilterTerm entries that can be injected into a `bool.filter` clause.
 *
 * { indexedMetadata: { nft: { owner: '0x…' } } }
 *   → [{ term: { 'indexedMetadata.nft.owner': '0x…' } }]
 *
 * { credentialSubject: { metadata: { tags: { match: 'SENSE' } } } }
 *   → [{ match: { 'credentialSubject.metadata.tags': 'SENSE' } }]
 */
function flattenConfig(obj: NestedFilterConfig, prefix = ''): FilterTerm[] {
  const terms: FilterTerm[] = []

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (isMatchWrapper(value)) {
      terms.push({ match: { [path]: value.match } })
    } else if (isFilterValue(value)) {
      if (Array.isArray(value)) {
        terms.push({ terms: { [path]: value } })
      } else {
        terms.push({ term: { [path]: value } })
      }
    } else if (typeof value === 'object' && value !== null) {
      terms.push(...flattenConfig(value as NestedFilterConfig, path))
    }
  }

  return terms
}

const queryFilterTerms: FilterTerm[] = flattenConfig(
  queryFilterConfig as NestedFilterConfig
)

export function getQueryFilterTerms(): FilterTerm[] {
  return queryFilterTerms
}

export function isQueryFilterEnabled(): boolean {
  return queryFilterTerms.length > 0
}

export function useQueryFilter() {
  return {
    queryFilterTerms,
    isQueryFilterEnabled: isQueryFilterEnabled(),
    getQueryFilterTerms
  }
}
