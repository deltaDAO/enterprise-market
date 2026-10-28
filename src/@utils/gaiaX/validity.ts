import { CheckResult } from './types'

function toTime(value?: string): number | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : time
}

// Issuers' clocks run slightly ahead or behind: a credential issued a moment
// ago (e.g. the GXDCH response) must not be "not yet valid". Expiry is strict.
export const CLOCK_TOLERANCE_MS = 5 * 60 * 1000

export function checkValidity(
  id: string,
  validFrom: string | undefined,
  validUntil: string | undefined,
  now: Date
): CheckResult {
  const from = toTime(validFrom)
  const until = toTime(validUntil)
  const current = now.getTime()

  if (from !== undefined && current + CLOCK_TOLERANCE_MS < from) {
    return { id, status: 'fail', message: `Not valid before ${validFrom}.` }
  }
  if (until !== undefined && current > until) {
    return { id, status: 'fail', message: `Expired on ${validUntil}.` }
  }
  return {
    id,
    status: 'pass',
    message: validUntil ? `Valid until ${validUntil}.` : 'No expiry date.'
  }
}
