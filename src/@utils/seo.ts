import removeMarkdown from 'remove-markdown'
import siteContent from '../../content/site.json'
import {
  siteUrl as configuredSiteUrl,
  allowIndexing
} from '../../app.config.cjs'

export const META_DESCRIPTION_MAX_LENGTH = 160
export const SHARE_IMAGE_WIDTH = 1200
export const SHARE_IMAGE_HEIGHT = 630
export const THEME_COLOR = '#2450ec'

function normalizeOrigin(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null
  try {
    const { origin } = new URL(url.trim())
    return origin === 'null' ? null : origin
  } catch {
    return null
  }
}

/**
 * The origin configured for this deployment: NEXT_PUBLIC_SITE_URL first, then
 * siteUrl from content/site.json. This is what decides whether the current host
 * may be indexed.
 */
export function getConfiguredSiteUrl(): string {
  return (
    normalizeOrigin(configuredSiteUrl) ||
    normalizeOrigin(siteContent.siteUrl) ||
    ''
  )
}

/**
 * The origin to build absolute URLs (canonical, og:url, og:image) from.
 * NEXT_PUBLIC_SITE_URL wins; otherwise the origin the page is actually served
 * from (window.location in the browser, the request host on the server), so a
 * wrong hardcoded host never leaks. siteUrl from content/site.json is the last
 * resort.
 */
export function getSiteOrigin(requestOrigin?: string | null): string {
  const fromEnv = normalizeOrigin(configuredSiteUrl)
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined') {
    const fromWindow = normalizeOrigin(window.location?.origin)
    if (fromWindow) return fromWindow
  }

  return (
    normalizeOrigin(requestOrigin) || normalizeOrigin(siteContent.siteUrl) || ''
  )
}

/** Absolute URL for a path on this site; query string and hash are dropped. */
export function getAbsoluteUrl(
  path: string,
  requestOrigin?: string | null
): string {
  const cleanPath = (path || '/').split(/[?#]/)[0] || '/'
  const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`
  // Remove trailing slash from all URLs
  return `${getSiteOrigin(requestOrigin)}${normalizedPath}`.replace(/\/$/, '')
}

/**
 * Whether search engines may index the page served from `hostname`: only when
 * it is the host of the configured site URL, or when
 * NEXT_PUBLIC_ALLOW_INDEXING=true.
 */
export function isIndexingAllowed(hostname?: string | null): boolean {
  if (String(allowIndexing).toLowerCase() === 'true') return true
  if (!hostname) return false

  const configured = getConfiguredSiteUrl()
  if (!configured) return false

  try {
    return new URL(configured).hostname === hostname.toLowerCase()
  } catch {
    return false
  }
}

/** Plain-text meta description, truncated on a word boundary. */
export function toMetaDescription(
  text?: string | null,
  maxLength = META_DESCRIPTION_MAX_LENGTH
): string {
  if (!text || typeof text !== 'string') return ''

  const plain = removeMarkdown(text).replace(/\s+/g, ' ').trim()
  if (plain.length <= maxLength) return plain

  const cut = plain.slice(0, maxLength - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const truncated = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut

  return `${truncated.replace(/[\s.,;:!?-]+$/, '')}…`
}

/** Page title with the site name suffix, never repeating the site name. */
export function getPageTitle(title?: string | null, isHome = false): string {
  const { siteTitle, siteTagline } = siteContent
  const cleanTitle = typeof title === 'string' ? title.trim() : ''

  if (isHome || cleanTitle === siteTitle) return siteTitle
  if (!cleanTitle) return `${siteTitle} — ${siteTagline}`
  return `${cleanTitle} - ${siteTitle}`
}

/** Paths listed in /sitemap.xml. */
export const SITEMAP_PATHS = [
  '/',
  '/search',
  '/publish/1',
  '/bookmarks',
  '/privacy/terms',
  '/privacy/privacy-policy',
  '/privacy/cookie-policy',
  '/privacy/lifecycle-state-policy'
]

type HeaderValue = string | string[] | undefined

function firstHeaderValue(value: HeaderValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.split(',')[0]?.trim() || undefined
}

/**
 * Origin and hostname of an incoming request, honouring reverse-proxy headers.
 * Only used as a fallback when NEXT_PUBLIC_SITE_URL is not set.
 */
export function getRequestOrigin(headers?: Record<string, HeaderValue>): {
  origin: string | null
  hostname: string | null
} {
  const host =
    firstHeaderValue(headers?.['x-forwarded-host']) ||
    firstHeaderValue(headers?.host)
  if (!host) return { origin: null, hostname: null }

  const hostname = host.replace(/:\d+$/, '').toLowerCase()
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  const proto =
    firstHeaderValue(headers?.['x-forwarded-proto']) ||
    (isLocal ? 'http' : 'https')

  return { origin: `${proto}://${host}`, hostname }
}
