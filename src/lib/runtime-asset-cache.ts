const CACHE_NAME = 'sensei-runtime-assets-v1'
const PYODIDE_ORIGIN = 'https://cdn.jsdelivr.net'
const PYODIDE_PATH = '/pyodide/v0.29.5/full/'
const networkFetch = globalThis.fetch.bind(globalThis)

function isRuntimeAsset(url: URL) {
  if (url.origin === PYODIDE_ORIGIN) return url.pathname.startsWith(PYODIDE_PATH)
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
  if (cached) return cached

  const response = await networkFetch(request)
  if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
    void cache.put(request, response.clone()).catch(() => undefined)
  }
  return response
}

/** Install in dedicated workers before their runtime begins requesting wasm/data files. */
export function installRuntimeAssetCache() {
  globalThis.fetch = fetchRuntimeAsset
}
