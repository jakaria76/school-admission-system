import type { ReactNode } from 'react'
import type { HoldStatus } from '../api'
import { STATUS_LABEL } from '../format'

type AlertKind = 'error' | 'warning' | 'success' | 'info'

/** Errors are announced to screen readers immediately; the rest politely. */
export function Alert({ kind, children }: { kind: AlertKind; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

/** Shows the API status code together with its Bengali meaning, e.g. "EXPIRED · মেয়াদ শেষ". */
export function StatusBadge({ status }: { status: HoldStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`} data-testid="hold-status">
      {status} · {STATUS_LABEL[status]}
    </span>
  )
}

export function Spinner({ label = 'লোড হচ্ছে…' }: { label?: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  )
}
