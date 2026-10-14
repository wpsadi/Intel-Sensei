import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import { secureDb } from '@/features/vault/secure-db'

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

interface ISkillsDB extends DBSchema {
  skills: { key: string; value: Skill }
}

const DB_NAME = 'sensei-skills'
let dbPromise: Promise<IDBPDatabase<ISkillsDB>> | null = null

export const getSkillsDb = () =>
  (dbPromise ??= openDB<ISkillsDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('skills', { keyPath: 'name' })
    },
    blocking() {
      void dbPromise?.then((db) => db.close())
      dbPromise = null
    },
  }).then((db) => secureDb(db, DB_NAME)))
