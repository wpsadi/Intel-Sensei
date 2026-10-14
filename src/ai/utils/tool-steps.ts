/** What a tool call is doing, in words for the chat. */
export function describeToolCall(name: string, args: Record<string, unknown>): { label: string; detail?: string } {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
  switch (name) {
    case 'memory': {
      const detail = text(args.text) ?? text(args.query) ?? text(args.name)
      switch (args.command) {
        case 'remember_fact':
          return { label: 'Saving a fact', detail }
        case 'update_fact':
          return { label: 'Updating a fact', detail }
        case 'forget_fact':
          return { label: 'Forgetting a fact' }
        case 'search_facts':
          return { label: 'Searching what I know', detail }
        case 'remember_event':
          return { label: 'Recording an event', detail }
        case 'search_events':
          return { label: 'Searching past conversations', detail }
        case 'save_procedure':
          return { label: 'Saving a procedure', detail }
        case 'forget_procedure':
          return { label: 'Forgetting a procedure' }
        case 'search_procedures':
          return { label: 'Searching procedures', detail }
        case 'note_session':
          return { label: 'Noting for this chat', detail }
        case 'forget_session_note':
          return { label: 'Removing a chat note' }
        default:
          return { label: 'Using memory' }
      }
    }
    case 'scratchpad':
      return { label: args.command === 'read' ? 'Reading the scratchpad' : 'Writing on the scratchpad', detail: text(args.key) }
    case 'deepAnswer':
      return { label: 'Preparing a detailed answer', detail: text(args.question) }
    case 'createPlan':
      return { label: 'Writing a plan', detail: text(args.title) }
    case 'createTodoList':
      return { label: 'Making a to-do list', detail: text(args.title) }
    case 'updateTodoList':
      return { label: 'Updating the to-do list' }
    case 'seeTodoList':
      return { label: 'Checking the to-do list' }
    case 'deleteTodoList':
      return { label: 'Removing the to-do list' }
    case 'terminal': {
      const command = text(args.command)?.split('\n')[0]
      return { label: 'Running a command', detail: command && command.length > 90 ? `${command.slice(0, 89)}…` : command }
    }
    case 'write_file':
      return { label: 'Writing a file', detail: text(args.path) }
    case 'scrape':
      return { label: 'Reading a page', detail: text(args.url) }
    case 'export_file':
      return { label: 'Sharing a file', detail: text(args.path) }
    case 'computer': {
      const action = text(args.action)
      const at = typeof args.x === 'number' && typeof args.y === 'number' ? ` at ${Math.round(args.x)}, ${Math.round(args.y)}` : ''
      const what: Record<string, string> = {
        open_url: 'Opening a site',
        screenshot: 'Looking at the page',
        click: 'Clicking',
        double_click: 'Double-clicking',
        right_click: 'Right-clicking',
        move: 'Moving the pointer',
        type: 'Typing',
        key: 'Pressing a key',
        scroll: 'Scrolling',
        wait: 'Waiting',
      }
      const detail =
        action === 'open_url'
          ? text(args.url)
          : action === 'type'
            ? text(args.text)
            : action === 'key'
              ? text(args.key)
              : at.trim() || undefined
      return { label: what[action ?? ''] ?? 'Using the page', detail }
    }
    case 'view_image':
      return { label: 'Viewing an image', detail: text(args.path) }
    case 'load_skill':
      return { label: 'Reading a guide', detail: text(args.name) }
    case 'sandbox_status':
      return { label: 'Checking the environment' }
    case 'find_skill':
      return { label: 'Looking for a skill', detail: text(args.query) }
    case 'use_skill':
      return { label: 'Loading a skill', detail: text(args.name) }
    case 'create_skill':
      return { label: 'Saving a skill', detail: text(args.name) }
    case 'request_tools':
      return { label: 'Turning on tools' }
    default:
      return { label: name }
  }
}

/** Tools with their own place in the reply (searches, the plan card, to-dos, questions): they are not repeated as steps. */
const OWN_UI = new Set(['webSearch', 'createPlan', 'createTodoList', 'seeTodoList', 'updateTodoList', 'deleteTodoList', 'askUser'])
export const hasOwnUi = (name: string) => OWN_UI.has(name)

/** Whether a finished call did not work: a command that exited with an error. */
export function resultFailed(name: string, output: unknown) {
  return name === 'terminal' && typeof output === 'string' && /\[exit code [1-9]/.test(output)
}
