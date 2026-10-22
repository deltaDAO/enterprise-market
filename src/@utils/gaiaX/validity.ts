import { CheckResult } from './types'

function toTime(value?: string): number | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : time
}

export function checkValidity(
  id: string,
  validFrom: string | undefined,
  validUntil: string | undefined,
  now: Date
): CheckResult {
  const from = toTime(validFrom)
  const until = toTime(validUntil)
  const current = now.getTime()

  if (from !== undefined && current < from) {
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
