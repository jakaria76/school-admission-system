import { useEffect, useRef, useState } from 'react'
import { serverNow } from './api'

interface PollState<T> {
  key: string
  data: T | null
  error: unknown
  loaded: boolean
}

/**
 * Calls `fetcher` immediately and then every `intervalMs`, without overlapping calls.
 * When a refresh fails the last good data is kept and the error is reported next to it,
 * so a server hiccup never blanks the screen. Changing `key` starts from scratch;
 * a `null` key pauses polling.
 */
export function usePolling<T>(key: string | null, fetcher: () => Promise<T>, intervalMs: number) {
  const [state, setState] = useState<PollState<T>>({ key: '', data: null, error: null, loaded: false })
  const [refreshCount, setRefreshCount] = useState(0)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      try {
        const data = await fetcherRef.current()
        if (!cancelled) setState({ key, data, error: null, loaded: true })
      } catch (error) {
        if (!cancelled) {
          setState((previous) => ({
            key,
            data: previous.key === key ? previous.data : null,
            error,
            loaded: true,
          }))
        }
      }
      if (!cancelled) timer = setTimeout(run, intervalMs)
    }

    run()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, intervalMs, refreshCount])

  const current = key !== null && state.key === key ? state : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key !== null && !current?.loaded,
    refresh: () => setRefreshCount((n) => n + 1),
  }
}

/** Server-aligned "now", re-rendered every `intervalMs` so countdowns tick. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => serverNow())
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function readHash(): string {
  return window.location.hash.replace(/^#/, '') || '/classes'
}

/** Minimal hash router: the current screen survives a page refresh and has its own URL. */
export function useHashRoute(): string {
  const [route, setRoute] = useState(readHash)
  useEffect(() => {
    const onChange = () => setRoute(readHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path: string) {
  window.location.hash = path
}
