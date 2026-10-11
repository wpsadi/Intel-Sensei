import { AlertCircle, Globe, Search } from 'lucide-react'
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import type { ChatSearch } from '@/features/note/db/types'

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The web searches behind a reply, shown as steps with the sites each one found. Open while a search runs. `className` and `defaultOpen` let a compact host (the S-Note widget) drop the margin and keep it closed. */
export function ChatSearches({ searches, className = 'mb-3', defaultOpen }: { searches: ChatSearch[]; className?: string; defaultOpen?: boolean }) {
  const running = searches.some((search) => search.status === 'running')
  return (
    <ChainOfThought defaultOpen={defaultOpen ?? running} className={className}>
      <ChainOfThoughtHeader icon={Globe}>
        {running ? 'Searching the web…' : `Searched the web ${searches.length === 1 ? 'once' : `${searches.length} times`}`}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {searches.map((search, index) => (
          <ChainOfThoughtStep
            key={index}
            icon={search.status === 'failed' ? AlertCircle : Search}
            label={search.query}
            description={search.status === 'running' ? 'Searching…' : search.status === 'failed' ? (search.error ?? 'Search failed') : undefined}
            status={search.status === 'running' ? 'active' : 'complete'}
          >
            {!!search.sources?.length && (
              <ChainOfThoughtSearchResults>
                {search.sources.map((source) => (
                  <ChainOfThoughtSearchResult
                    key={source.url}
                    render={<a href={source.url} target="_blank" rel="noreferrer" title={source.title} />}
                  >
                    <Globe className="size-3" />
                    {hostOf(source.url)}
                  </ChainOfThoughtSearchResult>
                ))}
              </ChainOfThoughtSearchResults>
            )}
          </ChainOfThoughtStep>
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
