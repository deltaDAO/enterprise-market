import { randomUUID } from 'node:crypto'
import { LoggerInstance } from '@oceanprotocol/lib'
import { createMemoCache, createRateLimiter } from '@utils/gaiaX/cache'
import { getGaiaXServerConfig } from '@utils/gaiaX/config'
import { fetchBytes, fetchJson, fetchText, postVp } from '@utils/gaiaX/fetch'
import { GaiaXVerifyRequest } from '@utils/gaiaX/types'
import { verifyGaiaXCredentials } from '@utils/gaiaX/verify'
import { isValidWebUrl } from '@utils/url'
import type { NextApiRequest, NextApiResponse } from 'next'

const DID_PATTERN = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/
const MAX_URL_LENGTH = 2048
const MAX_DID_LENGTH = 512
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
// An asset page verifies about every 10 minutes and the publish form is
// debounced, so this only limits automated use
const RATE_LIMIT = { limit: 30, windowMs: 60_000 }

// Shared by all requests of this server instance; keyed by content
const cache = createMemoCache()
const rateLimit = createRateLimiter(RATE_LIMIT)

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4kb'
    }
  },
  maxDuration: 60
}

function readUrl(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined
  if (
    typeof value !== 'string' ||
    value.length > MAX_URL_LENGTH ||
    !value.startsWith('https://') ||
    !isValidWebUrl(value)
  ) {
    return null
  }
  return value.trim()
}

function readDid(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > MAX_DID_LENGTH) return null
  if (DID_PATTERN.test(value)) return value
  // Publishers without SSI are identified by their wallet address
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value
  return null
}

function header(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name]
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined
}

/**
 * Client address for rate limiting. Forwarded headers are client-controlled
 * unless set by a trusted proxy: on Vercel the platform sets
 * x-vercel-forwarded-for; behind other proxies GAIAX_TRUSTED_PROXY_HOPS
 * selects the X-Forwarded-For entry added by the outermost trusted proxy.
 * Otherwise only the socket address is used.
 */
export function getClient(
  req: NextApiRequest,
  trustedProxyHops: number
): string {
  if (process.env.VERCEL) {
    const vercel = header(req, 'x-vercel-forwarded-for')?.split(',')[0]?.trim()
    if (vercel) return vercel
  }
  if (trustedProxyHops > 0) {
    const chain = (header(req, 'x-forwarded-for') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    const client = chain[chain.length - trustedProxyHops]
    if (client) return client
  }
  return req.socket?.remoteAddress || 'unknown'
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { compliance, maxAgeSeconds, trustedNotaries, trustedProxyHops } =
    getGaiaXServerConfig()

  const { allowed, retryAfterSeconds } = rateLimit(
    getClient(req, trustedProxyHops)
  )
  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfterSeconds))
    return res
      .status(429)
      .json({ success: false, error: 'Too many verification requests.' })
  }

  let body: Record<string, unknown>
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' })
  }

  const input: GaiaXVerifyRequest = {
    participantUrl: readUrl(body?.participantUrl),
    serviceOfferingUrl: readUrl(body?.serviceOfferingUrl),
    publisherDid: readDid(body?.publisherDid),
    assetDid: readDid(body?.assetDid)
  }

  if (Object.values(input).includes(null)) {
    return res.status(400).json({
      success: false,
      error: 'Credential URLs must be https URLs and DIDs must be valid.'
    })
  }
  if (!input.participantUrl && !input.serviceOfferingUrl) {
    return res
      .status(400)
      .json({ success: false, error: 'No credential URL given.' })
  }

  try {
    const result = await verifyGaiaXCredentials(input, {
      fetchText,
      fetchJson,
      fetchBytes,
      postVp,
      now: () => new Date(),
      randomId: randomUUID,
      compliance,
      maxAgeSeconds,
      trustedNotaries,
      cache
    })
    // Second line of defense against amplified responses: real results are
    // well below 1 MB
    const json = JSON.stringify({ success: true, result })
    if (json.length > MAX_RESPONSE_BYTES) {
      LoggerInstance.error('[gaiax] verification result too large', json.length)
      return res.status(502).json({
        success: false,
        error: 'Gaia-X credentials could not be verified.'
      })
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    return res.status(200).send(json)
  } catch (error) {
    LoggerInstance.error('[gaiax] verification failed', error)
    return res.status(500).json({
      success: false,
      error: 'Gaia-X credentials could not be verified.'
    })
  }
}
