import { useEffect, ReactNode } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@hooks/useAuth'

interface AuthGuardProps {
  children: ReactNode
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, authEnabled } = useAuth()
  const router = useRouter()

  const isPublicRoute = (): boolean => {
    const path = router.asPath.split('?')[0]

    const exactPublicPaths = [
      '/',
      '/auth/login',
      '/auth/callback',
      '/about',
      '/terms',
      '/privacy',
      '/imprint',
      '/cookie-settings'
    ]

    if (exactPublicPaths.includes(path)) {
      return true
    }

    if (path.startsWith('/privacy/')) {
      return true
    }

    if (path.startsWith('/auth/')) {
      return true
    }

    return false
  }

  const isPublic = isPublicRoute()
  const shouldRedirectToLogin =
    authEnabled && !isLoading && !isAuthenticated && !isPublic

  useEffect(() => {
    if (shouldRedirectToLogin) {
      router.replace(
        `/auth/login?callbackUrl=${encodeURIComponent(router.asPath)}`
      )
    }
  }, [router, router.asPath, shouldRedirectToLogin])

  if (!authEnabled) {
    return <>{children}</>
  }

  if ((isLoading && !isPublic) || shouldRedirectToLogin) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#0a4b70',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}
        />
      </div>
    )
  }

  return <>{children}</>
}
