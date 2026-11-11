import { API_BASE_URL } from './config'

export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'

export interface ClassInfo {
  id: string
  name: string
  totalSeats: number
  heldSeats: number
  confirmedSeats: number
  availableSeats: number
}

export interface Hold {
  holdId: string
  classId: string
  className?: string
  studentId?: string
  status: HoldStatus
  expiresAt: string
  serverTime?: string
}

/** A failed API call. `status` 0 means the server could not be reached at all. */
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const REQUEST_TIMEOUT_MS = 10_000

/** Whether the last API call reached a working server. Drives the status pill in the header. */
export type ConnectionState = 'connecting' | 'online' | 'offline'

let connectionState: ConnectionState = 'connecting'
const connectionListeners = new Set<() => void>()

function setConnectionState(next: ConnectionState) {
  if (next === connectionState) return
  connectionState = next
  connectionListeners.forEach((listener) => listener())
}

export function getConnectionState(): ConnectionState {
  return connectionState
}

export function subscribeConnectionState(listener: () => void): () => void {
  connectionListeners.add(listener)
  return () => {
    connectionListeners.delete(listener)
  }
}

// Difference between the server clock and this browser's clock. Deadlines are decided by
// the server, so countdowns must not depend on the user's clock being right.
let serverOffsetMs = 0

export function serverNow(): number {
  return Date.now() + serverOffsetMs
}

function syncClock(value: unknown) {
  const items = Array.isArray(value) ? value : [value]
  for (const item of items) {
    const serverTime = (item as { serverTime?: unknown } | null)?.serverTime
    if (typeof serverTime === 'string') {
      const parsed = Date.parse(serverTime)
      if (!Number.isNaN(parsed)) serverOffsetMs = parsed - Date.now()
      return
    }
  }
}

async function request<T>(
  method: string,
  path: string,
  options: { studentId?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.studentId) headers['X-Student-Id'] = options.studentId
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch {
    setConnectionState('offline')
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached.')
  } finally {
    clearTimeout(timer)
  }

  setConnectionState(response.status >= 500 ? 'offline' : 'online')

  const text = await response.text().catch(() => '')
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const error = payload as { code?: unknown; message?: unknown } | null
    throw new ApiError(
      response.status,
      typeof error?.code === 'string' ? error.code : 'UNKNOWN',
      typeof error?.message === 'string' ? error.message : `Request failed with status ${response.status}`,
    )
  }

  syncClock(payload)
  return payload as T
}

export const api = {
  createClass: (name: string, totalSeats: number) =>
    request<ClassInfo>('POST', '/classes', { body: { name, totalSeats } }),
  listClasses: () => request<ClassInfo[]>('GET', '/classes'),
  apply: (classId: string, studentId: string) =>
    request<Hold>('POST', `/classes/${encodeURIComponent(classId)}/holds`, { studentId }),
  getHold: (holdId: string) => request<Hold>('GET', `/holds/${encodeURIComponent(holdId)}`),
  confirm: (holdId: string, studentId: string) =>
    request<{ holdId: string; status: HoldStatus }>('POST', `/holds/${encodeURIComponent(holdId)}/confirm`, {
      studentId,
    }),
  cancel: (holdId: string, studentId: string) =>
    request<null>('DELETE', `/holds/${encodeURIComponent(holdId)}`, { studentId }),
  myHolds: (studentId: string) => request<Hold[]>('GET', '/me/holds', { studentId }),
}
