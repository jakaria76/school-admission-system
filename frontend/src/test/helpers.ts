import { vi } from 'vitest'

type Handler = (request: { method: string; path: string; headers: Record<string, string> }) => {
  status?: number
  body?: unknown
} | 'network-error'

/** Replaces fetch with a tiny fake backend. Returns the list of calls that were made. */
export function mockBackend(handler: Handler) {
  const calls: { method: string; path: string; headers: Record<string, string> }[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const call = {
        method: init?.method ?? 'GET',
        path: url.pathname,
        headers: (init?.headers ?? {}) as Record<string, string>,
      }
      calls.push(call)

      const result = handler(call)
      if (result === 'network-error') throw new TypeError('Failed to fetch')

      const status = result.status ?? 200
      const text = result.body === undefined ? '' : JSON.stringify(result.body)
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => text,
      } as Response
    }),
  )

  return calls
}

export const STUDENT = '20152691234567890'

export function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}
