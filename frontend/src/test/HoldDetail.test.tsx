import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HoldDetail } from '../pages/HoldDetail'
import { isoIn, mockBackend, STUDENT } from './helpers'

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('application screen', () => {
  it('shows EXPIRED and disables the pay button when the deadline passes, without a reload', async () => {
    vi.useFakeTimers()
    // The fake server keeps answering HELD: the screen must expire on its own clock.
    const expiresAt = isoIn(5_000)
    mockBackend(() => ({
      body: { holdId: 'h_1', classId: 'c_1', className: 'Class 6 - Morning Shift', status: 'HELD', expiresAt },
    }))

    render(<HoldDetail holdId="h_1" studentId={STUDENT} onChanged={() => {}} />)
    await advance(0)

    expect(screen.getByTestId('hold-status')).toHaveTextContent('HELD')
    expect(screen.getByTestId('countdown')).toHaveTextContent('০০:০৫')
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'বাতিল' })).toBeEnabled()

    await advance(2_000)
    expect(screen.getByTestId('countdown')).toHaveTextContent('০০:০৩')

    await advance(4_000)
    expect(screen.getByTestId('hold-status')).toHaveTextContent('EXPIRED')
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'বাতিল' })).toBeDisabled()
  })

  it('confirms the admission when the fee is paid', async () => {
    vi.useFakeTimers()
    let status = 'HELD'
    const expiresAt = isoIn(600_000)
    const calls = mockBackend(({ method, path }) => {
      if (method === 'POST' && path === '/holds/h_1/confirm') {
        status = 'CONFIRMED'
        return { body: { holdId: 'h_1', status } }
      }
      return { body: { holdId: 'h_1', classId: 'c_1', className: 'Class 6', status, expiresAt } }
    })

    render(<HoldDetail holdId="h_1" studentId={STUDENT} onChanged={() => {}} />)
    await advance(0)

    await act(async () => {
      screen.getByRole('button', { name: 'ভর্তি ফি দিন' }).click()
    })
    await advance(0)

    const confirm = calls.find((c) => c.path === '/holds/h_1/confirm')
    expect(confirm?.headers['X-Student-Id']).toBe(STUDENT)
    expect(screen.getByTestId('hold-status')).toHaveTextContent('CONFIRMED')
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeDisabled()
  })

  it('explains a late payment instead of failing silently', async () => {
    vi.useFakeTimers()
    const expiresAt = isoIn(600_000)
    mockBackend(({ method }) =>
      method === 'POST'
        ? { status: 409, body: { code: 'HOLD_EXPIRED', message: 'The application has expired.' } }
        : { body: { holdId: 'h_1', classId: 'c_1', className: 'Class 6', status: 'HELD', expiresAt } },
    )

    render(<HoldDetail holdId="h_1" studentId={STUDENT} onChanged={() => {}} />)
    await advance(0)
    await act(async () => {
      screen.getByRole('button', { name: 'ভর্তি ফি দিন' }).click()
    })
    await advance(0)

    expect(screen.getByRole('alert')).toHaveTextContent('আবেদনের মেয়াদ শেষ হয়ে গেছে')
  })

  it('shows a readable message when the server is down', async () => {
    vi.useFakeTimers()
    mockBackend(() => 'network-error')

    render(<HoldDetail holdId="h_1" studentId={STUDENT} onChanged={() => {}} />)
    await advance(0)

    expect(screen.getByRole('alert')).toHaveTextContent('সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না')
    expect(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeInTheDocument()
  })
})
