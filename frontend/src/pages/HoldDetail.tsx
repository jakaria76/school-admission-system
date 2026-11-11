import { useState } from 'react'
import { api, type HoldStatus } from '../api'
import { Alert, Spinner, StatusBadge } from '../components/ui'
import { effectiveStatus, formatRemaining, remainingMs } from '../format'
import { useNow, usePolling } from '../hooks'
import { errorMessage } from '../messages'

export const HOLD_REFRESH_MS = 3000

interface Props {
  holdId: string
  studentId: string | null
  onChanged: () => void
}

/** The "আবেদন" screen: status, time left, pay and cancel. */
export function HoldDetail({ holdId, studentId, onChanged }: Props) {
  const hold = usePolling(`hold:${holdId}`, () => api.getHold(holdId), HOLD_REFRESH_MS)
  const now = useNow()
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Result of an action we just performed, shown until the next refresh confirms it.
  const [knownStatus, setKnownStatus] = useState<HoldStatus | null>(null)

  if (!hold.data) {
    return (
      <section>
        <h2>আবেদন</h2>
        {hold.loading && <Spinner label="আবেদনের তথ্য লোড হচ্ছে…" />}
        {hold.error !== null && (
          <>
            <Alert kind="error">{errorMessage(hold.error)}</Alert>
            <button type="button" className="btn" onClick={hold.refresh}>
              আবার চেষ্টা করুন
            </button>
          </>
        )}
        <p>
          <a href="#/my">← আমার আবেদন</a>
        </p>
      </section>
    )
  }

  const serverStatus = effectiveStatus(hold.data, now)
  // Trust our own successful action unless the server already reports a final state.
  const status: HoldStatus = serverStatus === 'HELD' && knownStatus ? knownStatus : serverStatus
  const remaining = remainingMs(hold.data, now)
  const isHeld = status === 'HELD'

  async function run(action: 'pay' | 'cancel') {
    if (!studentId || busy) return
    if (action === 'cancel' && !window.confirm('আপনি কি নিশ্চিত যে আবেদনটি বাতিল করতে চান? আসনটি অন্যদের জন্য খুলে যাবে।')) {
      return
    }

    setBusy(action)
    setActionError(null)
    try {
      if (action === 'pay') {
        await api.confirm(holdId, studentId)
        setKnownStatus('CONFIRMED')
      } else {
        await api.cancel(holdId, studentId)
        setKnownStatus('CANCELLED')
      }
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusy(null)
      hold.refresh()
      onChanged()
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>আবেদন</h2>
        <a href="#/my">← আমার আবেদন</a>
      </div>

      <div className="card">
        <dl className="details">
          <dt>ক্লাস</dt>
          <dd>{hold.data.className ?? hold.data.classId}</dd>
          <dt>অবস্থা</dt>
          <dd>
            <StatusBadge status={status} />
          </dd>
          {isHeld && (
            <>
              <dt>মেয়াদ শেষ হতে বাকি</dt>
              <dd className="countdown" data-testid="countdown">
                {formatRemaining(remaining)}
              </dd>
            </>
          )}
        </dl>

        {status === 'HELD' && (
          <p>এই সময়ের মধ্যে ভর্তি ফি জমা দিলে ভর্তি নিশ্চিত হবে। সময় পেরিয়ে গেলে আসনটি অন্যদের জন্য খুলে যাবে।</p>
        )}
        {status === 'CONFIRMED' && <Alert kind="success">ভর্তি ফি জমা হয়েছে। ভর্তি নিশ্চিত। অভিনন্দন!</Alert>}
        {status === 'EXPIRED' && (
          <Alert kind="warning">
            ফি জমা দেওয়ার সময় শেষ হয়ে গেছে, তাই আসনটি ছেড়ে দেওয়া হয়েছে। আসন খালি থাকলে{' '}
            <a href="#/classes">ক্লাস তালিকা</a> থেকে আবার আবেদন করতে পারবেন।
          </Alert>
        )}
        {status === 'CANCELLED' && (
          <Alert kind="info">
            আবেদনটি বাতিল করা হয়েছে। চাইলে <a href="#/classes">ক্লাস তালিকা</a> থেকে আবার আবেদন করতে পারবেন।
          </Alert>
        )}

        {actionError && <Alert kind="error">{actionError}</Alert>}
        {hold.error !== null && (
          <Alert kind="error">
            {errorMessage(hold.error)} সংযোগ ফিরলে তথ্য নিজে থেকে হালনাগাদ হবে।
          </Alert>
        )}
        {isHeld && !studentId && (
          <Alert kind="info">ফি দিতে বা বাতিল করতে উপরের ঘরে শিক্ষার্থীর জন্ম নিবন্ধন নম্বর লিখুন।</Alert>
        )}

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isHeld || !studentId || busy !== null}
            onClick={() => run('pay')}
          >
            {busy === 'pay' ? 'ফি জমা হচ্ছে…' : 'ভর্তি ফি দিন'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!isHeld || !studentId || busy !== null}
            onClick={() => run('cancel')}
          >
            {busy === 'cancel' ? 'বাতিল হচ্ছে…' : 'বাতিল'}
          </button>
        </div>
      </div>
    </section>
  )
}
