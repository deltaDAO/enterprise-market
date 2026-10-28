import { ComplianceConfig } from './compliance'

const DEFAULT_MAX_AGE_SECONDS = 600
const MIN_MAX_AGE_SECONDS = 60

export interface GaiaXServerConfig {
  compliance: ComplianceConfig
  // A verification result is never served older than this
  maxAgeSeconds: number
  // DIDs allowed to issue registration number VCs (LEI, VAT ID, EORI, …).
  // Only enforced when set explicitly; empty means any notary is accepted
  // with a warning (participants use notaries of other clearing houses, and
  // the GXDCH vets notaries anyway).
  trustedNotaries: string[]
  // Number of trusted reverse proxies in front of the app, used to read the
  // client IP for rate limiting from X-Forwarded-For
  trustedProxyHops: number
}

// Server-only settings, read by the /api/gaiax/verify route
export function getGaiaXServerConfig(
  env: Record<string, string | undefined> = process.env
): GaiaXServerConfig {
  const maxAge = Number(env.GAIAX_VERIFICATION_MAX_AGE_SECONDS)
  const proxyHops = Number(env.GAIAX_TRUSTED_PROXY_HOPS)

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
        : DEFAULT_MAX_AGE_SECONDS,
    trustedNotaries: (env.GAIAX_TRUSTED_NOTARIES ?? '')
      .split(',')
      .map((did) => did.trim())
      .filter(Boolean),
    trustedProxyHops:
      Number.isInteger(proxyHops) && proxyHops > 0 ? proxyHops : 0
  }
}
