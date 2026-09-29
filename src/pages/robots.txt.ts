import type { GetServerSideProps } from 'next'
import {
  getAbsoluteUrl,
  getRequestOrigin,
  isSiteUrlConfigured
} from '@utils/seo'

// Served dynamically rather than from public/robots.txt so the Sitemap line
// always points at the host this instance is configured for (or served from).
// Whether a page may be indexed is decided by the robots meta tag and the
// X-Robots-Tag header (next.config.js).
export function buildRobotsTxt(origin?: string | null): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${getAbsoluteUrl(
    '/sitemap.xml',
    origin
  )}\n`
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const { origin } = getRequestOrigin(req.headers)

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  // Without NEXT_PUBLIC_SITE_URL the URLs come from request headers, which a
  // client can set, so keep the response out of shared caches.
  res.setHeader(
    'Cache-Control',
    isSiteUrlConfigured() ? 'public, max-age=3600' : 'private, no-store'
  )
  res.write(buildRobotsTxt(origin))
  res.end()

  return { props: {} }
}

export default function Robots(): null {
  return null
}
