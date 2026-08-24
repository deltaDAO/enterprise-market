const mockInit = jest.fn()
const mockPlausibleInit = jest.fn()
const mockGetRuntimeConfig = jest.fn()

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { init: (...args: unknown[]) => mockInit(...args) }
}))

jest.mock('@plausible-analytics/tracker', () => ({
  __esModule: true,
  init: (...args: unknown[]) => mockPlausibleInit(...args)
}))

jest.mock('./runtimeConfig', () => ({
  getRuntimeConfig: () => mockGetRuntimeConfig()
}))

describe('initAnalytics', () => {
  beforeEach(() => {
    jest.resetModules()
    mockInit.mockClear()
    mockPlausibleInit.mockClear()
    mockGetRuntimeConfig.mockReset()
  })

  it('does nothing when no provider is configured', () => {
    mockGetRuntimeConfig.mockReturnValue({})
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initAnalytics } = require('./analytics')

    initAnalytics()

    expect(mockInit).not.toHaveBeenCalled()
    expect(mockPlausibleInit).not.toHaveBeenCalled()
  })

  it('initialises PostHog only once when a key is present', () => {
    mockGetRuntimeConfig.mockReturnValue({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
      NEXT_PUBLIC_POSTHOG_HOST: 'https://example.posthog.com'
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initAnalytics } = require('./analytics')

    initAnalytics()
    initAnalytics()

    expect(mockInit).toHaveBeenCalledTimes(1)
    expect(mockInit).toHaveBeenCalledWith('phc_test', {
      api_host: 'https://example.posthog.com',
      defaults: '2026-01-30'
    })
  })

  it('falls back to the EU host when none is configured', () => {
    mockGetRuntimeConfig.mockReturnValue({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test'
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initAnalytics } = require('./analytics')

    initAnalytics()

    expect(mockInit).toHaveBeenCalledWith('phc_test', {
      api_host: 'https://eu.i.posthog.com',
      defaults: '2026-01-30'
    })
  })

  it('initialises Plausible when a domain is configured', async () => {
    mockGetRuntimeConfig.mockReturnValue({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: 'market.example.com'
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initAnalytics } = require('./analytics')

    initAnalytics()
    await Promise.resolve()

    expect(mockInit).not.toHaveBeenCalled()
    expect(mockPlausibleInit).toHaveBeenCalledWith({
      domain: 'market.example.com'
    })
  })
})

describe('isAnalyticsConfigured', () => {
  beforeEach(() => {
    jest.resetModules()
    mockGetRuntimeConfig.mockReset()
  })

  it('is false when no provider is set (self-hosted default)', () => {
    mockGetRuntimeConfig.mockReturnValue({})
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isAnalyticsConfigured } = require('./analytics')

    expect(isAnalyticsConfigured()).toBe(false)
  })

  it('is true when a PostHog key is set', () => {
    mockGetRuntimeConfig.mockReturnValue({
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_test'
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isAnalyticsConfigured } = require('./analytics')

    expect(isAnalyticsConfigured()).toBe(true)
  })

  it('is true when a Plausible domain is set', () => {
    mockGetRuntimeConfig.mockReturnValue({
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: 'market.example.com'
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isAnalyticsConfigured } = require('./analytics')

    expect(isAnalyticsConfigured()).toBe(true)
  })
})
