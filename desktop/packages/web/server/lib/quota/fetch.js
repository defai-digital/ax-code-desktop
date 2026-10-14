// Every quota provider issues exactly one HTTP request, and Node's fetch never aborts
// on its own: a hung upstream would wedge the caller's single-flight guard forever and
// the quota dropdown would spin until the app is reloaded. All provider calls go
// through this helper with a bounded timeout. A caller that already carries a signal
// keeps it.
export const QUOTA_FETCH_TIMEOUT_MS = 15_000

export const fetchWithQuotaTimeout = (url, options = {}) => {
  const signal = options.signal ?? AbortSignal.timeout(QUOTA_FETCH_TIMEOUT_MS)
  return fetch(url, { ...options, signal })
}
