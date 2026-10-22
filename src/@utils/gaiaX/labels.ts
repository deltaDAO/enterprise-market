// Readable labels for Gaia-X ontology (v25.x), schema.org and vCard terms
const FIELD_LABELS: Record<string, string> = {
  'schema:name': 'Name',
  'schema:description': 'Description',
  'schema:leiCode': 'LEI code',
  'gx:registrationNumber': 'Registration numbers',
  'gx:legalAddress': 'Legal address',
  'gx:headquartersAddress': 'Headquarters address',
  'gx:parentOrganizationOf': 'Parent organization of',
  'gx:subOrganisationOf': 'Sub-organization of',
  'gx:vatID': 'VAT ID',
  'gx:eori': 'EORI',
  'gx:country': 'Country',
  'gx:countryCode': 'Country code',
  'gx:countryName': 'Country',
  'gx:subdivisionCountryCode': 'Subdivision code',
  'vcard:street-address': 'Street',
  'vcard:postal-code': 'Postal code',
  'vcard:locality': 'City',
  'vcard:region': 'Region',
  gaiaxTermsAndConditions: 'Gaia-X terms & conditions (hash)',
  'gx:providedBy': 'Provided by',
  'gx:version': 'Version',
  'gx:launchDate': 'Launch date',
  'gx:provisionType': 'Provision type',
  'gx:keyword': 'Keywords',
  'gx:keywords': 'Keywords',
  'gx:serviceScope': 'Service scope',
  'gx:servicePolicy': 'Service policy',
  'gx:serviceOfferingTermsAndConditions': 'Service terms & conditions',
  'gx:termsAndConditions': 'Terms & conditions',
  'gx:usageTermsAndConditions': 'Usage terms & conditions',
  'gx:dataProtectionRegime': 'Data protection regime',
  'gx:legalDocuments': 'Legal documents',
  'gx:legalDocument': 'Legal document',
  'gx:dataPortability': 'Data portability',
  'gx:dataAccountExport': 'Data account export',
  'gx:providerContactInformation': 'Provider contact',
  'gx:dataProtectionRegulationMeasures': 'Data protection measures',
  'gx:url': 'URL',
  'gx:hash': 'Hash',
  'gx:mimeTypes': 'Formats',
  'gx:governingLawCountries': 'Governing law',
  'gx:involvedParties': 'Involved parties',
  'gx:resource': 'Resource',
  'gx:formats': 'Formats',
  'gx:means': 'Means',
  'gx:deletionMethods': 'Deletion methods',
  'gx:deletionTimeframe': 'Deletion timeframe',
  'gx:documentations': 'Documentation',
  'gx:pricing': 'Pricing',
  'gx:requestType': 'Request type',
  'gx:accessType': 'Access type',
  'gx:formatType': 'Format',
  'gx:email': 'Email',
  'gx:phoneNumber': 'Phone',
  'gx:postalAddress': 'Postal address'
}

export const TYPE_LABELS: Record<string, string> = {
  'gx:LegalPerson': 'Participant',
  'gx:DigitalServiceOffering': 'Service offering',
  'gx:Issuer': 'Gaia-X terms & conditions acceptance',
  'gx:LeiCode': 'LEI code',
  'gx:VatID': 'VAT ID',
  'gx:EORI': 'EORI',
  'gx:EUID': 'EUID',
  'gx:TaxID': 'Tax ID',
  'gx:LocalRegistrationNumber': 'Local registration number',
  'gx:Address': 'Address',
  'gx:ContactInformation': 'Contact information',
  'gx:TermsAndConditions': 'Terms & conditions',
  'gx:UsageTermsAndConditions': 'Usage terms & conditions',
  'gx:DataPortability': 'Data portability',
  'gx:DataAccountExport': 'Data account export',
  'gx:LegalDocument': 'Legal document',
  'gx:DataProtectionRegulationMeasures': 'Data protection measures',
  'gx:LabelCredential': 'Gaia-X compliance'
}

// Keys that describe the node itself rather than its content
export const HIDDEN_KEYS = ['@id', 'id', 'type', '@type', '@context']

function humanize(key: string): string {
  const name = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
  const words = name
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function getFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanize(key)
}

export function getTypeLabel(type?: string | string[]): string | undefined {
  const types = Array.isArray(type) ? type : [type]
  const known = types.find((entry) => entry && TYPE_LABELS[entry])
  if (known) return TYPE_LABELS[known]
  const gx = types.find((entry) => entry?.startsWith('gx:'))
  return gx ? humanize(gx) : undefined
}

// Field order within a card: known fields in label order, then the rest
const FIELD_ORDER = Object.keys(FIELD_LABELS)

export function sortFields(keys: string[]): string[] {
  const rank = (key: string) => {
    const index = FIELD_ORDER.indexOf(key)
    return index === -1 ? FIELD_ORDER.length : index
  }
  return [...keys].sort((a, b) => rank(a) - rank(b))
}
