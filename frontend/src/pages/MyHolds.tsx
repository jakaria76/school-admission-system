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
        <h2>আমার আবেদন</h2>
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ক্লাস</th>
                <th>অবস্থা</th>
                <th>মেয়াদ শেষ হতে বাকি</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => {
                const status = effectiveStatus(hold, now)
                return (
                  <tr key={hold.holdId}>
                    <td>{hold.className ?? hold.classId}</td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td className="countdown-cell">
                      {status === 'HELD' ? formatRemaining(remainingMs(hold, now)) : '-'}
                    </td>
                    <td>
                      <a className="btn btn-link" href={`#/holds/${hold.holdId}`}>
                        {status === 'HELD' ? 'ফি দিন / বাতিল করুন' : 'বিস্তারিত'}
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
