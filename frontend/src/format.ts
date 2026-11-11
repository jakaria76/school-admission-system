import type { Hold, HoldStatus } from './api'

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/** 120 -> "১২০" */
export function bn(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)])
}

/** Keeps digits only, converting Bengali digits to ASCII, max 17 characters. */
export function normalizeStudentId(raw: string): string {
  return raw
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[^0-9]/g, '')
    .slice(0, 17)
}

export function isValidStudentId(value: string): boolean {
  return /^[0-9]{17}$/.test(value)
}

export function remainingMs(hold: Pick<Hold, 'expiresAt'>, now: number): number {
  return Math.max(0, Date.parse(hold.expiresAt) - now)
}

/**
 * The status to show right now: a HELD application whose deadline has passed is
 * EXPIRED, even before the next server refresh arrives.
 */
export function effectiveStatus(hold: Pick<Hold, 'status' | 'expiresAt'>, now: number): HoldStatus {
  return hold.status === 'HELD' && remainingMs(hold, now) <= 0 ? 'EXPIRED' : hold.status
}

/** 598000 -> "০৯:৫৮" (hours are added when needed) */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return bn(hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`)
}

export const STATUS_LABEL: Record<HoldStatus, string> = {
  HELD: 'আসন ধরে রাখা আছে, ফি বাকি',
  CONFIRMED: 'ভর্তি নিশ্চিত',
  EXPIRED: 'মেয়াদ শেষ',
  CANCELLED: 'বাতিল',
}
