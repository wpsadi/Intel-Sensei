const CACHE_NAME = 'sensei-runtime-assets-v1'
const PYODIDE_ORIGIN = 'https://cdn.jsdelivr.net'
const PYODIDE_PATH = '/pyodide/v0.29.5/full/'
const PYPI_ORIGINS = new Set(['https://pypi.org', 'https://files.pythonhosted.org'])
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHED_AT_HEADER = 'x-sensei-cached-at'
const networkFetch = globalThis.fetch.bind(globalThis)

function isRuntimeAsset(url: URL) {
  if (url.origin === PYODIDE_ORIGIN) return url.pathname.startsWith(PYODIDE_PATH)
  // micropip gets package metadata from PyPI and wheels from pythonhosted.org.
  if (PYPI_ORIGINS.has(url.origin)) return true
  // Vite emits PGlite's worker, JavaScript chunks, wasm and data beside /assets/.
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
}

/** Cache immutable runtime downloads only; leave requests and responses outside these paths untouched. */
export async function fetchRuntimeAsset(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (request.method !== 'GET' || !isRuntimeAsset(url) || typeof caches === 'undefined') return networkFetch(request)

  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) {
    const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER))
    if (Number.isFinite(cachedAt) && Date.now() - cachedAt < CACHE_TTL_MS) return cached
    await cache.delete(request)
  }

  const response = await networkFetch(request)
  if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
    const headers = new Headers(response.headers)
    headers.set(CACHED_AT_HEADER, String(Date.now()))
    await cache.put(request, new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers }))
  }
  return response
}

/** Install in dedicated workers before their runtime begins requesting wasm/data files. */
export function installRuntimeAssetCache() {
  globalThis.fetch = fetchRuntimeAsset
}
