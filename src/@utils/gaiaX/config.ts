import { ComplianceConfig } from './compliance'
import { urlToDidWeb } from './didWeb'

const DEFAULT_MAX_AGE_SECONDS = 600
const MIN_MAX_AGE_SECONDS = 60

export interface GaiaXServerConfig {
  compliance: ComplianceConfig
  // A verification result is never served older than this
  maxAgeSeconds: number
  // DIDs allowed to issue registration number VCs (LEI, VAT ID, EORI, …)
  trustedNotaries: string[]
}

/**
 * GXDCH deployments run their notary next to the compliance service, e.g.
 * did:web:www.delta-dao.com:compliance:v2 → did:web:www.delta-dao.com:notary:v2.
 * Deployments with another layout set GAIAX_TRUSTED_NOTARIES explicitly.
 */
function deriveNotaryDid(complianceUrl?: string): string | undefined {
  if (!complianceUrl) return undefined
  const did = urlToDidWeb(complianceUrl)
  return did.includes(':compliance')
    ? did.replace(':compliance', ':notary')
    : undefined
}

// Server-only settings, read by the /api/gaiax/verify route
export function getGaiaXServerConfig(
  env: Record<string, string | undefined> = process.env
): GaiaXServerConfig {
  const maxAge = Number(env.GAIAX_VERIFICATION_MAX_AGE_SECONDS)
  const complianceUrl = env.GAIAX_COMPLIANCE_URL || undefined
  const configuredNotaries = (env.GAIAX_TRUSTED_NOTARIES ?? '')
    .split(',')
    .map((did) => did.trim())
    .filter(Boolean)
  const derivedNotary = deriveNotaryDid(complianceUrl)

  return {
    compliance: {
      baseUrl: complianceUrl,
      label: env.GAIAX_COMPLIANCE_LABEL || 'standard-compliance',
      minRulesVersion: env.GAIAX_MIN_RULES_VERSION || undefined
    },
    maxAgeSeconds:
      Number.isFinite(maxAge) && maxAge > 0
        ? Math.min(
            Math.max(maxAge, MIN_MAX_AGE_SECONDS),
            DEFAULT_MAX_AGE_SECONDS
          )
        : DEFAULT_MAX_AGE_SECONDS,
    trustedNotaries:
      configuredNotaries.length > 0
        ? configuredNotaries
        : derivedNotary
        ? [derivedNotary]
        : []
  }
}
