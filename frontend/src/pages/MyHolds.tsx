import { useState, useMemo } from 'react'
import type { Hold, HoldStatus } from '../api'
import { Alert, Spinner, StatusBadge } from '../components/ui'
import { bn, effectiveStatus, formatRemaining, remainingMs } from '../format'
import { useNow } from '../hooks'
import { errorMessage } from '../messages'

interface Props {
  studentId: string | null
  holds: Hold[] | null
  loading: boolean
  error: unknown
}

/** "আমার আবেদন": every application of this student, straight from the server. */
export function MyHolds({ studentId, holds, loading, error }: Props) {
  const now = useNow()
  const [filter, setFilter] = useState<'ALL' | 'HELD' | 'CONFIRMED' | 'DONE'>('ALL')

  const processedHolds = useMemo(() => {
    if (!holds) return []
    return holds.map((h) => ({
      ...h,
      effective: effectiveStatus(h, now),
      remaining: remainingMs(h, now),
    }))
  }, [holds, now])

  const filteredHolds = useMemo(() => {
    return processedHolds.filter((h) => {
      if (filter === 'ALL') return true
      if (filter === 'HELD') return h.effective === 'HELD'
      if (filter === 'CONFIRMED') return h.effective === 'CONFIRMED'
      if (filter === 'DONE') return h.effective === 'EXPIRED' || h.effective === 'CANCELLED'
      return true
    })
  }, [processedHolds, filter])

  const heldCount = processedHolds.filter((h) => h.effective === 'HELD').length
  const confirmedCount = processedHolds.filter((h) => h.effective === 'CONFIRMED').length

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>আমার আবেদন</h2>
          <p className="section-desc">শিক্ষার্থীর সকল আবেদনের বর্তমান অবস্থা, মেয়াদ ও ভর্তি নিশ্চিতকরণ</p>
        </div>

        {holds && holds.length > 0 && (
          <div className="my-holds-summary">
            <span className="summary-pill">মোট আবেদন: <strong>{bn(holds.length)}</strong></span>
            {heldCount > 0 && (
              <span className="summary-pill summary-held">চলমান Hold: <strong>{bn(heldCount)}</strong></span>
            )}
            {confirmedCount > 0 && (
              <span className="summary-pill summary-confirmed">ভর্তি নিশ্চিত: <strong>{bn(confirmedCount)}</strong></span>
            )}
          </div>
        )}
      </div>

      {!studentId && (
        <Alert kind="info">নিজের আবেদন দেখতে উপরের ঘরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।</Alert>
      )}
      {error !== null && (
        <Alert kind="error">
          {errorMessage(error)}
          {holds && ' নিচে শেষবার পাওয়া তথ্য দেখানো হচ্ছে।'}
        </Alert>
      )}
      {loading && <Spinner label="আবেদনের তালিকা লোড হচ্ছে…" />}

      {holds && holds.length === 0 && (
        <p className="empty">
          এই শিক্ষার্থীর কোনো আবেদন নেই। <a href="#/classes">ক্লাস তালিকা</a> থেকে আবেদন করুন।
        </p>
      )}

      {holds && holds.length > 0 && (
        <div className="table-card">
          {/* Status Filter Toolbar */}
          <div className="table-toolbar">
            <div className="filter-chips">
              <button
                type="button"
                className={`filter-btn ${filter === 'ALL' ? 'filter-active' : ''}`}
                onClick={() => setFilter('ALL')}
              >
                সকল আবেদন ({bn(holds.length)})
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'HELD' ? 'filter-active' : ''}`}
                onClick={() => setFilter('HELD')}
              >
                চলমান Hold ({bn(heldCount)})
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'CONFIRMED' ? 'filter-active' : ''}`}
                onClick={() => setFilter('CONFIRMED')}
              >
                ভর্তি নিশ্চিত ({bn(confirmedCount)})
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'DONE' ? 'filter-active' : ''}`}
                onClick={() => setFilter('DONE')}
              >
                অন্যান্য
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>ক্লাস</th>
                  <th>অবস্থা</th>
                  <th>মেয়াদ শেষ হতে বাকি</th>
                  <th className="text-right">পদক্ষেপ</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolds.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-muted">
                      এই বিভাগে কোনো আবেদন নেই।
                    </td>
                  </tr>
                ) : (
                  filteredHolds.map((hold) => {
                    const status: HoldStatus = hold.effective
                    const isHeld = status === 'HELD'

                    return (
                      <tr key={hold.holdId} className={isHeld ? 'row-held-active' : ''}>
                        <td className="class-name-cell">
                          <span className="class-name">{hold.className ?? hold.classId}</span>
                          <div className="muted small id-sub">আবেদন আইডি: {hold.holdId}</div>
                        </td>
                        <td>
                          <StatusBadge status={status} />
                        </td>
                        <td className="countdown-cell">
                          {isHeld ? (
                            <span className="countdown-chip">
                              <span className="chip-clock-dot" />
                              {formatRemaining(hold.remaining)}
                            </span>
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </td>
                        <td className="text-right">
                          <a
                            className={`btn ${isHeld ? 'btn-pay-sm' : status === 'CONFIRMED' ? 'btn-confirmed' : 'btn-link'}`}
                            href={`#/holds/${hold.holdId}`}
                          >
                            {isHeld ? 'ফি দিন / বাতিল করুন' : 'বিস্তারিত'}
                          </a>
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
