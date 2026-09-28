import {
  MAX_CUSTOM_TIMEOUT_SECONDS,
  TIMEOUT_PRESETS,
  formatSecondsPrecise,
  formatServiceTimeout,
  isCustomTimeoutValue,
  isTimeoutPreset,
  mapTimeoutStringToSeconds,
  normalizeCustomTimeoutInput,
  timeoutSecondsToFormValue
} from './ddo'

describe('service timeout (access duration)', () => {
  it('keeps the DDO seconds of existing presets unchanged', () => {
    expect(mapTimeoutStringToSeconds('Forever')).toBe(0)
    expect(mapTimeoutStringToSeconds('1 day')).toBe(86400)
    expect(mapTimeoutStringToSeconds('1 week')).toBe(604800)
    expect(mapTimeoutStringToSeconds('1 month')).toBe(2630000)
    expect(mapTimeoutStringToSeconds('1 year')).toBe(31556952)
  })

  it('maps every preset to integer seconds and back', () => {
    TIMEOUT_PRESETS.forEach(({ label, seconds }) => {
      const mapped = mapTimeoutStringToSeconds(label)
      expect(mapped).toBe(seconds)
      expect(Number.isInteger(mapped)).toBe(true)
      expect(timeoutSecondsToFormValue(seconds)).toBe(label)
      expect(formatServiceTimeout(seconds)).toBe(label)
    })
  })

  it('maps custom second values to integers', () => {
    expect(mapTimeoutStringToSeconds('5400')).toBe(5400)
    expect(mapTimeoutStringToSeconds('unknown')).toBe(0)
    expect(mapTimeoutStringToSeconds('')).toBe(0)
  })

  it('keeps non-preset seconds as custom form values', () => {
    expect(timeoutSecondsToFormValue(3600)).toBe('1 hour')
    expect(timeoutSecondsToFormValue(7200)).toBe('7200')
  })

  it('validates timeout form values', () => {
    expect(isTimeoutPreset('1 hour')).toBe(true)
    expect(isTimeoutPreset('7200')).toBe(false)
    expect(isCustomTimeoutValue('7200')).toBe(true)
    expect(isCustomTimeoutValue('0')).toBe(false)
    expect(isCustomTimeoutValue('1.5')).toBe(false)
    expect(isCustomTimeoutValue('-5')).toBe(false)
    expect(isCustomTimeoutValue('')).toBe(false)
    expect(isCustomTimeoutValue('1e5')).toBe(false)
    expect(isCustomTimeoutValue('0100')).toBe(false)
  })

  it('offers Forever plus the timed presets in order', () => {
    expect(TIMEOUT_PRESETS.map(({ label }) => label)).toEqual([
      'Forever',
      '1 minute',
      '10 minutes',
      '1 hour',
      '1 day',
      '1 week',
      '1 month',
      '6 months',
      '1 year'
    ])
  })

  it('shows stored values that are no longer presets as custom', () => {
    expect(timeoutSecondsToFormValue(900)).toBe('900')
    expect(formatServiceTimeout(900)).toBe('15 minutes')
    expect(formatServiceTimeout(10800)).toBe('3 hours')
  })

  it('caps custom seconds at 1 year', () => {
    expect(MAX_CUSTOM_TIMEOUT_SECONDS).toBe(31556952)
    expect(MAX_CUSTOM_TIMEOUT_SECONDS).toBe(mapTimeoutStringToSeconds('1 year'))
    expect(isCustomTimeoutValue('31556952')).toBe(true)
    expect(isCustomTimeoutValue('31556953')).toBe(false)
    expect(isCustomTimeoutValue('99999999999999999999')).toBe(false)
  })

  it('ignores non-digit input instead of altering the number', () => {
    expect(normalizeCustomTimeoutInput('1.5')).toBeUndefined()
    expect(normalizeCustomTimeoutInput('1e5')).toBeUndefined()
    expect(normalizeCustomTimeoutInput('-5')).toBeUndefined()
    expect(normalizeCustomTimeoutInput('5400')).toBe('5400')
    expect(normalizeCustomTimeoutInput('')).toBe('')
  })

  it('strips leading zeros from custom input', () => {
    expect(normalizeCustomTimeoutInput('0100')).toBe('100')
    expect(normalizeCustomTimeoutInput('000')).toBe('0')
    expect(normalizeCustomTimeoutInput('0')).toBe('0')
  })

  it('formats custom durations precisely', () => {
    expect(formatServiceTimeout(5400)).toBe('1 hour 30 minutes')
    expect(formatSecondsPrecise(1)).toBe('1 second')
    expect(formatSecondsPrecise(90061)).toBe('1 day 1 hour')
    expect(formatSecondsPrecise(0)).toBe('Forever')
    expect(formatSecondsPrecise(365 * 86400)).toBe('1 year')
    expect(formatSecondsPrecise(30 * 86400)).toBe('1 month')
  })

  it('accepts timeouts stored as strings', () => {
    expect(formatServiceTimeout('86400' as unknown as number)).toBe('1 day')
    expect(formatServiceTimeout(undefined)).toBe('Forever')
  })
})
