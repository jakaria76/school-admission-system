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

  return (
    <section>
      <div className="section-head">
        <h2>ক্লাস তালিকা</h2>
        <span className="muted">আসন সংখ্যা প্রতি {bn(CLASS_REFRESH_MS / 1000)} সেকেন্ডে নিজে থেকে হালনাগাদ হয়</span>
      </div>

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
        <p className="empty">
          এখনো কোনো ক্লাস তৈরি হয়নি। <a href="#/admin">"ক্লাস তৈরি"</a> পেজ থেকে নতুন ক্লাস যোগ করুন।
        </p>
      )}

      {classes.data && classes.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ক্লাস</th>
                <th className="num">মোট আসন</th>
                <th className="num">Hold-এ আছে</th>
                <th className="num">নিশ্চিত</th>
                <th className="num">খালি</th>
                <th>আবেদন</th>
              </tr>
            </thead>
            <tbody>
              {classes.data.map((item) => {
                const myHold = mine.get(item.id)
                const full = item.availableSeats <= 0
                return (
                  <tr key={item.id} data-testid={`class-${item.id}`}>
                    <td>{item.name}</td>
                    <td className="num" data-testid="total-seats">{bn(item.totalSeats)}</td>
                    <td className="num" data-testid="held-seats">{bn(item.heldSeats)}</td>
                    <td className="num" data-testid="confirmed-seats">{bn(item.confirmedSeats)}</td>
                    <td className={`num ${full ? 'none-left' : 'some-left'}`} data-testid="available-seats">
                      {bn(item.availableSeats)}
                    </td>
                    <td>
                      {myHold ? (
                        <a className="btn btn-link" href={`#/holds/${myHold.holdId}`}>
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
                          {applyingTo === item.id ? 'আবেদন হচ্ছে…' : 'আবেদন করুন'}
                        </button>
                      )}
                      {full && !myHold && <div className="muted small">আসন খালি নেই</div>}
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
