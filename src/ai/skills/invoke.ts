import { parseSlashCommand } from './format'
import { Skills } from './skills'

/** The most characters of one skill's instructions put in front of the model. */
const BODY_MAX = 40_000

/** A skill's instructions as the model should read them: what they are and that they came from a skill, not the user. */
export function skillBlock(skill: { name: string; description: string; body: string; source: string; origin?: string }) {
  const body = skill.body.length > BODY_MAX ? `${skill.body.slice(0, BODY_MAX)}\n\n[The instructions were cut here.]` : skill.body
  const from = skill.origin ? ` (from skills.sh: ${skill.origin})` : ''
  return `Skill "${skill.name}"${from}. ${skill.description}\n\n${body}`
}

/**
 * A message that starts with `/skill-name`, as the model should get it: the skill's instructions, then what the user
 * asked. The chat keeps showing what the user typed. Anything else comes back as it was.
 */
export async function applySkillCommand(text: string): Promise<string> {
  const command = parseSlashCommand(text)
  if (!command) return text
  const skill = await Skills.get(command.name)
  if (!skill) return text
  return `The user ran the skill /${skill.name}. Follow its instructions for this request.\n\n${skillBlock(skill)}\n\nUser request: ${command.rest || '(nothing more: carry out the skill)'}`
}

/** The instructions of a `/skill-name` message on their own, for agents that keep the request and its context apart. */
export async function skillContextFor(text: string): Promise<string | undefined> {
  const command = parseSlashCommand(text)
  const skill = command && (await Skills.get(command.name))
  return skill ? `The user ran the skill /${skill.name}. Follow its instructions for this request.\n\n${skillBlock(skill)}` : undefined
}
