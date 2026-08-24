import posthog from 'posthog-js'
import { getRuntimeConfig } from './runtimeConfig'

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com'

let initialized = false

/**
 * Whether analytics is configured for this deployment. False on self-hosted
 * instances that have set neither NEXT_PUBLIC_POSTHOG_KEY nor
 * NEXT_PUBLIC_PLAUSIBLE_DOMAIN, so the UI can avoid claiming analytics is
 * active when it is not.
 */
export function isAnalyticsConfigured(): boolean {
  const { NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_PLAUSIBLE_DOMAIN } =
    getRuntimeConfig()
  return Boolean(NEXT_PUBLIC_POSTHOG_KEY || NEXT_PUBLIC_PLAUSIBLE_DOMAIN)
}

/**
 * Initialise product analytics. Runs once, client-side only, and fires on load.
 *
 * The provider is selected by which credentials are present: PostHog via
 * NEXT_PUBLIC_POSTHOG_KEY (mirroring the snippet used on oceanenterprise.io),
 * Plausible via NEXT_PUBLIC_PLAUSIBLE_DOMAIN. Setting both enables both.
 *
 * No-ops when neither is set — the default for self-hosted deployments, so a
 * self-hoster sends nothing unless they explicitly opt in. Values are read from
 * the runtime config so they work on both the Vercel build and the self-hosted
 * Docker image (env injected at boot).
 */
export function initAnalytics(): void {
  if (typeof window === 'undefined' || initialized) return

  const {
    NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  } = getRuntimeConfig()

  if (!NEXT_PUBLIC_POSTHOG_KEY && !NEXT_PUBLIC_PLAUSIBLE_DOMAIN) return

  if (NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
      // Matches the marketing site. Enables SPA-aware pageviews
      // (capture_pageview: 'history_change') and injects external scripts into
      // <head> to avoid Next.js SSR hydration errors.
      defaults: '2026-01-30'
    })
  }

  if (NEXT_PUBLIC_PLAUSIBLE_DOMAIN) {
    import('@plausible-analytics/tracker').then(({ init }) =>
      init({ domain: NEXT_PUBLIC_PLAUSIBLE_DOMAIN })
    )
  }

  initialized = true
}
