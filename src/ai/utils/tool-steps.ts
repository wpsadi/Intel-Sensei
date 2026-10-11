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
    default:
      return { label: name }
  }
}
