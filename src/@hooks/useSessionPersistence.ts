import { useEffect } from 'react'
import { useAuth } from './useAuth'

export function useSessionPersistence() {
  const { user, logout } = useAuth()

  const refreshToken = async (refreshTokenString: string) => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshTokenString })
      })

      if (response.ok) {
        const newTokens = await response.json()
        localStorage.setItem('oidc_tokens', JSON.stringify(newTokens))
      } else {
        console.error('Token refresh failed, logging out')
        logout()
      }
    } catch (error) {
      console.error('Token refresh error:', error)
    }
  }

  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      const tokens = localStorage.getItem('oidc_tokens')
      if (tokens) {
        try {
          const tokenData = JSON.parse(tokens)
          const expiresIn = tokenData.expires_in
          const refreshTokenValue = tokenData.refresh_token
          if (expiresIn && expiresIn < 60 && refreshTokenValue) {
            refreshToken(refreshTokenValue)
          }
        } catch (e) {
          console.error('Session check error:', e)
        }
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [user, logout])

  return null
}
