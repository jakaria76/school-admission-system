import { useState } from 'react'
import { api, type Hold } from '../api'
import { Alert, Spinner } from '../components/ui'
import { bn, effectiveStatus } from '../format'
import { navigate, useNow, usePolling } from '../hooks'
import { errorMessage } from '../messages'

export const CLASS_REFRESH_MS = 3000

interface Props {
  studentId: string | null
  myHolds: Hold[] | null
  onChanged: () => void
}

export function ClassList({ studentId, myHolds, onChanged }: Props) {
  const classes = usePolling('classes', api.listClasses, CLASS_REFRESH_MS)
  const now = useNow()
  const [applyingTo, setApplyingTo] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // The student's current application / admission per class, if any.
  const mine = new Map<string, Hold>()
  for (const hold of myHolds ?? []) {
    const status = effectiveStatus(hold, now)
    if ((status === 'HELD' || status === 'CONFIRMED') && !mine.has(hold.classId)) mine.set(hold.classId, hold)
  }

  async function apply(classId: string) {
    if (!studentId || applyingTo) return
    setApplyingTo(classId)
    setActionError(null)
    try {
      const hold = await api.apply(classId, studentId)
      onChanged()
      navigate(`/holds/${hold.holdId}`)
    } catch (error) {
      setActionError(errorMessage(error))
      classes.refresh()
      onChanged()
    } finally {
      setApplyingTo(null)
    }
  }

  // Calculate high-level metrics for the stats cards
  const totalClasses = classes.data?.length ?? 0
  const totalSeats = classes.data?.reduce((acc, c) => acc + c.totalSeats, 0) ?? 0
  const totalHeld = classes.data?.reduce((acc, c) => acc + c.heldSeats, 0) ?? 0
  const totalConfirmed = classes.data?.reduce((acc, c) => acc + c.confirmedSeats, 0) ?? 0
  const totalAvailable = classes.data?.reduce((acc, c) => acc + c.availableSeats, 0) ?? 0

  return (
    <section>
      {/* Section Header */}
      <div className="section-head">
        <div>
          <h2>ক্লাস তালিকা</h2>
          <p className="section-desc">সকল শ্রেণির আসন সংখ্যা ও খালি আসনের সরাসরি বিবরণ</p>
        </div>
        <div className="live-sync-indicator">
          <span className="live-sync-dot" />
          <span className="muted">আসন সংখ্যা প্রতি {bn(CLASS_REFRESH_MS / 1000)} সেকেন্ডে নিজে থেকে হালনাগাদ হয়</span>
        </div>
      </div>

      {/* Metric Stat Cards */}
      {classes.data && classes.data.length > 0 && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">মোট ক্লাস</span>
            <span className="stat-value">{bn(totalClasses)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">সর্বমোট আসন</span>
            <span className="stat-value">{bn(totalSeats)}</span>
          </div>
          <div className="stat-card stat-card-held">
            <span className="stat-label">হোল্ডে আছে (Hold)</span>
            <span className="stat-value">{bn(totalHeld)}</span>
          </div>
          <div className="stat-card stat-card-confirmed">
            <span className="stat-label">ভর্তি নিশ্চিত</span>
            <span className="stat-value">{bn(totalConfirmed)}</span>
          </div>
          <div className="stat-card stat-card-available">
            <span className="stat-label">খালি আসন</span>
            <span className="stat-value">{bn(totalAvailable)}</span>
          </div>
        </div>
      )}

      {!studentId && (
        <Alert kind="info">আবেদন করতে উপরের ঘরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।</Alert>
      )}
      {actionError && <Alert kind="error">{actionError}</Alert>}
      {classes.error !== null && (
        <Alert kind="error">
          {errorMessage(classes.error)}
          {classes.data && ' নিচে শেষবার পাওয়া তথ্য দেখানো হচ্ছে; সংযোগ ফিরলে নিজে থেকে হালনাগাদ হবে।'}
        </Alert>
      )}

      {classes.loading && <Spinner label="ক্লাসের তালিকা লোড হচ্ছে…" />}

      {classes.data && classes.data.length === 0 && (
        <div className="empty">
          <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <p>
            এখনো কোনো ক্লাস তৈরি হয়নি। <a href="#/admin">"ক্লাস তৈরি"</a> পেজ থেকে নতুন ক্লাস যোগ করুন।
          </p>
        </div>
      )}

      {classes.data && classes.data.length > 0 && (
        <div className="table-card">
          <div className="table-wrap">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>ক্লাস</th>
                  <th className="num">মোট আসন</th>
                  <th className="num">Hold-এ আছে</th>
                  <th className="num">নিশ্চিত</th>
                  <th className="num">খালি</th>
                  <th className="text-center">আবেদন</th>
                </tr>
              </thead>
              <tbody>
                {classes.data.map((item) => {
                  const myHold = mine.get(item.id)
                  const full = item.availableSeats <= 0
                  const filledSeats = item.heldSeats + item.confirmedSeats
                  const fillPercentage = Math.min(100, Math.round((filledSeats / item.totalSeats) * 100))

                  return (
                    <tr key={item.id} data-testid={`class-${item.id}`} className={full ? 'row-full' : ''}>
                      <td className="class-name-cell">
                        <div className="class-name-wrap">
                          <span className="class-name">{item.name}</span>
                          <div className="progress-bar-wrap" title={`${bn(fillPercentage)}% আসন পূর্ণ`}>
                            <div
                              className={`progress-bar-fill ${full ? 'progress-full' : ''}`}
                              style={{ width: `${fillPercentage}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="num" data-testid="total-seats">
                        <span className="seat-chip chip-total">{bn(item.totalSeats)}</span>
                      </td>
                      <td className="num" data-testid="held-seats">
                        <span className={`seat-chip ${item.heldSeats > 0 ? 'chip-held' : 'chip-zero'}`}>
                          {bn(item.heldSeats)}
                        </span>
                      </td>
                      <td className="num" data-testid="confirmed-seats">
                        <span className={`seat-chip ${item.confirmedSeats > 0 ? 'chip-confirmed' : 'chip-zero'}`}>
                          {bn(item.confirmedSeats)}
                        </span>
                      </td>
                      <td className={`num ${full ? 'none-left' : 'some-left'}`} data-testid="available-seats">
                        <span className={`seat-chip ${full ? 'chip-danger' : 'chip-available'}`}>
                          {bn(item.availableSeats)}
                        </span>
                      </td>
                      <td className="action-cell">
                        {myHold ? (
                          <a
                            className={`btn ${myHold.status === 'CONFIRMED' ? 'btn-confirmed' : 'btn-link'}`}
                            href={`#/holds/${myHold.holdId}`}
                          >
                            {myHold.status === 'CONFIRMED' ? 'ভর্তি নিশ্চিত ✓ (দেখুন)' : 'আপনার আবেদন দেখুন'}
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!studentId || full || applyingTo !== null}
                            title={
                              !studentId
                                ? 'আগে উপরে জন্ম নিবন্ধন নম্বর লিখুন'
                                : full
                                  ? 'এই ক্লাসে এখন কোনো আসন খালি নেই'
                                  : undefined
                            }
                            onClick={() => apply(item.id)}
                          >
                            {applyingTo === item.id ? (
                              <>
                                <span className="btn-spinner" /> আবেদন হচ্ছে…
                              </>
                            ) : (
                              'আবেদন করুন'
                            )}
                          </button>
                        )}
                        {full && !myHold && <div className="muted small seat-full-label">আসন খালি নেই</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
