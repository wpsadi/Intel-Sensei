import { useState, useSyncExternalStore } from 'react'

import { closeFirecrawlMcp, firecrawlConnectionMode, listFirecrawlMcpTools } from '@/ai/mcp/firecrawl'
import { FIRECRAWL_AUTH_EVENT, clearFirecrawlOAuth, hasFirecrawlOAuth, startFirecrawlOAuth } from '@/ai/mcp/firecrawl-auth'
import { Button } from '@/components/ui/button'

function subscribe(update: () => void) {
  window.addEventListener(FIRECRAWL_AUTH_EVENT, update)
  window.addEventListener('storage', update)
  return () => {
    window.removeEventListener(FIRECRAWL_AUTH_EVENT, update)
    window.removeEventListener('storage', update)
  }
}

export function FirecrawlMcpSettings() {
  const mode = useSyncExternalStore(subscribe, firecrawlConnectionMode)
  const oauth = useSyncExternalStore(subscribe, hasFirecrawlOAuth)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Firecrawl connection failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Firecrawl MCP is available in every Sensei chat. Use your saved API key, or sign in with Firecrawl through OAuth.
      </p>
      <p className="text-xs" role="status">
        {mode === 'key'
          ? 'MCP configured with your saved API key.'
          : mode === 'oauth'
            ? 'Firecrawl OAuth account connected.'
            : 'MCP is not connected. Basic keyless search and page reading remain available.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {mode === 'none' && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await startFirecrawlOAuth()
                if (result === 'AUTHORIZED') setMessage('Firecrawl connected.')
              })
            }
          >
            Connect Firecrawl
          </Button>
        )}
        {mode !== 'none' && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const tools = await listFirecrawlMcpTools()
                setMessage(`Connected. ${tools.length} MCP tools available.`)
              })
            }
          >
            Test MCP connection
          </Button>
        )}
        {oauth && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                clearFirecrawlOAuth()
                await closeFirecrawlMcp()
                setMessage('Firecrawl OAuth disconnected.')
              })
            }
          >
            Disconnect OAuth
          </Button>
        )}
      </div>
      {message && (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
