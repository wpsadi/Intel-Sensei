import { type OAuthClientProvider, type OAuthDiscoveryState, auth } from '@modelcontextprotocol/sdk/client/auth.js'
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'

import { FIRECRAWL_MCP_AUTH_STORAGE } from '@/constants/ai'
import { secretGet, secretSet } from '@/features/vault/secrets'

export const FIRECRAWL_OAUTH_URL = 'https://mcp.firecrawl.dev/v2/mcp-oauth'
export const FIRECRAWL_KEY_URL = 'https://mcp.firecrawl.dev/v2/mcp'
export const FIRECRAWL_AUTH_EVENT = 'sensei:firecrawl-auth'
const PENDING_KEY = 'sensei.firecrawl_oauth_pending'
export const FIRECRAWL_CALLBACK_PATH = '/mcp/firecrawl/callback'

interface SavedAuth {
  client?: OAuthClientInformationMixed
  tokens?: OAuthTokens
  discovery?: OAuthDiscoveryState
}
interface PendingAuth {
  state: string
  verifier?: string
  returnTo: string
}
function saved(): SavedAuth {
  try {
    const value: unknown = JSON.parse(secretGet(FIRECRAWL_MCP_AUTH_STORAGE) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as SavedAuth) : {}
  } catch {
    return {}
  }
}
function save(patch: Partial<SavedAuth>) {
  secretSet(FIRECRAWL_MCP_AUTH_STORAGE, JSON.stringify({ ...saved(), ...patch }))
  window.dispatchEvent(new Event(FIRECRAWL_AUTH_EVENT))
}
function pending(): PendingAuth | null {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null') as PendingAuth | null
  } catch {
    return null
  }
}
export const firecrawlOAuthSession = () => saved().tokens?.access_token ?? ''
export const hasFirecrawlOAuth = () => !!firecrawlOAuthSession()

export function createFirecrawlOAuthProvider(interactive = false): OAuthClientProvider {
  return {
    redirectUrl: new URL(FIRECRAWL_CALLBACK_PATH, window.location.origin),
    clientMetadata: {
      client_name: 'Sensei Firecrawl',
      redirect_uris: [new URL(FIRECRAWL_CALLBACK_PATH, window.location.origin).href],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    state: () => {
      const current = pending()
      if (!interactive || !current) throw new Error('Connect Firecrawl in Settings → AI providers.')
      return current.state
    },
    clientInformation: () => saved().client,
    saveClientInformation: (client) => save({ client }),
    tokens: () => saved().tokens,
    saveTokens: (tokens) => save({ tokens }),
    discoveryState: () => saved().discovery,
    saveDiscoveryState: (discovery) => save({ discovery }),
    redirectToAuthorization: (url) => {
      if (!interactive) throw new Error('Reconnect Firecrawl in Settings → AI providers.')
      window.location.assign(url.href)
    },
    saveCodeVerifier: (verifier) => {
      const current = pending()
      if (!interactive || !current) throw new Error('Start Firecrawl sign-in from Settings → AI providers.')
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...current, verifier }))
    },
    codeVerifier: () => {
      const verifier = pending()?.verifier
      if (!verifier) throw new Error('Firecrawl sign-in expired. Connect again in Settings → AI providers.')
      return verifier
    },
    invalidateCredentials: (scope) => {
      if (scope === 'all') save({ client: undefined, tokens: undefined, discovery: undefined })
      else if (scope === 'tokens') save({ tokens: undefined })
      else if (scope === 'client') save({ client: undefined })
      else if (scope === 'discovery') save({ discovery: undefined })
      else {
        const current = pending()
        if (current) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...current, verifier: undefined }))
      }
    },
  }
}

export async function startFirecrawlOAuth() {
  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ state: crypto.randomUUID(), returnTo: window.location.pathname + window.location.search + window.location.hash }),
  )
  return auth(createFirecrawlOAuthProvider(true), { serverUrl: FIRECRAWL_OAUTH_URL })
}

export async function finishFirecrawlOAuth(url: URL): Promise<string> {
  const current = pending()
  if (
    url.origin !== window.location.origin ||
    url.pathname !== FIRECRAWL_CALLBACK_PATH ||
    !current ||
    url.searchParams.get('state') !== current.state
  )
    throw new Error('Firecrawl sign-in could not be verified. Connect again from Settings → AI providers.')
  try {
    if (url.searchParams.has('error'))
      throw new Error('Firecrawl authorization was declined. You can reconnect in Settings → AI providers.')
    const code = url.searchParams.get('code')
    if (!code) throw new Error('Firecrawl did not return an authorization code.')
    const result = await auth(createFirecrawlOAuthProvider(true), { serverUrl: FIRECRAWL_OAUTH_URL, authorizationCode: code })
    if (result !== 'AUTHORIZED') throw new Error('Firecrawl authorization did not complete.')
    const returnTo = new URL(current.returnTo, window.location.origin)
    return returnTo.origin === window.location.origin ? returnTo.pathname + returnTo.search + returnTo.hash : '/?settings=open&section=ai'
  } finally {
    sessionStorage.removeItem(PENDING_KEY)
  }
}

export function clearFirecrawlOAuth() {
  secretSet(FIRECRAWL_MCP_AUTH_STORAGE, '')
  sessionStorage.removeItem(PENDING_KEY)
  window.dispatchEvent(new Event(FIRECRAWL_AUTH_EVENT))
}
