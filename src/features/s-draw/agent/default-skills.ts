import { parseSkillMarkdown, parseSlashCommand } from '@/ai/skills/format'

import { LARGE_DRAWING_SKILL } from './large-drawing-skill'
import diagramSkill from './skills/excalidraw-diagram/SKILL.md?raw'
import cliSkill from './skills/sdraw-cli/SKILL.md?raw'

export interface DefaultDrawSkill {
  name: string
  description: string
  body: string
}

export const DEFAULT_DRAW_SKILLS: readonly DefaultDrawSkill[] = [diagramSkill, LARGE_DRAWING_SKILL, cliSkill].map((markdown) => {
  const skill = parseSkillMarkdown(markdown)
  if (!skill.name || !skill.description) throw new Error('A bundled SDraw skill is missing its name or description')
  return { name: skill.name, description: skill.description, body: skill.body }
})

export const findDefaultDrawSkill = (name: string) => DEFAULT_DRAW_SKILLS.find((skill) => skill.name === name.trim().replace(/^\//, ''))

export const defaultDrawSkillBlock = (skill: DefaultDrawSkill) =>
  `Default SDraw skill /${skill.name}: ${skill.description}\n\n${skill.body}`

export const DEFAULT_DRAW_SKILL_INSTRUCTIONS = DEFAULT_DRAW_SKILLS.map(defaultDrawSkillBlock).join('\n\n')

export function expandDefaultDrawSkill(text: string): string | undefined {
  const command = parseSlashCommand(text)
  const skill = command && findDefaultDrawSkill(command.name)
  return skill
    ? `The user ran /${skill.name}. Apply this skill to the request.\n\n${defaultDrawSkillBlock(skill)}\n\nUser request: ${command.rest || '(carry out the skill)'}`
    : undefined
}
