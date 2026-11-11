import { useState } from 'react'
import { api, type HoldStatus } from '../api'
import { Alert, Spinner, StatusBadge } from '../components/ui'
import { bn, effectiveStatus, formatRemaining, remainingMs } from '../format'
import { useNow, usePolling } from '../hooks'
import { errorMessage } from '../messages'

export const HOLD_REFRESH_MS = 3000

interface Props {
  holdId: string
  studentId: string | null
  onChanged: () => void
  /** Asks the app to point the user at the student-number box. */
  onNeedStudentId: () => void
}

/** The "আবেদন" screen: status, time left, pay and cancel. */
export function HoldDetail({ holdId, studentId, onChanged, onNeedStudentId }: Props) {
  const hold = usePolling(`hold:${holdId}`, () => api.getHold(holdId), HOLD_REFRESH_MS)
  const now = useNow()
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Result of an action we just performed, shown until the next refresh confirms it.
  const [knownStatus, setKnownStatus] = useState<HoldStatus | null>(null)

  if (!hold.data) {
    return (
      <section className="detail-section">
        <div className="section-head">
          <h2>আবেদনের বিবরণ</h2>
          <a href="#/my" className="back-link">
            ← আমার আবেদন
          </a>
        </div>
        <div className="card loading-card">
          {hold.loading && <Spinner label="আবেদনের তথ্য লোড হচ্ছে…" />}
          {hold.error !== null && (
            <>
              <Alert kind="error">{errorMessage(hold.error)}</Alert>
              <button type="button" className="btn btn-primary" onClick={hold.refresh}>
                আবার চেষ্টা করুন
              </button>
            </>
          )}
        </div>
      </section>
    )
  }

  const serverStatus = effectiveStatus(hold.data, now)
  // Trust our own successful action unless the server already reports a final state.
  const status: HoldStatus = serverStatus === 'HELD' && knownStatus ? knownStatus : serverStatus
  const remaining = remainingMs(hold.data, now)
  const isHeld = status === 'HELD'
  const isUrgent = isHeld && remaining < 120_000 // less than 2 minutes

  async function run(action: 'pay' | 'cancel') {
    if (busy) return
    if (!studentId) {
      onNeedStudentId()
      return
    }
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

  function copyId() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(holdId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <section className="detail-section">
      <div className="section-head">
        <div>
          <h2>আবেদন বিবরণ ও ভর্তি নিশ্চিতকরণ</h2>
          <div className="id-sub-row">
            <span className="muted small">আবেদন আইডি:</span>
            <code className="id-code">{hold.data.holdId}</code>
            <button type="button" onClick={copyId} className="copy-btn" title="আইডি কপি করুন">
              {copied ? '✓ কপি হয়েছে' : 'কপি করুন'}
            </button>
          </div>
        </div>
        <a href="#/my" className="back-link">
          ← আমার আবেদন
        </a>
      </div>

      <div className="card hold-card">
        {/* Visual Progress Stepper */}
        <div className="stepper">
          <div className={`step-item ${status === 'HELD' || status === 'CONFIRMED' ? 'step-done' : ''}`}>
            <div className="step-circle">১</div>
            <div className="step-label">আসন সংরক্ষণ (Hold)</div>
          </div>
          <div className={`step-line ${status === 'CONFIRMED' ? 'line-done' : ''}`} />
          <div className={`step-item ${status === 'CONFIRMED' ? 'step-done' : isHeld ? 'step-active' : ''}`}>
            <div className="step-circle">২</div>
            <div className="step-label">ভর্তি ফি পরিশোধ</div>
          </div>
          <div className={`step-line ${status === 'CONFIRMED' ? 'line-done' : ''}`} />
          <div className={`step-item ${status === 'CONFIRMED' ? 'step-done' : ''}`}>
            <div className="step-circle">৩</div>
            <div className="step-label">ভর্তি চূড়ান্ত</div>
          </div>
        </div>

        {/* Live Countdown Timer Hero (When HELD) */}
        {isHeld && (
          <div className={`timer-hero ${isUrgent ? 'timer-urgent' : ''}`}>
            <div className="timer-badge">
              <svg className="timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>মেয়াদ শেষ হতে বাকি</span>
            </div>
            <div className="countdown" data-testid="countdown">
              {formatRemaining(remaining)}
            </div>
            <p className="timer-note">
              {isUrgent ? '⚠️ সময় প্রায় শেষ! আসন ধরে রাখতে দ্রুত ভর্তি ফি জমা দিন।' : 'এই সময়ের মধ্যে ভর্তি ফি প্রদান করে আসনটি নিশ্চিত করুন।'}
            </p>
          </div>
        )}

        {/* Confirmed Admission Celebration Banner */}
        {status === 'CONFIRMED' && (
          <div className="success-hero">
            <div className="success-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>অভিনন্দন! ভর্তি সম্পন্ন হয়েছে</h3>
            <p className="success-desc">ভর্তি ফি সফলভাবে জমা হয়েছে। শিক্ষার্থী এই ক্লাসে চূড়ান্তভাবে ভর্তিকৃত।</p>
            <button type="button" onClick={handlePrint} className="btn btn-print no-print">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
              </svg>
              ভর্তি নিশ্চিতকরণ রসিদ প্রিন্ট করুন
            </button>
          </div>
        )}

        {/* Key Detail List */}
        <div className="detail-grid">
          <dl className="details">
            <dt>ক্লাস</dt>
            <dd className="detail-value-strong">{hold.data.className ?? hold.data.classId}</dd>
            <dt>অবস্থা</dt>
            <dd>
              <StatusBadge status={status} />
            </dd>
            {isHeld && (
              <>
                <dt>মেয়াদ শেষ হতে বাকি</dt>
                <dd className="countdown-text">
                  {formatRemaining(remaining)}
                </dd>
              </>
            )}
            {hold.data.studentId && (
              <>
                <dt>শিক্ষার্থীর নম্বর</dt>
                <dd>{bn(hold.data.studentId)}</dd>
              </>
            )}
          </dl>
        </div>

        {status === 'HELD' && (
          <div className="info-banner">
            <svg className="banner-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <p>এই সময়ের মধ্যে ভর্তি ফি জমা দিলে ভর্তি নিশ্চিত হবে। সময় পেরিয়ে গেলে আসনটি অন্যদের জন্য খুলে যাবে।</p>
          </div>
        )}
        {status === 'CONFIRMED' && (
          <Alert kind="success">ভর্তি ফি জমা হয়েছে। ভর্তি নিশ্চিত। অভিনন্দন!</Alert>
        )}
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

        <div className="actions no-print">
          <button
            type="button"
            className="btn btn-pay"
            disabled={!isHeld || busy !== null}
            onClick={() => run('pay')}
          >
            {busy === 'pay' ? (
              <>
                <span className="btn-spinner" /> ফি জমা হচ্ছে…
              </>
            ) : (
              <>
                <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                  <path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 001 5.5V6h18v-.5A1.5 1.5 0 0017.5 4h-15zM19 8.5H1v6A1.5 1.5 0 002.5 16h15a1.5 1.5 0 001.5-1.5v-6zM3 13.25a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zm4.75-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
                </svg>
                ভর্তি ফি দিন
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!isHeld || busy !== null}
            onClick={() => run('cancel')}
          >
            {busy === 'cancel' ? (
              <>
                <span className="btn-spinner" /> বাতিল হচ্ছে…
              </>
            ) : (
              'বাতিল'
            )}
          </button>
        </div>
      </div>
    </section>
  )
}
