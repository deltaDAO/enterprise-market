/**
 * @jest-environment node
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyGaiaXCredentials } from '@utils/gaiaX/verify'
import handler, { getClient } from './verify'

jest.mock('@oceanprotocol/lib', () => ({
  LoggerInstance: { error: jest.fn() }
}))
jest.mock('@utils/gaiaX/verify', () => ({
  verifyGaiaXCredentials: jest.fn(async () => ({ status: 'verified' }))
}))

const URL = 'https://delta-dao.com/.well-known/40_gx_legalperson_deltaDAO.jwt'
let client = 0

function call(
  body: unknown,
  {
    method = 'POST',
    ip,
    forwardedFor
  }: { method?: string; ip?: string; forwardedFor?: string } = {}
) {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    send(payload: string) {
      this.body = JSON.parse(payload)
      return this
    }
  }
  const req = {
    method,
    body,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    socket: { remoteAddress: ip ?? `10.0.0.${++client}` }
  }
  return handler(
    req as unknown as NextApiRequest,
    res as unknown as NextApiResponse
  ).then(() => res)
}

describe('POST /api/gaiax/verify', () => {
  it('only accepts POST', async () => {
    const res = await call(undefined, { method: 'GET' })
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it.each([
    [{}, 'No credential URL given.'],
    [{ participantUrl: 'http://delta-dao.com/vp.jwt' }, 'Credential URLs'],
    [{ participantUrl: 'https://localhost' }, 'Credential URLs'],
    [{ participantUrl: URL, publisherDid: 'not a did' }, 'Credential URLs'],
    [
      { participantUrl: URL, assetDid: `did:ope:${'a'.repeat(600)}` },
      'Credential URLs'
    ]
  ])('rejects invalid input %#', async (body, error) => {
    const res = await call(body)
    expect(res.statusCode).toBe(400)
    expect((res.body as { error: string }).error).toContain(error)
  })

  it('rejects malformed JSON', async () => {
    const res = await call('{nope')
    expect(res.statusCode).toBe(400)
  })

  it('verifies valid input', async () => {
    const res = await call({
      participantUrl: URL,
      publisherDid: 'did:web:delta-dao.com',
      assetDid:
        'did:ope:99d96c60d45714df1e333fccc019aa7592e111013db80a30306bca9f50e8caad'
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ success: true, result: { status: 'verified' } })
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(verifyGaiaXCredentials).toHaveBeenLastCalledWith(
      expect.objectContaining({ participantUrl: URL }),
      expect.objectContaining({ cache: expect.any(Object) })
    )
  })

  it('refuses oversized results', async () => {
    ;(verifyGaiaXCredentials as jest.Mock).mockResolvedValueOnce({
      huge: 'x'.repeat(6 * 1024 * 1024)
    })
    const res = await call({ participantUrl: URL })
    expect(res.statusCode).toBe(502)
  })

  it('rate limits clients by socket address', async () => {
    const statuses = []
    for (let index = 0; index < 32; index++) {
      statuses.push(
        (await call({ participantUrl: URL }, { ip: '203.0.113.7' })).statusCode
      )
    }
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true)
    expect(statuses.slice(30)).toEqual([429, 429])
  })

  it('ignores forged X-Forwarded-For headers by default', async () => {
    const statuses = []
    for (let index = 0; index < 31; index++) {
      statuses.push(
        (
          await call(
            { participantUrl: URL },
            { ip: '203.0.113.8', forwardedFor: `198.51.100.${index}` }
          )
        ).statusCode
      )
    }
    expect(statuses[30]).toBe(429)
  })
})

describe('getClient', () => {
  const req = (headers: Record<string, string>, remoteAddress = '10.1.1.1') =>
    ({ headers, socket: { remoteAddress } } as unknown as NextApiRequest)

  afterEach(() => {
    delete process.env.VERCEL
  })

  it('uses the socket address without trusted proxies', () => {
    expect(getClient(req({ 'x-forwarded-for': '1.2.3.4' }), 0)).toBe('10.1.1.1')
  })

  it('takes the entry added by the outermost trusted proxy', () => {
    const forged = req({ 'x-forwarded-for': 'forged, 203.0.113.9' })
    expect(getClient(forged, 1)).toBe('203.0.113.9')
    expect(getClient(forged, 2)).toBe('forged')
    expect(getClient(forged, 3)).toBe('10.1.1.1')
  })

  it('uses the platform header on Vercel', () => {
    process.env.VERCEL = '1'
    expect(
      getClient(
        req({
          'x-vercel-forwarded-for': '203.0.113.10',
          'x-forwarded-for': 'forged'
        }),
        0
      )
    ).toBe('203.0.113.10')
  })
})
