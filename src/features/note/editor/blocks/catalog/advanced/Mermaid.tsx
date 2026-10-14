import { WorkflowIcon } from 'lucide-react'

import { type BlockDefinition, chain } from '../../insert'

/** Code - Mermaid block for the "/" and "+" menus. */
export const MermaidBlock: BlockDefinition = {
  group: 'Advanced blocks',
  key: 'mermaid',
  title: 'Code - Mermaid',
  icon: <WorkflowIcon className="size-4" />,
  keywords: ['diagram', 'flowchart'],
  run: (e, r) =>
    chain(e, r)
      .insertContent({
        type: 'codeBlock',
        attrs: { language: 'mermaid' },
        content: [
          {
            type: 'text',
            text: 'graph TD\n  A[Start] --> B{Idea?}\n  B -->|Yes| C[Write it down]\n  B -->|No| A',
          },
        ],
      })
      .run(),
}
