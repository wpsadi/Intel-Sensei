/** What the editor wants the terminal to do after some typing. */
export type EditorAction = { type: 'write'; text: string } | { type: 'submit'; line: string } | { type: 'interrupt' } | { type: 'clear' }

export const PROMPT = '\x1b[32m$\x1b[0m '

const HOME = '/home/user'

/** `user@89e42fdc:~/work$ `: the chat's short id as the machine name, and the current folder with the home folder as `~`. */
export function shellPrompt(chatId: string, cwd = HOME) {
  const path = cwd === HOME ? '~' : cwd.startsWith(`${HOME}/`) ? `~${cwd.slice(HOME.length)}` : cwd
  return `\x1b[32muser@${chatId.slice(0, 8)}\x1b[0m:\x1b[34m${path}\x1b[0m$ `
}

const HISTORY_MAX = 200

/**
 * The line a person types at the prompt. xterm only draws what it is given, so editing is done here: it takes the raw
 * keystrokes the terminal reports and says what to draw (the whole line again, which is simplest and always right).
 */
export class LineEditor {
  line = ''
  cursor = 0
  readonly history: string[]
  private position: number
  private draft = ''

  private readonly getPrompt: () => string

  constructor(history: string[] = [], getPrompt: () => string = () => PROMPT) {
    this.getPrompt = getPrompt
    this.history = history.slice(-HISTORY_MAX)
    this.position = this.history.length
  }

  /** The line redrawn from the start of the row, with the cursor where it belongs. */
  redraw(): EditorAction {
    const back = this.line.length - this.cursor
    return { type: 'write', text: `\r\x1b[2K${this.getPrompt()}${this.line}${back ? `\x1b[${back}D` : ''}` }
  }

  private set(line: string) {
    this.line = line
    this.cursor = line.length
  }

  /** Remembers a submitted line for the up arrow and starts a new one. */
  private submit(): EditorAction[] {
    const line = this.line
    if (line.trim() && this.history.at(-1) !== line) this.history.push(line)
    if (this.history.length > HISTORY_MAX) this.history.shift()
    this.position = this.history.length
    this.draft = ''
    this.line = ''
    this.cursor = 0
    return [
      { type: 'write', text: '\r\n' },
      { type: 'submit', line },
    ]
  }

  /** Takes what the terminal reported for one key press or one paste. */
  feed(data: string): EditorAction[] {
    const actions: EditorAction[] = []
    let changed = false
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]
      if (ch === '\x1b') {
        const rest = data.slice(i)
        const key = ['\x1b[A', '\x1b[B', '\x1b[C', '\x1b[D', '\x1b[3~', '\x1b[H', '\x1b[F', '\x1bOH', '\x1bOF'].find((k) =>
          rest.startsWith(k),
        )
        if (!key) continue
        i += key.length - 1
        if (key === '\x1b[A' && this.position > 0) {
          if (this.position === this.history.length) this.draft = this.line
          this.set(this.history[--this.position])
          changed = true
        } else if (key === '\x1b[B' && this.position < this.history.length) {
          this.position++
          this.set(this.position === this.history.length ? this.draft : this.history[this.position])
          changed = true
        } else if (key === '\x1b[C' && this.cursor < this.line.length) {
          this.cursor++
          changed = true
        } else if (key === '\x1b[D' && this.cursor > 0) {
          this.cursor--
          changed = true
        } else if (key === '\x1b[3~' && this.cursor < this.line.length) {
          this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1)
          changed = true
        } else if (key === '\x1b[H' || key === '\x1bOH') {
          this.cursor = 0
          changed = true
        } else if (key === '\x1b[F' || key === '\x1bOF') {
          this.cursor = this.line.length
          changed = true
        }
      } else if (ch === '\r' || ch === '\n') {
        // A pasted newline runs what came before it, like a shell.
        if (changed) actions.push(this.redraw())
        changed = false
        actions.push(...this.submit())
      } else if (ch === '\x7f' || ch === '\b') {
        if (this.cursor > 0) {
          this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor)
          this.cursor--
          changed = true
        }
      } else if (ch === '\x03') {
        if (changed) actions.push(this.redraw())
        changed = false
        const had = this.line
        this.line = ''
        this.cursor = 0
        this.position = this.history.length
        actions.push({ type: 'write', text: had ? '^C\r\n' : '' }, { type: 'interrupt' })
      } else if (ch === '\x0c') {
        actions.push({ type: 'clear' })
        changed = true
      } else if (ch === '\x01') {
        this.cursor = 0
        changed = true
      } else if (ch === '\x05') {
        this.cursor = this.line.length
        changed = true
      } else if (ch === '\x15') {
        this.line = this.line.slice(this.cursor)
        this.cursor = 0
        changed = true
      } else if (ch >= ' ' && ch !== '\x7f') {
        this.line = this.line.slice(0, this.cursor) + ch + this.line.slice(this.cursor)
        this.cursor++
        changed = true
      }
    }
    if (changed) actions.push(this.redraw())
    return actions
  }
}
