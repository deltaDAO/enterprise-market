import {
  TIMEOUT_PRESETS,
  formatSecondsPrecise,
  formatServiceTimeout,
  isCustomTimeoutValue,
  isTimeoutPreset,
  mapTimeoutStringToSeconds,
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
  })

  it('formats custom durations precisely', () => {
    expect(formatServiceTimeout(5400)).toBe('1 hour 30 minutes')
    expect(formatSecondsPrecise(1)).toBe('1 second')
    expect(formatSecondsPrecise(90061)).toBe('1 day 1 hour')
    expect(formatSecondsPrecise(0)).toBe('Forever')
  })
})
