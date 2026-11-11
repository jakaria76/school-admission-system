import { useState, useMemo } from 'react'
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
  /** Asks the app to point the user at the student-number box. */
  onNeedStudentId: () => void
}

export function ClassList({ studentId, myHolds, onChanged, onNeedStudentId }: Props) {
  const classes = usePolling('classes', api.listClasses, CLASS_REFRESH_MS)
  const now = useNow()
  const [applyingTo, setApplyingTo] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'ALL' | 'AVAILABLE' | 'FULL'>('ALL')

  // The student's current application / admission per class, if any.
  const mine = new Map<string, Hold>()
  for (const hold of myHolds ?? []) {
    const status = effectiveStatus(hold, now)
    if ((status === 'HELD' || status === 'CONFIRMED') && !mine.has(hold.classId)) mine.set(hold.classId, hold)
  }

  async function apply(classId: string) {
    if (applyingTo) return
    if (!studentId) {
      // A dead button explains nothing: say what is missing and take the user there.
      onNeedStudentId()
      return
    }
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

  // Filtered classes based on search and seat availability
  const filteredClasses = useMemo(() => {
    if (!classes.data) return []
    return classes.data.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      if (!matchesSearch) return false
      if (filterType === 'AVAILABLE') return item.availableSeats > 0
      if (filterType === 'FULL') return item.availableSeats <= 0
      return true
    })
  }, [classes.data, searchQuery, filterType])

  // Summary Metrics
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
        <div className="live-sync-indicator" title="সার্ভারের সাথে স্বয়ংক্রিয় সিঙ্ক হচ্ছে">
          <span className="live-sync-dot" />
          <span className="muted">আসন সংখ্যা প্রতি {bn(CLASS_REFRESH_MS / 1000)} সেকেন্ডে নিজে থেকে হালনাগাদ হয়</span>
        </div>
      </div>

      {/* Metric Stat Cards */}
      {classes.data && classes.data.length > 0 && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">মোট ক্লাস</span>
              <svg className="stat-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
              </svg>
            </div>
            <span className="stat-value">{bn(totalClasses)}</span>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-label">সর্বমোট আসন</span>
              <svg className="stat-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            </div>
            <span className="stat-value">{bn(totalSeats)}</span>
          </div>

          <div className="stat-card stat-card-held">
            <div className="stat-card-header">
              <span className="stat-label">হোল্ডে আছে (Hold)</span>
              <svg className="stat-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="stat-value">{bn(totalHeld)}</span>
          </div>

          <div className="stat-card stat-card-confirmed">
            <div className="stat-card-header">
              <span className="stat-label">ভর্তি নিশ্চিত</span>
              <svg className="stat-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="stat-value">{bn(totalConfirmed)}</span>
          </div>

          <div className="stat-card stat-card-available">
            <div className="stat-card-header">
              <span className="stat-label">খালি আসন</span>
              <svg className="stat-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <span className="stat-value">{bn(totalAvailable)}</span>
          </div>
        </div>
      )}

      {!studentId && (
        <Alert kind="info">
          <strong>ধাপ ১:</strong> উপরের ঘরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।{' '}
          <strong>ধাপ ২:</strong> পছন্দের ক্লাসের পাশে "আবেদন করুন" চাপুন।
        </Alert>
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
        <p className="empty">
          এখনো কোনো ক্লাস তৈরি হয়নি। <a href="#/admin">"ক্লাস তৈরি"</a> পেজ থেকে নতুন ক্লাস যোগ করুন।
        </p>
      )}

      {classes.data && classes.data.length > 0 && (
        <div className="table-card">
          {/* Quick Search & Filter Toolbar */}
          <div className="table-toolbar">
            <div className="search-wrap">
              <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                placeholder="ক্লাস খুঁজুন (যেমন: Class 6, Morning...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="search-clear">
                  ✕
                </button>
              )}
            </div>

            <div className="filter-chips">
              <button
                type="button"
                className={`filter-btn ${filterType === 'ALL' ? 'filter-active' : ''}`}
                onClick={() => setFilterType('ALL')}
              >
                সব ({bn(classes.data.length)})
              </button>
              <button
                type="button"
                className={`filter-btn ${filterType === 'AVAILABLE' ? 'filter-active' : ''}`}
                onClick={() => setFilterType('AVAILABLE')}
              >
                খালি আছে
              </button>
              <button
                type="button"
                className={`filter-btn ${filterType === 'FULL' ? 'filter-active' : ''}`}
                onClick={() => setFilterType('FULL')}
              >
                পূর্ণ
              </button>
            </div>
          </div>

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
                {filteredClasses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted">
                      কোনো ক্লাস খুঁজে পাওয়া যায়নি।
                    </td>
                  </tr>
                ) : (
                  filteredClasses.map((item) => {
                    const myHold = mine.get(item.id)
                    const full = item.availableSeats <= 0
                    const filledSeats = item.heldSeats + item.confirmedSeats
                    const fillPercentage = Math.min(100, Math.round((filledSeats / item.totalSeats) * 100))

                    // Extract shift tag if present in name
                    const isMorning = item.name.toLowerCase().includes('morning')
                    const isDay = item.name.toLowerCase().includes('day')

                    return (
                      <tr key={item.id} data-testid={`class-${item.id}`} className={full ? 'row-full' : ''}>
                        <td className="class-name-cell">
                          <div className="class-name-wrap">
                            <div className="class-title-row">
                              <span className="class-name">{item.name}</span>
                              {isMorning && <span className="shift-badge shift-morning">প্রভাতি</span>}
                              {isDay && <span className="shift-badge shift-day">দিবা</span>}
                            </div>
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
                              disabled={full || applyingTo !== null}
                              title={full ? 'এই ক্লাসে এখন কোনো আসন খালি নেই' : undefined}
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
