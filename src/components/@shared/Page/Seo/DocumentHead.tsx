import { ReactElement } from 'react'
import siteContent from '../../../../../content/site.json'
import publishContent from '../../../../../content/publish/index.json'
import bookmarksContent from '../../../../../content/pages/bookmarks.json'
import searchContent from '../../../../../content/pages/search.json'
import profileContent from '../../../../../content/pages/profile.json'
import notFoundContent from '../../../../../content/pages/404.json'
import loginContent from '../../../../../content/auth/login.json'
import {
  getAbsoluteUrl,
  getPageTitle,
  getSiteOrigin,
  isIndexingAllowed,
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  THEME_COLOR,
  toMetaDescription
} from '@utils/seo'

interface PageMeta {
  title?: string
  description?: string
}

// Server-side defaults per route. `_app` renders nothing until it has mounted
// (to keep wagmi hydration safe), so these tags are all a crawler without
// JavaScript sees. The client-side <Seo /> replaces them after mount.
const routeMeta: Record<string, PageMeta> = {
  '/': {},
  '/search': searchContent,
  '/publish/[step]': publishContent,
  '/bookmarks': bookmarksContent,
  '/profile': profileContent,
  '/profile/[account]': profileContent,
  '/404': notFoundContent,
  '/auth/login': {
    title: 'Sign in',
    description: loginContent.description
  }
}

function getPageMeta(
  page: string,
  pageProps?: { frontmatter?: PageMeta }
): PageMeta {
  // Markdown pages (imprint, terms, privacy/*) carry their own front matter
  if (pageProps?.frontmatter?.title) {
    return {
      title: pageProps.frontmatter.title,
      description: pageProps.frontmatter.description
    }
  }
  return routeMeta[page] || {}
}

/**
 * Static fallback head for the server-rendered document. Every tag carries
 * `data-next-head`, so next/head treats it as its own and swaps it for the
 * matching tag rendered by the client <Seo /> instead of duplicating it.
 * Rendered as a component (not direct children of <Head>) so Next does not
 * warn about <title> in _document.
 */
export default function DocumentHead({
  page,
  asPath,
  pageProps,
  requestOrigin,
  requestHostname
}: {
  page: string
  asPath?: string
  pageProps?: { frontmatter?: PageMeta }
  requestOrigin?: string | null
  requestHostname?: string | null
}): ReactElement {
  const meta = getPageMeta(page, pageProps)
  const isHome = page === '/'
  const title = getPageTitle(meta.title, isHome)
  const description =
    toMetaDescription(meta.description) ||
    toMetaDescription(siteContent.siteDescription)
  // Statically optimized dynamic routes render with the route pattern
  // (e.g. /publish/[step]) as path, and without NEXT_PUBLIC_SITE_URL a static
  // page has no origin either. Rather than emit a wrong absolute URL, leave
  // canonical / og:url / images to the client <Seo /> in those cases.
  const origin = getSiteOrigin(requestOrigin)
  const isRoutePattern = /\[[^\]]+\]/.test(asPath || '')
  const canonical =
    origin && !isRoutePattern
      ? getAbsoluteUrl(page === '/404' ? '/' : asPath || '/', requestOrigin)
      : ''
  const image = origin
    ? getAbsoluteUrl(siteContent.siteImage, requestOrigin)
    : ''
  const imageAlt = siteContent.siteImageAlt || siteContent.siteTitle
  const robots = isIndexingAllowed(requestHostname)
    ? 'index,follow'
    : 'noindex,nofollow'

  return (
    <>
      <title>{title}</title>
      <meta name="robots" content={robots} data-next-head="" />
      <meta name="description" content={description} data-next-head="" />
      {canonical && <link rel="canonical" href={canonical} data-next-head="" />}
      <link rel="icon" href="/favicon.ico" sizes="any" data-next-head="" />
      <link
        rel="icon"
        href="/icon.svg"
        type="image/svg+xml"
        data-next-head=""
      />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/apple-touch-icon.png"
        data-next-head=""
      />
      <link rel="manifest" href="/site.webmanifest" data-next-head="" />
      <meta name="theme-color" content={THEME_COLOR} data-next-head="" />

      <meta property="og:type" content="website" data-next-head="" />
      <meta
        property="og:site_name"
        content={siteContent.siteTitle}
        data-next-head=""
      />
      <meta property="og:title" content={title} data-next-head="" />
      <meta property="og:description" content={description} data-next-head="" />
      {canonical && (
        <meta property="og:url" content={canonical} data-next-head="" />
      )}
      {image && (
        <>
          <meta property="og:image" content={image} data-next-head="" />
          <meta
            property="og:image:width"
            content={String(SHARE_IMAGE_WIDTH)}
            data-next-head=""
          />
          <meta
            property="og:image:height"
            content={String(SHARE_IMAGE_HEIGHT)}
            data-next-head=""
          />
          <meta property="og:image:alt" content={imageAlt} data-next-head="" />
        </>
      )}

      <meta
        name="twitter:card"
        content="summary_large_image"
        data-next-head=""
      />
      <meta name="twitter:title" content={title} data-next-head="" />
      <meta
        name="twitter:description"
        content={description}
        data-next-head=""
      />
      {image && (
        <>
          <meta name="twitter:image" content={image} data-next-head="" />
          <meta name="twitter:image:alt" content={imageAlt} data-next-head="" />
        </>
      )}
    </>
  )
}
