import { useAuthStore, User } from './stores/authStore'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
import { authConfig } from '../config/auth.config'
import React from 'react'
import {
  clearPendingAuthMode,
  clearPendingCallbackUrl,
  setPendingAuthMode,
  getPendingCallbackUrl,
  setPendingCallbackUrl,
  type PendingAuthMode
} from '@utils/authFlow'

const OIDC_LOGOUT_PENDING_KEY = 'oidc_logout_pending'
const OIDC_LOGOUT_STATE_KEY = 'oidc_logout_state'
const OIDC_LOGOUT_STARTED_AT_KEY = 'oidc_logout_started_at'
const OIDC_LOGOUT_RETURN_FALLBACK_MS = 5000

const getEndpoints = (issuer: string) => {
  const match = issuer.match(/(.*\/application\/o\/)[^/]+\/?$/)
  const baseUrl = match
    ? match[1].replace(/\/$/, '')
    : issuer.replace(/\/[^/]+?\/?$/, '')
  return {
    authorize: `${baseUrl}/authorize/`,
    token: `${baseUrl}/token/`,
    endSession: `${issuer.replace(/\/$/, '')}/end-session/`
  }
}

class OIDCProvider {
  private getConfig() {
    return authConfig.oidc
  }

  async signup(): Promise<void> {
    this.clearSessionData()

    const config = this.getConfig()
    const endpoints = getEndpoints(config.issuer)
    const codeVerifier = this.generateCodeVerifier()
    const codeChallenge = await this.generateCodeChallenge(codeVerifier)
    sessionStorage.setItem('oidc_pkce_code_verifier', codeVerifier)

    const authorizeUrl = `${endpoints.authorize}?client_id=${
      config.clientId
    }&redirect_uri=${encodeURIComponent(
      config.redirectUri
    )}&response_type=code&scope=${
      config.scope
    }&code_challenge=${codeChallenge}&code_challenge_method=S256`
    const authentikBase = config.issuer.replace(/\/application\/o\/.*$/, '')
    const signupUrl = `${authentikBase}/if/flow/${
      config.signupFlow
    }/?next=${encodeURIComponent(authorizeUrl)}`
    window.location.href = signupUrl
  }

  async login(): Promise<void> {
    this.clearSessionData()

    const config = this.getConfig()
    const endpoints = getEndpoints(config.issuer)
    const codeVerifier = this.generateCodeVerifier()
    const codeChallenge = await this.generateCodeChallenge(codeVerifier)
    sessionStorage.setItem('oidc_pkce_code_verifier', codeVerifier)

    const authUrl = `${endpoints.authorize}?client_id=${
      config.clientId
    }&redirect_uri=${encodeURIComponent(
      config.redirectUri
    )}&response_type=code&scope=${
      config.scope
    }&code_challenge=${codeChallenge}&code_challenge_method=S256`
    window.location.href = authUrl
  }

  async logout(): Promise<void> {
    try {
      const config = this.getConfig()
      const endpoints = getEndpoints(config.issuer)
      const redirectUri = encodeURIComponent(
        `${window.location.origin}/auth/login`
      )

      let idTokenHint = ''
      const tokens = localStorage.getItem('oidc_tokens')
      if (tokens) {
        try {
          const parsed = JSON.parse(tokens)
          if (parsed.id_token) {
            idTokenHint = `&id_token_hint=${encodeURIComponent(
              parsed.id_token
            )}`
          }
        } catch (e) {}
      }

      const state = Math.random().toString(36).substring(2)
      sessionStorage.setItem(OIDC_LOGOUT_STATE_KEY, state)
      sessionStorage.setItem(OIDC_LOGOUT_PENDING_KEY, 'true')
      sessionStorage.setItem(OIDC_LOGOUT_STARTED_AT_KEY, Date.now().toString())

      const logoutUrl = `${endpoints.endSession}?client_id=${config.clientId}&post_logout_redirect_uri=${redirectUri}&state=${state}${idTokenHint}`
      window.location.href = logoutUrl
    } catch (err) {
      console.error('Logout error:', err)
      toast.error('Logout failed')
      throw err
    }
  }

  private clearSessionData(): void {
    localStorage.removeItem('oidc_session')
    localStorage.removeItem('oidc_tokens')
    localStorage.removeItem('auth_meta')
    localStorage.removeItem('oidc_auth_meta')
    sessionStorage.removeItem('oidc_pkce_code_verifier')
    sessionStorage.removeItem('oidc_processing')
    sessionStorage.removeItem(OIDC_LOGOUT_STATE_KEY)
    sessionStorage.removeItem(OIDC_LOGOUT_PENDING_KEY)
    sessionStorage.removeItem(OIDC_LOGOUT_STARTED_AT_KEY)
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier)
    )
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }
}

const oidcProvider = new OIDCProvider()

const clearOidcStorage = () => {
  localStorage.removeItem('oidc_session')
  localStorage.removeItem('oidc_tokens')
  sessionStorage.removeItem('oidc_pkce_code_verifier')
  sessionStorage.removeItem('oidc_processing')
  sessionStorage.removeItem(OIDC_LOGOUT_STATE_KEY)
  sessionStorage.removeItem(OIDC_LOGOUT_PENDING_KEY)
  sessionStorage.removeItem(OIDC_LOGOUT_STARTED_AT_KEY)
  clearPendingAuthMode()
  clearPendingCallbackUrl()
}

const getUserDataFromIdToken = (idToken: string): User => {
  const payload = JSON.parse(atob(idToken.split('.')[1]))

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    username: payload.preferred_username || payload.username,
    avatar: `https://ui-avatars.com/api/?name=${payload.name}`,
    isOnboarded: false,
    authProvider: 'oidc'
  }
}

const isOidcLogoutPending = () =>
  typeof window !== 'undefined' &&
  sessionStorage.getItem(OIDC_LOGOUT_PENDING_KEY) === 'true'

const hasOidcLogoutReturnState = (returnState: string | null) =>
  typeof window !== 'undefined' &&
  Boolean(
    returnState && sessionStorage.getItem(OIDC_LOGOUT_STATE_KEY) === returnState
  )

export const useAuth = () => {
  const {
    user,
    isLoading,
    isLogoutPending,
    setUser,
    setLoading,
    setLogoutPending,
    logout: storeLogout
  } = useAuthStore()
  const authEnabled = authConfig.enabled
  const router = useRouter()
  const logoutReturnState =
    typeof router.query.state === 'string' ? router.query.state : null

  React.useEffect(() => {
    if (!router.isReady) return
    if (isOidcLogoutPending()) {
      const completeOidcLogoutReturn = () => {
        if (!isOidcLogoutPending()) return
        clearOidcStorage()
        setLogoutPending(false)
        storeLogout()
        if (window.location.pathname !== '/auth/login') {
          router.replace('/auth/login')
          return
        }
        if (!logoutReturnState) return
        const nextQuery = { ...router.query }
        delete nextQuery.state
        router.replace(
          { pathname: '/auth/login', query: nextQuery },
          undefined,
          { shallow: true }
        )
      }

      if (
        window.location.pathname !== '/auth/login' ||
        hasOidcLogoutReturnState(logoutReturnState)
      ) {
        completeOidcLogoutReturn()
        return
      }

      const timeoutId = window.setTimeout(
        completeOidcLogoutReturn,
        OIDC_LOGOUT_RETURN_FALLBACK_MS
      )
      return () => window.clearTimeout(timeoutId)
    }
  }, [logoutReturnState, router, setLogoutPending, storeLogout])

  React.useEffect(() => {
    if (isOidcLogoutPending()) return
    try {
      const session = localStorage.getItem('oidc_session')
      if (!session) return

      const parsedSession = JSON.parse(session) as User

      if (parsedSession.username) {
        setUser(parsedSession)
        return
      }

      const tokens = localStorage.getItem('oidc_tokens')
      if (!tokens) {
        setUser(parsedSession)
        return
      }

      const parsedTokens = JSON.parse(tokens)
      if (!parsedTokens.id_token) {
        setUser(parsedSession)
        return
      }

      const enrichedSession = {
        ...parsedSession,
        ...getUserDataFromIdToken(parsedTokens.id_token)
      }

      localStorage.setItem('oidc_session', JSON.stringify(enrichedSession))
      setUser(enrichedSession)
    } catch {}
  }, [setUser])

  const handleOIDCCallback = React.useCallback(
    async (code: string) => {
      if (sessionStorage.getItem('oidc_processing')) {
        sessionStorage.removeItem('oidc_processing')
      }

      sessionStorage.setItem('oidc_processing', 'true')

      try {
        const config = authConfig.oidc
        const codeVerifier = sessionStorage.getItem('oidc_pkce_code_verifier')

        if (!codeVerifier) {
          throw new Error(
            'No code verifier found. Please try logging in again.'
          )
        }

        const res = await fetch('/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirect_uri: config.redirectUri,
            code_verifier: codeVerifier
          })
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || 'Token exchange failed')
        }

        const tokens = await res.json()
        const payload = JSON.parse(atob(tokens.id_token.split('.')[1]))

        const authMeta = {
          main_oidc: payload.iss,
          upstream_idp:
            payload.upstream_idp ||
            payload.last_idp ||
            payload.idp ||
            payload.source ||
            payload.provider ||
            payload.amr?.[0] ||
            'unknown'
        }

        localStorage.setItem('oidc_auth_meta', JSON.stringify(authMeta))
        localStorage.setItem('auth_meta', JSON.stringify(authMeta))

        const userData = getUserDataFromIdToken(tokens.id_token)

        localStorage.setItem('oidc_session', JSON.stringify(userData))
        localStorage.setItem('oidc_tokens', JSON.stringify(tokens))

        const callbackUrl = getPendingCallbackUrl()
        clearPendingCallbackUrl()
        setUser(userData)

        router.replace({
          pathname: '/auth/login',
          ...(callbackUrl ? { query: { callbackUrl } } : {})
        })
      } catch (err) {
        console.error('OIDC callback error:', err)
        clearOidcStorage()
        clearPendingAuthMode()
        clearPendingCallbackUrl()
        toast.error('Login failed. Please try again.')
        router.replace('/auth/login')
      } finally {
        sessionStorage.removeItem('oidc_processing')
      }
    },
    [router, setUser]
  )

  const checkSession = React.useCallback(async () => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) await handleOIDCCallback(code)
  }, [handleOIDCCallback])

  const login = async (mode: PendingAuthMode = 'login') => {
    setLoading(true)
    try {
      if (mode === 'signup') {
        await oidcProvider.signup()
      } else {
        await oidcProvider.login()
      }
    } finally {
      setLoading(false)
    }
  }

  const beginOidcFlow = async (mode: PendingAuthMode) => {
    clearOidcStorage()

    const callbackUrl =
      typeof router.query.callbackUrl === 'string'
        ? router.query.callbackUrl
        : null
    setPendingAuthMode(mode)
    if (callbackUrl) {
      setPendingCallbackUrl(callbackUrl)
    } else {
      clearPendingCallbackUrl()
    }
    await login(mode)
  }

  const logout = async () => {
    setLoading(true)
    try {
      const isVm3Callback = sessionStorage.getItem('logout_flow') === 'vm3'
      const vm3Timeout = sessionStorage.getItem('vm3_logout_timeout') === 'true'

      if (isVm3Callback || vm3Timeout) {
        sessionStorage.removeItem('logout_flow')
        sessionStorage.removeItem('vm3_logout_timeout')

        if (user?.authProvider === 'oidc') {
          setLogoutPending(true)
          localStorage.removeItem('oidc_session')
          clearPendingAuthMode()
          clearPendingCallbackUrl()
          storeLogout()
          await oidcProvider.logout()
          return
        }
      }

      if (user?.authProvider === 'oidc') {
        setLogoutPending(true)
        localStorage.removeItem('oidc_session')
        clearPendingAuthMode()
        clearPendingCallbackUrl()
        storeLogout()
        await oidcProvider.logout()
        return
      }

      clearOidcStorage()
      setLogoutPending(false)
      storeLogout()
      router.replace('/auth/login')
    } catch (error) {
      setLogoutPending(false)
      console.error('Logout flow failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return {
    user,
    isLoading,
    isLogoutPending,
    isAuthenticated: !!user,
    login,
    beginOidcFlow,
    logout,
    checkSession,
    authEnabled
  }
}
