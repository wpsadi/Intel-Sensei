import { pagesRepo, settingsRepo } from '../db/repo'
import { toast } from 'sonner'
import { useNoteStore } from '../note.store'

const SEEDED = 'seeded'

const text = (value: string) => ({ type: 'text', text: value })
const paragraph = (value = '') => ({ type: 'paragraph', content: value ? [text(value)] : [] })

let seeding: Promise<string | undefined> | null = null

/** Creates the welcome page and the local "Me" person on first launch. Returns the page to open. */
export function ensureWorkspace() {
  seeding ??= seedWorkspace().finally(() => {
    seeding = null
  })
  return seeding
}

async function seedWorkspace() {
  const roots = await pagesRepo.roots()
  if (await settingsRepo.get(SEEDED)) return roots[0]?.id

  await useNoteStore.getState().createPerson('Me')
  const welcome = await useNoteStore.getState().createPage({
    parentId: null,
    parentType: 'workspace',
    title: 'Getting started',
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'callout', attrs: { icon: '💡', color: 'blue' }, content: [paragraph('Everything here is stored in your browser. Text lives in IndexedDB, media in the Cache Storage bucket.')] },
        { type: 'heading', attrs: { level: 2 }, content: [text('Try it out')] },
        {
          type: 'taskList',
          content: [
            "Type '/' to open the block menu",
            "Type '@' to mention a person, page or date",
            "Type ':' for emoji",
            'Select text to format it',
            'Drag an image into the page',
          ].map((item) => ({ type: 'taskItem', attrs: { checked: false }, content: [paragraph(item)] })),
        },
        paragraph(),
      ],
    }),
  })
  await useNoteStore.getState().setSetting(SEEDED, '1')
  return welcome.id
}

/* --------------------------------- reminders -------------------------------- */

interface Reminder {
  pageId: string
  title: string
  date: string
}

function collectReminders(pageId: string, title: string, content: string, out: Reminder[]) {
  const walk = (node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }) => {
    if (node.type === 'mention' && node.attrs?.kind === 'date' && node.attrs.reminder) {
      out.push({ pageId, title, date: String(node.attrs.date) })
    }
    node.content?.forEach((child) => walk(child as typeof node))
  }
  try {
    walk(JSON.parse(content))
  } catch {
    // Unparseable content has no reminders.
  }
}

/** Polls for date mentions marked as reminders and notifies once when they come due. */
export function startReminders(open: (pageId: string) => void) {
  const fired = new Set<string>(JSON.parse(localStorage.getItem('snote-fired-reminders') ?? '[]'))

  const check = async () => {
    const reminders: Reminder[] = []
    for (const page of Object.values(useNoteStore.getState().pages)) {
      if (!page.trashed && page.content.includes('"reminder":true')) collectReminders(page.id, page.title, page.content, reminders)
    }
    const now = Date.now()
    for (const reminder of reminders) {
      const key = `${reminder.pageId}@${reminder.date}`
      const due = new Date(reminder.date).getTime()
      if (fired.has(key) || Number.isNaN(due) || due > now || now - due > 864e5) continue
      fired.add(key)
      const title = reminder.title || 'Untitled'
      toast(`Reminder: ${title}`, { action: { label: 'Open', onClick: () => open(reminder.pageId) } })
      if ('Notification' in window && Notification.permission === 'granted') new Notification('SNote reminder', { body: title })
    }
    localStorage.setItem('snote-fired-reminders', JSON.stringify([...fired]))
  }

  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  check()
  const timer = setInterval(check, 30_000)
  return () => clearInterval(timer)
}
