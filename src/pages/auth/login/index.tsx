import { ReactElement, useEffect } from 'react'
import router, { useRouter } from 'next/router'
import Login from '../../../components/Auth/Login'
import Page from '../../../components/@shared/Page'
import type { AuthFeature, AuthTab } from '../../../components/Auth/constants'
import { authConfig } from '../../../config/auth.config'
import content from '../../../../content/auth/login.json'

export default function AuthLogin(): ReactElement {
  const pageRouter = useRouter()
  const { title, description, features } = content
  const typedFeatures = features as AuthFeature[]
  const initialTab =
    pageRouter.query.tab === 'signup'
      ? ('signup' as AuthTab)
      : ('login' as AuthTab)

  useEffect(() => {
    if (!authConfig.enabled) {
      pageRouter.replace('/')
    }
  }, [pageRouter])

  if (!authConfig.enabled) return null

  return (
    <Page
      title={initialTab === 'signup' ? 'Create account' : 'Sign in'}
      description={description}
      uri={router.route}
      noPageHeader
      fullWidth
    >
      <Login
        content={{ title, description, features: typedFeatures }}
        initialTab={initialTab}
      />
    </Page>
  )
}
