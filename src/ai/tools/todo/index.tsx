import { tool } from 'ai'
import { z } from 'zod'

import type { ChatTodoList } from '@/features/note/db/types'

/** Added to the chat agent's instructions so it shares a to-do list for work that takes several items. */
export const TODO_INSTRUCTIONS = `For a task with several items, first call createTodoList with the items. As you work, call seeTodoList to check where you are, updateTodoList to change item statuses, rename the list or add items. Call deleteTodoList if the list no longer fits. Skip the list for simple questions. When the user asks to see the list in your reply, write it as a Markdown table with the columns #, Task and Status (Pending, In progress, Done). Never copy the bracketed "[To-do list shown to the user: ...]" notes from earlier messages into your reply: they are context for you, not text for the user.`

const itemStatus = z.enum(['pending', 'in_progress', 'completed'])

/**
 * Tools that let the model create, see, update and delete the chat's to-do list. They start from `initial`, the list
 * earlier replies left, so a later reply can still update or clear it. `onTodos` receives the list after every
 * change, and null once it is deleted.
 */
export function createTodoTools(onTodos?: (todos: ChatTodoList | null) => void, initial?: ChatTodoList) {
  let todos = initial
  const show = (next: ChatTodoList | null) => {
    todos = next ?? undefined
    onTodos?.(next)
  }

  const createTodoList = tool({
    description:
      'Show the user a to-do checklist for a task with several items, to tick off as you work. Not for explaining an approach: use createPlan for that. Replaces any list you made before.',
    inputSchema: z.object({
      title: z.string().describe('Short name of the task'),
      description: z.string().optional().describe('One sentence on the goal'),
      items: z.array(z.object({ title: z.string(), status: itemStatus.default('pending') })).min(1),
    }),
    execute: (input) => {
      show(input)
      return `The to-do list is shown with ${input.items.length} items, numbered from 0.`
    },
  })

  const updateTodoList = tool({
    description: 'Update your to-do list: change item statuses by their index, rename it, or add items at the end.',
    inputSchema: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      itemUpdates: z
        .array(z.object({ index: z.number().int().min(0), title: z.string().optional(), status: itemStatus.optional() }))
        .optional()
        .describe('Changes to existing items, by index from 0'),
      newItems: z.array(z.object({ title: z.string(), status: itemStatus.default('pending') })).optional(),
    }),
    execute: ({ title, description, itemUpdates, newItems }) => {
      if (!todos) return 'There is no to-do list yet. Call createTodoList first.'
      const items = todos.items.map((item, index) => {
        const change = itemUpdates?.find((update) => update.index === index)
        return change ? { title: change.title ?? item.title, status: change.status ?? item.status } : item
      })
      show({
        title: title ?? todos.title,
        description: description ?? todos.description,
        items: [...items, ...(newItems ?? [])],
      })
      return 'The to-do list is updated.'
    },
  })

  const seeTodoList = tool({
    description: 'See your current to-do list with each item numbered from 0 and its status.',
    inputSchema: z.object({}),
    execute: () => todos ?? 'There is no to-do list yet.',
  })

  const deleteTodoList = tool({
    description: 'Remove your to-do list when it no longer fits the task.',
    inputSchema: z.object({}),
    execute: () => {
      if (!todos) return 'There is no to-do list to delete.'
      show(null)
      return 'The to-do list is removed.'
    },
  })

  return { createTodoList, seeTodoList, updateTodoList, deleteTodoList }
}
