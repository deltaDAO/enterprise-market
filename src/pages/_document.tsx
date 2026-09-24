import Document, {
  DocumentContext,
  DocumentInitialProps,
  Html,
  Head,
  Main,
  NextScript
} from 'next/document'
import DocumentHead from '@shared/Page/Seo/DocumentHead'
import { getRequestOrigin } from '@utils/seo'

interface MyDocumentProps extends DocumentInitialProps {
  requestOrigin: string | null
  requestHostname: string | null
}

class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<MyDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx)

    // Only available when the page is rendered per request (dev, SSR pages);
    // statically optimized pages fall back to NEXT_PUBLIC_SITE_URL/siteUrl.
    const { origin, hostname } = getRequestOrigin(ctx.req?.headers)

    return {
      ...initialProps,
      requestOrigin: origin,
      requestHostname: hostname
    }
  }

  render() {
    const { __NEXT_DATA__, dangerousAsPath, requestOrigin, requestHostname } =
      this.props

    return (
      <Html lang="en">
        <Head>
          <script src="/runtime-config.js" />
          <DocumentHead
            page={__NEXT_DATA__.page}
            asPath={dangerousAsPath}
            pageProps={__NEXT_DATA__.props?.pageProps}
            requestOrigin={requestOrigin}
            requestHostname={requestHostname}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
