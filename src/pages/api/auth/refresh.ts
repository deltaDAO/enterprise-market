/* eslint-disable camelcase */
import type { NextApiRequest, NextApiResponse } from 'next'

const OIDC_CLIENT_SECRET_ENV_KEY = 'OIDC_CLIENT_SECRET'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests'
    })
  }

  try {
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true') {
      return res.status(404).json({
        error: 'Not found'
      })
    }

    const { refresh_token } = req.body

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Refresh token required'
      })
    }

    const clientId = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID
    const clientSecret = process.env[OIDC_CLIENT_SECRET_ENV_KEY]
    let tokenUrl = process.env.NEXT_PUBLIC_OIDC_TOKEN_URL
    const issuer = process.env.NEXT_PUBLIC_OIDC_ISSUER

    if (!tokenUrl && issuer) {
      if (issuer.includes('/application/o/')) {
        const baseUrl = issuer.split('/application/o/')[0]
        tokenUrl = `${baseUrl}/application/o/token/`
      } else {
        tokenUrl = `${issuer.replace(/\/$/, '')}/token/`
      }
    }

    if (!clientId || !clientSecret || !tokenUrl) {
      console.error('Missing OIDC configuration')
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'OIDC credentials or token URL not configured'
      })
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token
      }),
      signal: AbortSignal.timeout(10000)
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Token refresh error:', {
        status: response.status,
        error: data.error,
        description: data.error_description
      })
      return res.status(response.status).json(data)
    }

    return res.status(200).json(data)
  } catch (error) {
    console.error('Refresh error:', error)

    if (error.name === 'TimeoutError') {
      return res.status(504).json({
        error: 'Gateway timeout',
        message: 'Authentication server did not respond in time'
      })
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
