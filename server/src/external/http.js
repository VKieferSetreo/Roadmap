// Gemeinsamer HTTP-Helfer für externe Provider: hartes Timeout, Fehler → null.
// Ein Provider-Ausfall darf eine Analyse NIE fehlschlagen lassen.

export async function fetchJson(url, { timeoutMs, fetchImpl, headers } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
