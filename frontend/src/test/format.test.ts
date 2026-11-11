import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { bn, effectiveStatus, formatRemaining, isValidStudentId, normalizeStudentId } from '../format'
import { errorMessage } from '../messages'

describe('student id', () => {
  it('keeps digits only, converts Bengali digits and caps at 17', () => {
    expect(normalizeStudentId('2015-2691 2345 67890 999')).toBe('20152691234567890')
    expect(normalizeStudentId('২০১৫২৬৯১২৩৪৫৬৭৮৯০')).toBe('20152691234567890')
  })

  it('accepts exactly 17 digits', () => {
    expect(isValidStudentId('20152691234567890')).toBe(true)
    expect(isValidStudentId('2015269123456789')).toBe(false)
    expect(isValidStudentId('')).toBe(false)
  })
})

describe('hold status and countdown', () => {
  const now = Date.parse('2026-11-01T04:00:00Z')

  it('treats a HELD hold past its deadline as EXPIRED', () => {
    expect(effectiveStatus({ status: 'HELD', expiresAt: '2026-11-01T04:10:00Z' }, now)).toBe('HELD')
    expect(effectiveStatus({ status: 'HELD', expiresAt: '2026-11-01T04:00:00Z' }, now)).toBe('EXPIRED')
    expect(effectiveStatus({ status: 'HELD', expiresAt: '2026-11-01T03:59:59Z' }, now)).toBe('EXPIRED')
  })

  it('never changes a final status', () => {
    expect(effectiveStatus({ status: 'CONFIRMED', expiresAt: '2026-11-01T03:00:00Z' }, now)).toBe('CONFIRMED')
    expect(effectiveStatus({ status: 'CANCELLED', expiresAt: '2026-11-01T03:00:00Z' }, now)).toBe('CANCELLED')
  })

  it('formats the remaining time in Bengali digits', () => {
    expect(formatRemaining(598_000)).toBe('০৯:৫৮')
    expect(formatRemaining(500)).toBe('০০:০১')
    expect(formatRemaining(0)).toBe('০০:০০')
    expect(formatRemaining(3_725_000)).toBe('১:০২:০৫')
    expect(bn(120)).toBe('১২০')
  })
})

describe('error messages', () => {
  it('explains known failures in plain Bengali', () => {
    expect(errorMessage(new ApiError(409, 'CLASS_FULL', 'x'))).toContain('আসন খালি নেই')
    expect(errorMessage(new ApiError(409, 'HOLD_EXPIRED', 'x'))).toContain('মেয়াদ শেষ')
    expect(errorMessage(new ApiError(0, 'NETWORK_ERROR', 'x'))).toContain('সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না')
  })

  it('always returns something readable for unknown failures', () => {
    expect(errorMessage(new ApiError(500, 'WHATEVER', 'x'))).toContain('সার্ভারে একটি সমস্যা')
    expect(errorMessage(new ApiError(418, 'WHATEVER', 'x')).length).toBeGreaterThan(10)
    expect(errorMessage(new Error('boom')).length).toBeGreaterThan(10)
  })
})
