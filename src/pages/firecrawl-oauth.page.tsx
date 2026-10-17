import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { finishFirecrawlOAuth } from '@/ai/mcp/firecrawl-auth'

export default function FirecrawlOAuthPage() {
  const started = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (started.current) return
    started.current = true
    void finishFirecrawlOAuth(new URL(window.location.href))
      .then((returnTo) => window.location.replace(returnTo))
      .catch((error: unknown) => {
        window.history.replaceState(null, '', window.location.pathname)
        setError(error instanceof Error ? error.message : 'Firecrawl sign-in failed.')
      })
  }, [])
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
      <p role={error ? 'alert' : 'status'}>{error || 'Connecting Firecrawl…'}</p>
      {error && (
        <Link className="underline" to="/?settings=open&section=ai">
          Return to AI provider settings
        </Link>
      )}
    </main>
  )
}
