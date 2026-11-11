import { useRef, useState, useSyncExternalStore } from 'react'
import { api, getConnectionState, subscribeConnectionState } from './api'
import { bn, effectiveStatus, isValidStudentId, normalizeStudentId } from './format'
import { useHashRoute, useNow, usePolling } from './hooks'
import { ClassList } from './pages/ClassList'
import { CreateClass } from './pages/CreateClass'
import { HoldDetail } from './pages/HoldDetail'
import { MyHolds } from './pages/MyHolds'

const STUDENT_ID_KEY = 'admission.studentId'
const MY_HOLDS_REFRESH_MS = 3000
/** A well-formed number for trying the app out (the example from the assignment brief). */
const SAMPLE_STUDENT_ID = '20152691234567890'

const CONNECTION_LABEL = {
  connecting: 'সংযোগ হচ্ছে…',
  online: 'সার্ভার সংযুক্ত',
  offline: 'সার্ভার বিচ্ছিন্ন',
} as const

// localStorage can be unavailable (private mode, blocked storage); the app must still work.
function loadStudentId(): string {
  try {
    return normalizeStudentId(window.localStorage.getItem(STUDENT_ID_KEY) ?? '')
  } catch {
    return ''
  }
}

function saveStudentId(value: string) {
  try {
    window.localStorage.setItem(STUDENT_ID_KEY, value)
  } catch {
    // Nothing to do: the number simply will not be remembered.
  }
}

export default function App() {
  const route = useHashRoute()
  const now = useNow()
  const [studentIdInput, setStudentIdInput] = useState(loadStudentId)
  const studentId = isValidStudentId(studentIdInput) ? studentIdInput : null
  const connection = useSyncExternalStore(subscribeConnectionState, getConnectionState)
  const studentInputRef = useRef<HTMLInputElement>(null)
  // Counts the times the user tried an action that needs the number. It also restarts
  // the attention animation, so pressing the button again visibly reacts again.
  const [idRequested, setIdRequested] = useState(0)
  const needsId = idRequested > 0 && !studentId

  // The student's applications live on the server, so they are still here after a
  // refresh or after closing and reopening the browser.
  const myHolds = usePolling(
    studentId ? `my-holds:${studentId}` : null,
    () => api.myHolds(studentId!),
    MY_HOLDS_REFRESH_MS,
  )
  const activeCount = (myHolds.data ?? []).filter((hold) => effectiveStatus(hold, now) === 'HELD').length

  function onStudentIdChange(raw: string) {
    const value = normalizeStudentId(raw)
    setStudentIdInput(value)
    saveStudentId(value)
  }

  function clearStudentId() {
    setStudentIdInput('')
    saveStudentId('')
  }

  /** Called by pages when an action needs the student number: point the user at the box. */
  function requestStudentId() {
    setIdRequested((n) => n + 1)
    const input = studentInputRef.current
    if (input) {
      input.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      input.focus({ preventScroll: true })
    }
  }

  const holdMatch = /^\/holds\/([^/]+)$/.exec(route)
  const tab = holdMatch ? '/my' : route

  let page
  if (holdMatch) {
    const holdId = decodeURIComponent(holdMatch[1])
    page = (
      <HoldDetail
        key={holdId}
        holdId={holdId}
        studentId={studentId}
        onChanged={myHolds.refresh}
        onNeedStudentId={requestStudentId}
      />
    )
  } else if (route === '/admin') {
    page = <CreateClass />
  } else if (route === '/my') {
    page = <MyHolds studentId={studentId} holds={myHolds.data} loading={myHolds.loading} error={myHolds.error} />
  } else {
    page = (
      <ClassList
        studentId={studentId}
        myHolds={myHolds.data}
        onChanged={myHolds.refresh}
        onNeedStudentId={requestStudentId}
      />
    )
  }

  return (
    <div className="layout">
      {/* Brand Header */}
      <header className="brand-header">
        <div className="brand-header-inner">
          <div className="brand-identity">
            <div className="brand-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <div>
              <div className="brand-title-wrap">
                <h1 className="brand-title">স্কুল ভর্তি</h1>
                <span className={`live-status-pill status-${connection}`} role="status">
                  <span className="live-dot" />
                  {CONNECTION_LABEL[connection]}
                </span>
              </div>
              <p className="brand-subtitle">স্বচ্ছ ও স্বয়ংক্রিয় অনলাইন আসন সংরক্ষণ ও ভর্তি পোর্টাল</p>
            </div>
          </div>

          {/* Student Identity Box */}
          <div className={`student-card ${needsId ? 'card-attention' : ''}`}>
            <div className="student-card-header">
              <div className="student-label-wrap">
                <svg className="id-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <circle cx="9" cy="10" r="2" />
                  <line x1="15" y1="8" x2="17" y2="8" />
                  <line x1="15" y1="12" x2="17" y2="12" />
                  <line x1="7" y1="16" x2="17" y2="16" />
                </svg>
                <label htmlFor="student-id" className="student-label">
                  শিক্ষার্থীর জন্ম নিবন্ধন নম্বর (১৭ অঙ্ক)
                </label>
              </div>

              <div className="student-actions">
                {studentIdInput.length === 0 && (
                  <button
                    type="button"
                    className="sample-btn"
                    onClick={() => onStudentIdChange(SAMPLE_STUDENT_ID)}
                    title="পরীক্ষা করার জন্য নমুনা ১৭ অঙ্কের নম্বর বসান"
                  >
                    নমুনা নম্বর বসান
                  </button>
                )}
                {studentIdInput.length > 0 && (
                  <button type="button" onClick={clearStudentId} className="clear-btn" title="মুছে ফেলুন">
                    মুছুন
                  </button>
                )}
              </div>
            </div>

            <div className="input-wrap">
              <input
                ref={studentInputRef}
                id="student-id"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="যেমন 20152691234567890"
                value={studentIdInput}
                onChange={(e) => onStudentIdChange(e.target.value)}
                aria-describedby="student-id-hint"
                className={`student-input ${studentId ? 'input-valid' : needsId ? 'input-need' : ''}`}
              />
              <span className={`digit-counter ${studentId ? 'counter-ok' : ''}`}>
                {bn(studentIdInput.length)}/১৭
              </span>
            </div>

            {/* Visual digit completion progress bar */}
            <div className="id-progress-bar">
              <div
                className={`id-progress-fill ${studentId ? 'id-progress-full' : needsId ? 'id-progress-error' : ''}`}
                style={{ width: `${Math.min(100, (studentIdInput.length / 17) * 100)}%` }}
              />
            </div>

            <div
              id="student-id-hint"
              key={needsId ? idRequested : 0}
              className={`hint ${studentId ? 'hint-ok' : needsId ? 'hint-error' : ''}`}
              role={needsId ? 'alert' : undefined}
            >
              {studentId ? (
                <>
                  <span className="hint-icon">✓</span> নম্বর ঠিক আছে। এই শিক্ষার্থীর নামে আবেদন হবে।
                </>
              ) : needsId ? (
                studentIdInput.length === 0 ? (
                  'আগে এখানে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন, তারপর আবার বাটনটি চাপুন।'
                ) : (
                  `নম্বরটি অসম্পূর্ণ। আরও ${bn(17 - studentIdInput.length)}টি অঙ্ক লিখুন, তারপর আবার বাটনটি চাপুন।`
                )
              ) : studentIdInput.length === 0 ? (
                'আবেদন করতে ও নিজের আবেদন দেখতে নম্বরটি লিখুন।'
              ) : (
                `আরও ${bn(17 - studentIdInput.length)}টি অঙ্ক লিখুন (মোট ১৭ অঙ্ক)।`
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="page">
        {/* Navigation Tabs */}
        <nav className="tabs" aria-label="প্রধান মেনু">
          <a href="#/classes" className={tab === '/classes' ? 'active' : ''}>
            <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            ক্লাস তালিকা
          </a>
          <a href="#/my" className={tab === '/my' ? 'active' : ''}>
            <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            আমার আবেদন
            {activeCount > 0 && (
              <span className="count pulse-count" title="চলমান আবেদন">
                {bn(activeCount)}
              </span>
            )}
          </a>
          <a href="#/admin" className={tab === '/admin' ? 'active' : ''}>
            <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            ক্লাস তৈরি (school admin)
          </a>
        </nav>

        {/* Page Content */}
        <main className="content-container">{page}</main>

        {/* Professional Footer */}
        <footer className="page-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <span className="footer-title">স্কুল ভর্তি পোর্টাল</span>
              <span className="footer-badge">First-Come-First-Served (FCFS) ইঞ্জিন</span>
            </div>
            <p className="footer-text">
              © {bn(2026)} সকল অধিকার সংরক্ষিত • হাই-কনকারেন্সি রো-লেভেল সিকিউরিটি ও ডাটাবেজ ক্লক-সিঙ্কড আসন ব্যবস্থাপনা।
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
