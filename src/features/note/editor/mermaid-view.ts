/** How a Mermaid block shows: the diagram only (the default, like an equation), code and diagram, or code only. */
export type MermaidView = 'output' | 'both' | 'code'

const KEY = 'snote-mermaid-view'
const VIEWS: MermaidView[] = ['output', 'both', 'code']

/** The view picked last, which new Mermaid blocks open in. Each block then keeps its own view in the document. */
export function lastMermaidView(): MermaidView {
  try {
    const saved = localStorage.getItem(KEY) as MermaidView | null
    return saved && VIEWS.includes(saved) ? saved : 'output'
  } catch {
    return 'output'
  }
}

export function rememberMermaidView(view: MermaidView) {
  try {
    localStorage.setItem(KEY, view)
  } catch {
    /* storage unavailable: the choice still lives on the block */
  }
}
