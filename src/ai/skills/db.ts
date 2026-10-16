import * as t from '@/db/schema'
import { recordStore } from '@/db/store'

/** Where a skill came from: written by the user, saved by Sensei, or installed from skills.sh. */
export type SkillSource = 'user' | 'agent' | 'skills.sh'

/** One skill. Skills are global: every app (Ask Sensei, S-Note, S-3D, S-Design) sees the same ones. */
export interface Skill {
  /** Lowercase with dashes; it is also the `/name` that runs it. */
  name: string
  description: string
  /** The instructions, as markdown. */
  body: string
  source: SkillSource
  /** For skills.sh: `owner/repo/skill`. */
  origin?: string
  installedAt: number
  updatedAt: number
}

export const skillsStore = recordStore<Skill>(t.skills, { key: 'name' })
