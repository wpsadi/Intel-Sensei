import { ListChecksIcon } from 'lucide-react'
import { type BlockDefinition, chain } from '../../insert'

/** To-do list block for the "/" and "+" menus. */
export const ToDoListBlock: BlockDefinition = {
  group: 'Basic blocks',
  key: 'todo',
  title: 'To-do list',
  icon: <ListChecksIcon className="size-4" />,
  keywords: ['task', 'checkbox'],
  run: (e, r) => chain(e, r).toggleTaskList().run(),
}
