import type { GetServerSideProps } from 'next'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@hooks/useAuth'
import { authConfig } from '../../../config/auth.config'

export default function AuthCallback() {
  const router = useRouter()
  const { checkSession } = useAuth()
  const { code, error } = router.query

  useEffect(() => {
    const run = async () => {
      await checkSession()
    }

    if (code) {
      run().catch((callbackError) => {
        console.error('OAuth callback error:', callbackError)
        router.replace('/auth/login?error=auth_failed')
      })
    } else if (error) {
      console.error('OAuth error:', error)
      router.replace('/auth/login?error=auth_failed')
    }
  }, [code, error, checkSession, router])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#0a4b70',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }}
        />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <p>Completing authentication...</p>
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async () => {
  if (!authConfig.enabled) {
    return {
      redirect: {
        destination: '/',
        permanent: false
      }
    }
  }

  return {
    props: {}
  }
}
