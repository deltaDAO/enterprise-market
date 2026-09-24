import type { GetServerSideProps } from 'next'
import { getAbsoluteUrl, getRequestOrigin, SITEMAP_PATHS } from '@utils/seo'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildSitemap(origin?: string | null): string {
  const urls = SITEMAP_PATHS.map(
    (path) =>
      `  <url>\n    <loc>${escapeXml(
        getAbsoluteUrl(path, origin)
      )}</loc>\n  </url>`
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const { origin } = getRequestOrigin(req.headers)

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.write(buildSitemap(origin))
  res.end()

  return { props: {} }
}

export default function Sitemap(): null {
  return null
}
