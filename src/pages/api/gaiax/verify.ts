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

function getClient(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim()
  return first || req.socket?.remoteAddress || 'unknown'
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

  const { allowed, retryAfterSeconds } = rateLimit(getClient(req))
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

  const { compliance, maxAgeSeconds, trustedNotaries } = getGaiaXServerConfig()

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
    return res.status(200).json({ success: true, result })
  } catch (error) {
    LoggerInstance.error('[gaiax] verification failed', error)
    return res.status(500).json({
      success: false,
      error: 'Gaia-X credentials could not be verified.'
    })
  }
}
