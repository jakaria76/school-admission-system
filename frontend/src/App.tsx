import { useState } from 'react'
import { api } from './api'
import { bn, effectiveStatus, isValidStudentId, normalizeStudentId } from './format'
import { useHashRoute, useNow, usePolling } from './hooks'
import { ClassList } from './pages/ClassList'
import { CreateClass } from './pages/CreateClass'
import { HoldDetail } from './pages/HoldDetail'
import { MyHolds } from './pages/MyHolds'

const STUDENT_ID_KEY = 'admission.studentId'
const MY_HOLDS_REFRESH_MS = 3000

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

  const holdMatch = /^\/holds\/([^/]+)$/.exec(route)
  const tab = holdMatch ? '/my' : route

  let page
  if (holdMatch) {
    const holdId = decodeURIComponent(holdMatch[1])
    page = <HoldDetail key={holdId} holdId={holdId} studentId={studentId} onChanged={myHolds.refresh} />
  } else if (route === '/admin') {
    page = <CreateClass />
  } else if (route === '/my') {
    page = <MyHolds studentId={studentId} holds={myHolds.data} loading={myHolds.loading} error={myHolds.error} />
  } else {
    page = <ClassList studentId={studentId} myHolds={myHolds.data} onChanged={myHolds.refresh} />
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>স্কুল ভর্তি</h1>
        <div className="student-box">
          <label htmlFor="student-id">শিক্ষার্থীর জন্ম নিবন্ধন নম্বর (১৭ অঙ্ক)</label>
          <input
            id="student-id"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="যেমন 20152691234567890"
            value={studentIdInput}
            onChange={(e) => onStudentIdChange(e.target.value)}
            aria-describedby="student-id-hint"
          />
          <div id="student-id-hint" className={`hint ${studentId ? 'hint-ok' : ''}`}>
            {studentId
              ? '✓ নম্বর ঠিক আছে। এই শিক্ষার্থীর নামে আবেদন হবে।'
              : studentIdInput.length === 0
                ? 'আবেদন করতে ও নিজের আবেদন দেখতে নম্বরটি লিখুন।'
                : `আরও ${bn(17 - studentIdInput.length)}টি অঙ্ক লিখুন (মোট ১৭ অঙ্ক)।`}
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="প্রধান মেনু">
        <a href="#/classes" className={tab === '/classes' ? 'active' : ''}>
          ক্লাস তালিকা
        </a>
        <a href="#/my" className={tab === '/my' ? 'active' : ''}>
          আমার আবেদন
          {activeCount > 0 && <span className="count" title="চলমান আবেদন">{bn(activeCount)}</span>}
        </a>
        <a href="#/admin" className={tab === '/admin' ? 'active' : ''}>
          ক্লাস তৈরি (school admin)
        </a>
      </nav>

      <main>{page}</main>
    </div>
  )
}
