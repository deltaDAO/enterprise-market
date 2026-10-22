import { ComplianceConfig } from './compliance'

const DEFAULT_MAX_AGE_SECONDS = 600
const MIN_MAX_AGE_SECONDS = 60

export interface GaiaXServerConfig {
  compliance: ComplianceConfig
  // A verification result is never served older than this
  maxAgeSeconds: number
}

// Server-only settings, read by the /api/gaiax/verify route
export function getGaiaXServerConfig(
  env: Record<string, string | undefined> = process.env
): GaiaXServerConfig {
  const maxAge = Number(env.GAIAX_VERIFICATION_MAX_AGE_SECONDS)

  return {
    compliance: {
      baseUrl: env.GAIAX_COMPLIANCE_URL || undefined,
      label: env.GAIAX_COMPLIANCE_LABEL || 'standard-compliance',
      minRulesVersion: env.GAIAX_MIN_RULES_VERSION || undefined
    },
    maxAgeSeconds:
      Number.isFinite(maxAge) && maxAge > 0
        ? Math.min(
            Math.max(maxAge, MIN_MAX_AGE_SECONDS),
            DEFAULT_MAX_AGE_SECONDS
          )
        : DEFAULT_MAX_AGE_SECONDS
  }
}
