import type { Hold } from '../api'
import { Alert, Spinner, StatusBadge } from '../components/ui'
import { effectiveStatus, formatRemaining, remainingMs } from '../format'
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

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>আমার আবেদন</h2>
          <p className="section-desc">শিক্ষার্থীর আবেদনের বর্তমান অবস্থা, মেয়াদ ও ভর্তি নিশ্চিতকরণ</p>
        </div>
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
        <div className="empty">
          <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <p>
            এই শিক্ষার্থীর কোনো আবেদন নেই। <a href="#/classes">ক্লাস তালিকা</a> থেকে আবেদন করুন।
          </p>
        </div>
      )}

      {holds && holds.length > 0 && (
        <div className="table-card">
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
                {holds.map((hold) => {
                  const status = effectiveStatus(hold, now)
                  const isHeld = status === 'HELD'

                  return (
                    <tr key={hold.holdId} className={isHeld ? 'row-held-active' : ''}>
                      <td className="class-name-cell">
                        <span className="class-name">{hold.className ?? hold.classId}</span>
                        <div className="muted small id-sub">আইডি: {hold.holdId}</div>
                      </td>
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td className="countdown-cell">
                        {isHeld ? (
                          <span className="countdown-chip">
                            <span className="chip-clock-dot" />
                            {formatRemaining(remainingMs(hold, now))}
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
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
