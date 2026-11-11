import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Alert } from '../components/ui'
import { bn } from '../format'
import { errorMessage } from '../messages'

const MAX_NAME_LENGTH = 200
const MAX_SEATS = 100_000

const SEAT_PRESETS = [30, 40, 60, 80, 100, 120]
const CLASS_PRESETS = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']
const SHIFT_PRESETS = ['Morning Shift', 'Day Shift']

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

  function appendShift(shift: string) {
    if (!name.trim()) {
      setName(`Class 6 - ${shift}`)
    } else if (name.includes(' - ')) {
      const base = name.split(' - ')[0].trim()
      setName(`${base} - ${shift}`)
    } else {
      setName(`${name.trim()} - ${shift}`)
    }
  }

  function setBaseClass(className: string) {
    if (name.includes(' - ')) {
      const shift = name.split(' - ')[1].trim()
      setName(`${className} - ${shift}`)
    } else {
      setName(className)
    }
  }

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
        <div>
          <h2>ক্লাস তৈরি (school admin)</h2>
          <p className="section-desc">
            নতুন ক্লাস ও প্রতিটি শিফটের জন্য আসন সংখ্যা নির্ধারণ করুন
          </p>
        </div>
      </div>

      <div className="admin-grid">
        <div className="card admin-form-card">
          <div className="admin-badge">
            <svg className="admin-badge-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            অ্যাডমিন প্যানেল
          </div>

          <p className="muted form-explanation">
            প্রতিটি shift আলাদা একটি class। যেমন "Class 6 - Morning Shift" আর "Class 6 - Day Shift" দুটো আলাদা class,
            নিজের আলাদা আসন সংখ্যা নিয়ে।
          </p>

          <form className="form" onSubmit={submit} noValidate>
            <label className="form-field">
              <span className="field-label">ক্লাসের নাম</span>
              <input
                type="text"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                placeholder="যেমন: Class 6 - Morning Shift"
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
              <span className="field-hint">শাখা বা শিফটসহ স্পষ্ট নাম লিখুন</span>
            </label>

            {/* Quick helper buttons for class and shift */}
            <div className="quick-helpers">
              <div className="helper-row">
                <span className="helper-title">শ্রেণি:</span>
                {CLASS_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBaseClass(c)}
                    className="chip-btn"
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="helper-row">
                <span className="helper-title">শিফট যোগ:</span>
                {SHIFT_PRESETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => appendShift(s)}
                    className="chip-btn chip-shift"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>

            <label className="form-field">
              <span className="field-label">আসন সংখ্যা</span>
              <input
                type="text"
                inputMode="numeric"
                value={seats}
                placeholder="যেমন: 120"
                onChange={(e) => setSeats(e.target.value)}
                className="form-input"
              />
            </label>

            <div className="seat-presets">
              <span className="presets-title">দ্রুত আসন নির্বাচন:</span>
              {SEAT_PRESETS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSeats(String(count))}
                  className={`preset-btn ${seats === String(count) ? 'preset-active' : ''}`}
                >
                  {bn(count)} আসন
                </button>
              ))}
            </div>

            {error && <Alert kind="error">{error}</Alert>}
            {created && (
              <Alert kind="success">
                "{created.name}" তৈরি হয়েছে, আসন {bn(created.totalSeats)}টি। <a href="#/classes">ক্লাস তালিকা দেখুন</a>
              </Alert>
            )}

            <button type="submit" className="btn btn-primary btn-submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="btn-spinner" /> তৈরি হচ্ছে…
                </>
              ) : (
                <>
                  <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  ক্লাস তৈরি করুন
                </>
              )}
            </button>
          </form>
        </div>

        {/* Live Interactive Preview Card */}
        <div className="preview-card-wrap">
          <div className="card preview-card">
            <div className="preview-header">
              <h3 className="preview-title">লাইভ প্রিভিউ</h3>
              <span className="live-preview-tag">স্বয়ংক্রিয় প্রিভিউ</span>
            </div>
            <p className="preview-subtitle">তৈরি করার পর ক্লাস তালিকায় যেভাবে প্রদর্শিত হবে:</p>

            <div className="preview-box">
              <div className="preview-class-header">
                <span className="preview-name">{name.trim() || 'Class 6 - Morning Shift'}</span>
                <span className="seat-chip chip-available">
                  খালি: {seats && !isNaN(Number(seats)) ? bn(seats) : '১২০'}
                </span>
              </div>

              <div className="preview-stats">
                <div className="preview-stat-item">
                  <span className="muted small">মোট আসন</span>
                  <strong>{seats && !isNaN(Number(seats)) ? bn(seats) : '১২০'}</strong>
                </div>
                <div className="preview-stat-item">
                  <span className="muted small">হোল্ড</span>
                  <strong>০</strong>
                </div>
                <div className="preview-stat-item">
                  <span className="muted small">নিশ্চিত</span>
                  <strong>০</strong>
                </div>
              </div>

              <div className="preview-bar-wrap">
                <div className="preview-bar-fill" style={{ width: '0%' }} />
              </div>
              <span className="preview-bar-label">০% আসন পূর্ণ • {seats && !isNaN(Number(seats)) ? bn(seats) : '১২০'}টি আসন উন্মুক্ত থাকবে</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
