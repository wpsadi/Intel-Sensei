/** Where a page lives: at workspace root, under another page, or as a row of a database. */
export type ParentType = 'workspace' | 'page' | 'database'

export type PageFont = 'default' | 'serif' | 'mono'

export interface Page {
  id: string
  parentId: string | null
  parentType: ParentType
  /** 'database' pages render a full-page database instead of an editor. */
  kind: 'page' | 'database'
  databaseId?: string
  title: string
  icon: string
  cover: string
  /** Vertical focal point of an image cover, 0-100 (%). Defaults to 50. */
  coverY?: number
  /** Serialized Tiptap JSON document. Kept as text so the store stays schema-agnostic. */
  content: string
  /** Property values when the page is a database row, keyed by property id. */
  properties: Record<string, PropertyValue>
  favorite: boolean
  trashed: boolean
  /** Page menu display settings. */
  font: PageFont
  smallText: boolean
  fullWidth: boolean
  locked: boolean
  order: number
  createdAt: number
  updatedAt: number
}

export type PropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'person'
  | 'place'
  | 'created_time'

export type PropertyValue = string | number | boolean | string[] | DateValue | null

export interface DateValue {
  start: string
  end?: string
}

export interface SelectOption {
  id: string
  name: string
  color: string
}

export interface PropertyDef {
  id: string
  name: string
  type: PropertyType
  options?: SelectOption[]
}

export interface Database {
  id: string
  /** Page that owns the database (full page db page, or page containing the inline block). */
  pageId: string
  title: string
  properties: PropertyDef[]
  createdAt: number
  updatedAt: number
}

export type ViewType =
  | 'table'
  | 'board'
  | 'gallery'
  | 'list'
  | 'feed'
  | 'dashboard'
  | 'calendar'
  | 'timeline'
  | 'map'
  | 'bar_vertical'
  | 'bar_horizontal'
  | 'line'
  | 'donut'
  | 'number'
  | 'form'

export type Aggregate = 'count' | 'sum' | 'avg'

export interface ViewSort {
  propertyId: string
  direction: 'asc' | 'desc'
}

export interface ViewFilter {
  propertyId: string
  op: 'contains' | 'equals' | 'not_empty' | 'empty' | 'checked' | 'unchecked'
  value?: string
}

export interface View {
  id: string
  /** Database the view reads rows from. */
  databaseId: string
  /** Block or database that owns this set of views (linked views own their own set). */
  ownerId: string
  name: string
  type: ViewType
  order: number
  groupBy?: string
  dateProperty?: string
  placeProperty?: string
  valueProperty?: string
  aggregate?: Aggregate
  hiddenProperties?: string[]
  sorts?: ViewSort[]
  filters?: ViewFilter[]
}

export interface SyncedBlock {
  id: string
  content: string
  updatedAt: number
}

export interface Person {
  id: string
  name: string
  color: string
}

export interface Setting {
  key: string
  value: string
}

/* ------------------------------- ask sensei ------------------------------- */

export interface Chat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** True once the user collapses the to-do list pinned above the input. */
  todosCollapsed?: boolean
}

/** A file sent with a chat message. The bytes live in Cache Storage under `src` (a `snote-media:` ref). */
export interface ChatAttachment {
  src: string
  name: string
  type: string
  size: number
}

/** A brief plan Sensei wrote when asked how to do something. It shows as a card in the reply. */
export interface ChatPlan {
  title: string
  description?: string
  steps: { title: string; details?: string }[]
}

/** One question Sensei asked the user in a questionnaire. */
export interface ChatQuestion {
  id: string
  title: string
  description?: string
  /** single and multiple are multiple-choice; the rest are typed answers of that kind. */
  kind: 'single' | 'multiple' | 'text' | 'number' | 'date' | 'time' | 'email' | 'url'
  choices?: { label: string; description?: string }[]
  placeholder?: string
  required?: boolean
}

/** The user's answers by question id: a choice, several choices, or typed text. */
export type ChatAnswers = Record<string, string | string[]>

/** A questionnaire Sensei showed in a reply, with the answers once the user sent them. */
export interface ChatQuestions {
  questions: ChatQuestion[]
  answers?: ChatAnswers
}

/** A to-do checklist Sensei keeps while it works. The newest one is pinned above the chat input. */
export interface ChatTodoList {
  title: string
  description?: string
  items: { title: string; status: 'pending' | 'in_progress' | 'completed' }[]
}

/** One web search Sensei ran while writing a reply. */
export interface ChatSearch {
  /** The id of the live call's tool call that ran this search. */
  id?: string
  query: string
  status: 'running' | 'done' | 'failed'
  /** Why the search failed, such as a missing Firecrawl key. */
  error?: string
  /** The pages Google Search found. */
  sources?: { url: string; title?: string }[]
}

/** One tool call Sensei made during a live call (memory, plans, to-do lists), shown as a step. */
export interface ChatToolStep {
  id: string
  name: string
  label: string
  status: 'running' | 'done' | 'failed'
  /** What it is working on, such as the note being saved. */
  detail?: string
}

/**
 * One piece of a live-call reply, in the order it happened: what Sensei said, a web search, tool
 * calls, or a plan card. The whole reply stays one message, so it has one set of copy, speak and retry buttons.
 */
export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'searches'; searches: ChatSearch[] }
  | { type: 'steps'; steps: ChatToolStep[] }
  | { type: 'plan'; plan: ChatPlan }
  /** A detailed written answer the deep model made while the voice kept talking. It is shown as Markdown. */
  | { type: 'answer'; id: string; text: string }

/** The token counts Gemini reported for a reply. They are exact, unlike an estimate from the text. */
export interface ChatUsage {
  /** How full the context was after the reply: the last model call's input plus its output, which the next question carries along. */
  contextTokens: number
  /** Input tokens summed over every model call of the reply. */
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  /** Input tokens read from Gemini's cache. */
  cachedTokens?: number
}

export interface ChatMessage {
  id: string
  chatId: string
  role: 'user' | 'assistant'
  content: string
  /** Gemini's thought summary for a reply, when it sent one. */
  reasoning?: string
  attachments?: ChatAttachment[]
  /** The plan card Sensei made for this reply. */
  plan?: ChatPlan
  /** The questions Sensei asked in this reply. */
  questions?: ChatQuestions
  /** The to-do list Sensei kept while writing this reply, as last updated; null once Sensei removed it. */
  todos?: ChatTodoList | null
  /** The tokens Gemini counted for this reply, when it reported them. */
  usage?: ChatUsage
  /** A live-call reply as ordered parts. `content` holds all its text, for copy, speak and retry. */
  parts?: ChatPart[]
  /** The web searches Sensei ran for this reply, in order. */
  searches?: ChatSearch[]
  /** How long Sensei thought before its first words, in seconds. */
  reasoningSeconds?: number
  /** True when the user stopped the reply before it finished. */
  interrupted?: boolean
  createdAt: number
}
