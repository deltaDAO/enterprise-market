// Global query filters applied to all Aquarius/Elasticsearch metadata queries.
// Use nested objects matching the Elasticsearch document structure.
// Leaf values can be:
//   - a single string/number/boolean  → translated to a "term" filter
//   - an array of strings/numbers     → translated to a "terms" filter
//   - an object with { match: value } → translated to a case-insensitive "match" filter
//
// Examples:
//   indexedMetadata: { nft: { owner: '0x123…' } }                  → term filter
//   indexedMetadata: { nft: { state: [0, 1] } }                    → terms filter
//   credentialSubject: { metadata: { tags: { match: 'SENSE' } } }  → match filter
//
module.exports = {
  credentialSubject: {
    metadata: {
      tags: { match: 'SENSE' }
    }
  }
}
