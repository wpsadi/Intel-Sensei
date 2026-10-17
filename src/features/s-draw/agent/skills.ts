import { applySkillCommand } from '@/ai/skills/invoke'
import { createSkillTools } from '@/ai/skills/tools'

import { DEFAULT_DRAW_SKILLS, defaultDrawSkillBlock, expandDefaultDrawSkill, findDefaultDrawSkill } from './default-skills'

export async function applyDrawSkillCommand(text: string): Promise<string> {
  return expandDefaultDrawSkill(text) ?? applySkillCommand(text)
}

export function createDrawSkillTools() {
  const shared = createSkillTools()
  const load = shared.use_skill.execute!
  const search = shared.find_skill.execute!
  shared.use_skill.description = `${shared.use_skill.description} Also loads bundled SDraw skills: ${DEFAULT_DRAW_SKILLS.map((skill) => skill.name).join(', ')}.`
  shared.use_skill.execute = (input, options) => {
    const skill = findDefaultDrawSkill(input.name)
    return skill ? defaultDrawSkillBlock(skill) : load(input, options)
  }
  shared.find_skill.execute = async (input, options) => {
    const words = input.query.toLowerCase().trim().split(/\s+/)
    const matches = DEFAULT_DRAW_SKILLS.filter((skill) =>
      words.every((word) => `${skill.name} ${skill.description}`.toLowerCase().includes(word)),
    )
    const defaults = matches.map((skill) => `[SDraw default] ${skill.name}: ${skill.description}`).join('\n')
    const installed = await search(input, options)
    return [defaults, installed].filter(Boolean).join('\n')
  }
  return shared
}
