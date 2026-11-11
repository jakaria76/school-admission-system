import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Alert } from '../components/ui'
import { bn } from '../format'
import { errorMessage } from '../messages'

const MAX_NAME_LENGTH = 200
const MAX_SEATS = 100_000

/** Same rules as the backend, checked first in the browser so the user gets instant feedback. */
function validate(name: string, seatsText: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'ক্লাসের নাম লিখুন। যেমন: Class 6 - Morning Shift'
  if (trimmed.length > MAX_NAME_LENGTH) return 'ক্লাসের নাম ২০০ অক্ষরের বেশি হতে পারবে না।'
  if (!/^[0-9]+$/.test(seatsText.trim())) return 'আসন সংখ্যা হিসেবে একটি পূর্ণ সংখ্যা লিখুন। যেমন: 120'
  const seats = Number(seatsText.trim())
  if (seats < 1 || seats > MAX_SEATS) return 'আসন সংখ্যা ১ থেকে ১,০০,০০০-এর মধ্যে হতে হবে।'
  return null
}

export function CreateClass() {
  const [name, setName] = useState('')
  const [seats, setSeats] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ name: string; totalSeats: number } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setCreated(null)

    const problem = validate(name, seats)
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await api.createClass(name.trim(), Number(seats.trim()))
      setCreated({ name: result.name, totalSeats: result.totalSeats })
      setName('')
      setSeats('')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>ক্লাস তৈরি (school admin)</h2>
      </div>
      <p className="muted">
        প্রতিটি shift আলাদা একটি class। যেমন "Class 6 - Morning Shift" আর "Class 6 - Day Shift" দুটো আলাদা class,
        নিজের আলাদা আসন সংখ্যা নিয়ে।
      </p>

      <form className="card form" onSubmit={submit} noValidate>
        <label>
          ক্লাসের নাম
          <input
            type="text"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Class 6 - Morning Shift"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          আসন সংখ্যা
          <input
            type="text"
            inputMode="numeric"
            value={seats}
            placeholder="120"
            onChange={(e) => setSeats(e.target.value)}
          />
        </label>

        {error && <Alert kind="error">{error}</Alert>}
        {created && (
          <Alert kind="success">
            "{created.name}" তৈরি হয়েছে, আসন {bn(created.totalSeats)}টি। <a href="#/classes">ক্লাস তালিকা দেখুন</a>
          </Alert>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'তৈরি হচ্ছে…' : 'ক্লাস তৈরি করুন'}
        </button>
      </form>
    </section>
  )
}
