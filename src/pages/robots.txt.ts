import type { GetServerSideProps } from 'next'
import { getAbsoluteUrl, getRequestOrigin } from '@utils/seo'

// Served dynamically rather than from public/robots.txt so the Sitemap line
// always points at the host this instance is configured for (or served from).
// Whether a page may be indexed is decided by the robots meta tag.
export function buildRobotsTxt(origin?: string | null): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${getAbsoluteUrl(
    '/sitemap.xml',
    origin
  )}\n`
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const { origin } = getRequestOrigin(req.headers)

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(buildRobotsTxt(origin))
  res.end()

  return { props: {} }
}

export default function Robots(): null {
  return null
}
