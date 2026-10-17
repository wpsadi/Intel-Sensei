// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn().mockResolvedValue('AUTHORIZED'), secrets: new Map<string, string>() }))
vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({ auth: mocks.auth }))
vi.mock('@/features/vault/secrets', () => ({
  secretGet: (key: string) => mocks.secrets.get(key) ?? '',
  secretSet: (key: string, value: string) => {
    mocks.secrets.set(key, value)
  },
}))

import { FIRECRAWL_MCP_AUTH_STORAGE, SECRET_STORAGE_KEYS } from '@/constants/ai'

import {
  FIRECRAWL_CALLBACK_PATH,
  FIRECRAWL_OAUTH_URL,
  clearFirecrawlOAuth,
  createFirecrawlOAuthProvider,
  finishFirecrawlOAuth,
  hasFirecrawlOAuth,
  startFirecrawlOAuth,
} from './firecrawl-auth'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.secrets.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/s-draw?fileId=file-a&chatId=chat-a')
})

async function begin() {
  await startFirecrawlOAuth()
  const provider = createFirecrawlOAuthProvider(true)
  provider.saveCodeVerifier('test-pkce-verifier')
  return { provider, state: await provider.state!() }
}

describe('Firecrawl OAuth', () => {
  it('uses the OAuth endpoint, a public PKCE client and a per-attempt state', async () => {
    const { provider, state } = await begin()
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), { serverUrl: FIRECRAWL_OAUTH_URL })
    expect(state).toBeTruthy()
    expect(provider.clientMetadata.token_endpoint_auth_method).toBe('none')
    expect(String(provider.redirectUrl)).toBe(new URL(FIRECRAWL_CALLBACK_PATH, window.location.origin).href)
    expect(await provider.codeVerifier()).toBe('test-pkce-verifier')
  })

  it('rejects an unverified callback without exchanging its code', async () => {
    await begin()
    mocks.auth.mockClear()
    await expect(
      finishFirecrawlOAuth(new URL(`${window.location.origin}${FIRECRAWL_CALLBACK_PATH}?state=wrong&code=code`)),
    ).rejects.toThrow('could not be verified')
    expect(mocks.auth).not.toHaveBeenCalled()
  })

  it('exchanges a verified code once, preserves file/chat references and clears PKCE state', async () => {
    const { state } = await begin()
    const callback = new URL(`${window.location.origin}${FIRECRAWL_CALLBACK_PATH}?state=${state}&code=code`)
    expect(await finishFirecrawlOAuth(callback)).toBe('/s-draw?fileId=file-a&chatId=chat-a')
    expect(mocks.auth).toHaveBeenLastCalledWith(expect.anything(), { serverUrl: FIRECRAWL_OAUTH_URL, authorizationCode: 'code' })
    expect(() => createFirecrawlOAuthProvider().codeVerifier()).toThrow('expired')
    await expect(finishFirecrawlOAuth(callback)).rejects.toThrow('could not be verified')
  })

  it('does not follow an external return URL', async () => {
    const { state } = await begin()
    const saved = JSON.parse(sessionStorage.getItem('sensei.firecrawl_oauth_pending')!)
    sessionStorage.setItem('sensei.firecrawl_oauth_pending', JSON.stringify({ ...saved, returnTo: '//untrusted.example/path' }))
    const callback = new URL(`${window.location.origin}${FIRECRAWL_CALLBACK_PATH}?state=${state}&code=code`)
    expect(await finishFirecrawlOAuth(callback)).toBe('/?settings=open&section=ai')
  })

  it('keeps tokens and registration in vault-managed secret storage and disconnects locally', async () => {
    const provider = createFirecrawlOAuthProvider()
    await provider.saveTokens({ access_token: 'test-token', token_type: 'Bearer', refresh_token: 'test-refresh' })
    await provider.saveClientInformation!({ client_id: 'client', issuer: 'https://auth.firecrawl.dev' })
    expect(hasFirecrawlOAuth()).toBe(true)
    expect(SECRET_STORAGE_KEYS).toContain(FIRECRAWL_MCP_AUTH_STORAGE)
    expect(JSON.parse(mocks.secrets.get(FIRECRAWL_MCP_AUTH_STORAGE)!)).toMatchObject({
      tokens: { refresh_token: 'test-refresh' },
      client: { client_id: 'client' },
    })
    clearFirecrawlOAuth()
    expect(hasFirecrawlOAuth()).toBe(false)
  })

  it('does not redirect a background agent request to sign-in', () => {
    expect(() => createFirecrawlOAuthProvider().redirectToAuthorization(new URL('https://auth.firecrawl.dev/authorize'))).toThrow(
      'Reconnect Firecrawl',
    )
  })

  it('reports a declined authorization and clears pending state', async () => {
    const { state } = await begin()
    mocks.auth.mockClear()
    await expect(
      finishFirecrawlOAuth(new URL(`${window.location.origin}${FIRECRAWL_CALLBACK_PATH}?state=${state}&error=access_denied`)),
    ).rejects.toThrow('declined')
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(() => createFirecrawlOAuthProvider().codeVerifier()).toThrow('expired')
  })
})
