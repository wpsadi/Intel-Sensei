import { ScrollArea } from '@/components/ui/scroll-area'
import { NodeViewContent, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { all, createLowlight } from 'lowlight'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { CopyIcon } from 'lucide-react'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@/components/ui/combobox'

// Every highlight.js grammar, so any language name in a fence or the picker is colored.
const lowlight = createLowlight(all)
const LANGUAGES = ['auto', 'plaintext', 'mermaid', ...lowlight.listLanguages().filter((l) => l !== 'plaintext')]

function MermaidPreview({ code }: { code: string }) {
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
    <ScrollArea className="border-t" contentEditable={false}>
      <div className="flex justify-center p-3">
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
      <ComboboxTrigger render={<button type="button" className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted" />}>
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

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  // No language means lowlight guesses it from the code.
  const language = (node.attrs.language as string | null) ?? 'auto'
  const code = node.textContent
  // highlight.js relevance scoring, the same guess lowlight colors an "auto" block with.
  const detected = useMemo(() => (language === 'auto' && code.trim() ? lowlight.highlightAuto(code).data?.language : undefined), [language, code])
  return (
    <NodeViewWrapper className="snote-code group/code relative my-2 rounded-md bg-muted">
      <div contentEditable={false} className="flex items-center justify-between px-3 pt-2 text-xs text-muted-foreground">
        <LanguageSelect value={language} detected={detected} onChange={(lang) => updateAttributes({ language: lang === 'auto' ? null : lang })} />
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(node.textContent)}
          className="flex items-center gap-1 rounded px-1 opacity-0 group-hover/code:opacity-100 hover:bg-muted"
        >
          <CopyIcon className="size-3" /> Copy
        </button>
      </div>
      <pre className="min-h-24 overflow-x-auto px-4 pt-2 pb-3 font-mono text-[13px]">
        <NodeViewContent<'code'> as="code" />
      </pre>
      {language === 'mermaid' && <MermaidPreview code={node.textContent} />}
    </NodeViewWrapper>
  )
}

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight, defaultLanguage: null, enableTabIndentation: true, tabSize: 2 })
