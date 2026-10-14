import { NodeViewContent, type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { BetweenHorizontalStartIcon, CheckIcon, CodeXmlIcon, CopyIcon, PanelTopIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCopy } from '@/hooks/use-copy'
import { cn } from '@/lib/utils'

import { Resizable } from '../helpers'
import { LANGUAGES, lowlight } from '../lowlight'

function MermaidPreview({ code, bare, onClick }: { code: string; bare: boolean; onClick?: () => void }) {
  const id = useId().replace(/:/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
      })
      try {
        const { svg: rendered } = await mermaid.render(`mmd-${id}`, code || 'graph TD; A-->B')
        if (alive) {
          setSvg(rendered)
          setError('')
        }
      } catch (err) {
        if (alive) setError((err as Error).message)
      }
    }, 300)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [code, id])

  return (
    <ScrollArea className={bare ? undefined : 'border-t'} contentEditable={false}>
      <div className={cn('flex justify-center p-3', onClick && 'cursor-pointer')} onClick={onClick}>
        {error ? <pre className="text-xs text-red-500">{error}</pre> : <div dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    </ScrollArea>
  )
}

/** Language picker: a shadcn Combobox whose popup has a search box above the language list. */
function LanguageSelect({ value, detected, onChange }: { value: string; detected?: string; onChange: (language: string) => void }) {
  const searchRef = useRef<HTMLInputElement>(null)
  return (
    <Combobox items={LANGUAGES} value={value} onValueChange={(lang) => lang && onChange(lang)}>
      <ComboboxTrigger
        render={
          <button type="button" className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted" />
        }
      >
        {value === 'auto' && detected ? `auto · ${detected}` : value}
      </ComboboxTrigger>
      <ComboboxContent className="w-52 min-w-52" initialFocus={searchRef}>
        <ComboboxInput ref={searchRef} showTrigger={false} placeholder="Search language…" />
        <ComboboxEmpty>No language matches.</ComboboxEmpty>
        <ComboboxList>
          {(lang: string) => (
            <ComboboxItem key={lang} value={lang}>
              {lang}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** How a Mermaid block shows: the diagram only (the default, like an equation), code and diagram, or code only. */
type MermaidView = 'output' | 'both' | 'code'
const MERMAID_VIEWS: { view: MermaidView; label: string; icon: typeof CodeXmlIcon }[] = [
  { view: 'code', label: 'Code only', icon: CodeXmlIcon },
  { view: 'both', label: 'Code and diagram', icon: BetweenHorizontalStartIcon },
  { view: 'output', label: 'Diagram only', icon: PanelTopIcon },
]

/** One button showing the current view; its menu picks another. */
function ViewSelect({ value, onChange }: { value: MermaidView; onChange: (view: MermaidView) => void }) {
  const current = MERMAID_VIEWS.find((v) => v.view === value)!
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`View: ${current.label}`}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                />
              }
            />
          }
        >
          <current.icon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{current.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as MermaidView)}>
          {MERMAID_VIEWS.map(({ view, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={view} value={view} className="normal-case tracking-normal">
              <Icon className="size-3.5" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  // No language means lowlight guesses it from the code.
  const language = (node.attrs.language as string | null) ?? 'auto'
  const code = node.textContent
  // highlight.js relevance scoring, the same guess lowlight colors an "auto" block with.
  const detected = useMemo(
    () => (language === 'auto' && code.trim() ? lowlight.highlightAuto(code).data?.language : undefined),
    [language, code],
  )
  const { copied, copy } = useCopy()
  const mermaid = language === 'mermaid'
  const view: MermaidView = mermaid ? ((node.attrs.view as MermaidView | null) ?? 'output') : 'code'
  const diagramOnly = view === 'output'
  return (
    <NodeViewWrapper className={cn('snote-code group/code relative my-2 rounded-md', diagramOnly ? 'hover:bg-muted' : 'bg-muted')}>
      <div
        contentEditable={false}
        className={cn(
          'flex items-center justify-between gap-1 px-3 pt-2 text-xs text-muted-foreground',
          diagramOnly && 'absolute inset-x-0 top-0 z-10 opacity-0 group-hover/code:opacity-100',
        )}
      >
        <span className={cn(diagramOnly && 'invisible')}>
          <LanguageSelect
            value={language}
            detected={detected}
            onChange={(lang) => updateAttributes({ language: lang === 'auto' ? null : lang })}
          />
        </span>
        <div className="flex items-center gap-0.5">
          {mermaid && <ViewSelect value={view} onChange={(v) => updateAttributes({ view: v })} />}
          <button
            type="button"
            onClick={() => void copy(node.textContent)}
            className={cn(
              'flex h-6 items-center gap-1 rounded px-1.5 hover:bg-background',
              copied ? 'opacity-100' : 'opacity-0 group-hover/code:opacity-100',
            )}
          >
            {copied ? (
              <>
                <CheckIcon className="size-3" /> Copied
              </>
            ) : (
              <>
                <CopyIcon className="size-3" /> Copy
              </>
            )}
          </button>
        </div>
      </div>
      {/* The code stays in the document when hidden, so the diagram keeps its source. */}
      <pre className={cn('min-h-24 overflow-x-auto px-4 pt-2 pb-3 font-mono text-[13px]', diagramOnly && 'hidden')}>
        <NodeViewContent<'code'> as="code" />
      </pre>
      {mermaid && view === 'both' && <MermaidPreview code={code} bare={false} />}
      {/* Only the diagram-only view resizes, like an image. */}
      {mermaid && diagramOnly && (
        <Resizable width={(node.attrs.width as number | null) ?? 100} onResize={(width) => updateAttributes({ width })}>
          <MermaidPreview code={code} bare onClick={() => updateAttributes({ view: 'both' })} />
        </Resizable>
      )}
    </NodeViewWrapper>
  )
}
