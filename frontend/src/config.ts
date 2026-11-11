declare global {
  interface Window {
    __APP_CONFIG__?: { API_BASE_URL?: string }
  }
}

const DEFAULT_API_BASE_URL = 'http://localhost:8080'

/**
 * Backend URL, in order of precedence:
 *  1. runtime config written by the Docker container from the API_BASE_URL env var (public/config.js)
 *  2. build-time VITE_API_BASE_URL
 *  3. http://localhost:8080
 */
export const API_BASE_URL = (
  window.__APP_CONFIG__?.API_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, '')
