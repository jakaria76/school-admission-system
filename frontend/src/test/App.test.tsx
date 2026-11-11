import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import { isoIn, mockBackend, STUDENT } from './helpers'

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const morning = (heldSeats: number) => ({
  id: 'c_1',
  name: 'Class 6 - Morning Shift',
  totalSeats: 120,
  heldSeats,
  confirmedSeats: 80,
  availableSeats: 120 - 80 - heldSeats,
})

describe('class list', () => {
  it('refreshes seat numbers every few seconds without a reload', async () => {
    vi.useFakeTimers()
    let held = 15
    mockBackend(({ path }) => (path === '/classes' ? { body: [morning(held)] } : { body: [] }))

    render(<App />)
    await advance(0)

    const row = screen.getByTestId('class-c_1')
    expect(within(row).getByTestId('total-seats')).toHaveTextContent('১২০')
    expect(within(row).getByTestId('held-seats')).toHaveTextContent('১৫')
    expect(within(row).getByTestId('confirmed-seats')).toHaveTextContent('৮০')
    expect(within(row).getByTestId('available-seats')).toHaveTextContent('২৫')

    held = 20
    await advance(3_500)

    expect(within(screen.getByTestId('class-c_1')).getByTestId('held-seats')).toHaveTextContent('২০')
    expect(within(screen.getByTestId('class-c_1')).getByTestId('available-seats')).toHaveTextContent('২০')
  })

  it('needs a 17-digit student number before applying, then sends it as X-Student-Id', async () => {
    vi.useFakeTimers()
    const calls = mockBackend(({ method, path }) => {
      if (path === '/classes') return { body: [morning(15)] }
      if (method === 'POST' && path === '/classes/c_1/holds') {
        return {
          status: 201,
          body: { holdId: 'h_9', classId: 'c_1', studentId: STUDENT, status: 'HELD', expiresAt: isoIn(600_000) },
        }
      }
      if (path === '/holds/h_9') {
        return { body: { holdId: 'h_9', classId: 'c_1', className: 'Class 6', status: 'HELD', expiresAt: isoIn(600_000) } }
      }
      return { body: [] }
    })

    render(<App />)
    await advance(0)
    expect(screen.getByRole('button', { name: 'আবেদন করুন' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/জন্ম নিবন্ধন নম্বর/), { target: { value: STUDENT } })
    await advance(0)
    expect(screen.getByRole('button', { name: 'আবেদন করুন' })).toBeEnabled()

    await act(async () => {
      screen.getByRole('button', { name: 'আবেদন করুন' }).click()
    })
    await advance(0)

    expect(calls.find((c) => c.path === '/classes/c_1/holds')?.headers['X-Student-Id']).toBe(STUDENT)
    // The app moved on to the application screen.
    expect(window.location.hash).toBe('#/holds/h_9')
    expect(screen.getByRole('button', { name: 'ভর্তি ফি দিন' })).toBeEnabled()
  })

  it('tells the user when the last seat was taken by someone else', async () => {
    vi.useFakeTimers()
    window.localStorage.setItem('admission.studentId', STUDENT)
    mockBackend(({ method, path }) => {
      if (method === 'POST') return { status: 409, body: { code: 'CLASS_FULL', message: 'No seats.' } }
      return path === '/classes' ? { body: [morning(15)] } : { body: [] }
    })

    render(<App />)
    await advance(0)
    await act(async () => {
      screen.getByRole('button', { name: 'আবেদন করুন' }).click()
    })
    await advance(0)

    expect(screen.getByRole('alert')).toHaveTextContent('এই ক্লাসে আর কোনো আসন খালি নেই')
  })

  it('shows an error message, not a blank page, when the server is down', async () => {
    vi.useFakeTimers()
    mockBackend(() => 'network-error')

    render(<App />)
    await advance(0)

    expect(screen.getByRole('alert')).toHaveTextContent('সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না')
    expect(screen.getByRole('heading', { name: 'ক্লাস তালিকা' })).toBeInTheDocument()
  })
})

describe('my applications', () => {
  it('still shows the running application after the page is opened again', async () => {
    vi.useFakeTimers()
    // What a previous visit left behind: the student number in localStorage, the hold on the server.
    window.localStorage.setItem('admission.studentId', STUDENT)
    window.location.hash = '#/my'
    const calls = mockBackend(({ path }) =>
      path === '/me/holds'
        ? {
            body: [
              { holdId: 'h_1', classId: 'c_1', className: 'Class 6 - Morning Shift', status: 'HELD', expiresAt: isoIn(300_000) },
              { holdId: 'h_0', classId: 'c_2', className: 'Class 6 - Day Shift', status: 'CANCELLED', expiresAt: isoIn(-900_000) },
            ],
          }
        : { body: [] },
    )

    render(<App />)
    await advance(0)

    expect(screen.getByLabelText(/জন্ম নিবন্ধন নম্বর/)).toHaveValue(STUDENT)
    expect(calls.find((c) => c.path === '/me/holds')?.headers['X-Student-Id']).toBe(STUDENT)
    expect(screen.getByText('Class 6 - Morning Shift')).toBeInTheDocument()
    const statuses = screen.getAllByTestId('hold-status').map((el) => el.textContent)
    expect(statuses[0]).toContain('HELD')
    expect(statuses[1]).toContain('CANCELLED')
    expect(screen.getByText('০৫:০০')).toBeInTheDocument()
  })
})
