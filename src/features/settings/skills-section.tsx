import { CheckIcon, CopyIcon, DownloadIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { toSkillMarkdown } from '@/ai/skills/format'
import { type Skill, Skills, useInstalledSkills } from '@/ai/skills/skills'
import { type RemoteSkill, searchSkillsSh } from '@/ai/skills/skills-sh'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const SOURCE_LABEL: Record<Skill['source'], string> = { user: 'Yours', agent: 'Saved by Sensei', 'skills.sh': 'skills.sh' }

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

function SkillRow({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="flex flex-col gap-1.5 border p-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-medium">/{skill.name}</span>
            <Badge variant="secondary">{SOURCE_LABEL[skill.source]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{skill.description}</p>
          {skill.origin && <p className="truncate font-mono text-[11px] text-muted-foreground">{skill.origin}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'View'}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy ${skill.name} as SKILL.md`}
          onClick={() => void navigator.clipboard.writeText(toSkillMarkdown(skill)).then(() => toast('Copied as SKILL.md'))}
        >
          <CopyIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${skill.name}`}
          onClick={() => void Skills.remove(skill.name).then(() => toast(`Removed /${skill.name}`))}
        >
          <Trash2Icon />
        </Button>
      </div>
      {open && <pre className="max-h-64 overflow-auto bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{skill.body}</pre>}
    </li>
  )
}

/** Paste a SKILL.md, or just instructions with a name. */
function AddCard() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const add = async () => {
    setError('')
    try {
      const skill = text.trimStart().startsWith('---')
        ? await Skills.saveMarkdown(text, 'user', { fallbackName: name })
        : await Skills.save({ name, description, body: text, source: 'user' })
      toast.success(`Added /${skill.name}`)
      setName('')
      setDescription('')
      setText('')
    } catch (failure) {
      setError(message(failure))
    }
  }

  return (
    <section className="flex flex-col gap-2 border p-4">
      <h3 className="text-sm font-medium">Add your own</h3>
      <p className="text-xs text-muted-foreground">
        Paste a SKILL.md (with <code className="font-mono">name</code> and <code className="font-mono">description</code> at the top), or
        write the instructions and give it a name. Run it anywhere by typing <code className="font-mono">/name</code>.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="name (such as weekly-report)" aria-label="Skill name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="what it is for"
          aria-label="Skill description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Textarea
        rows={7}
        className="font-mono text-xs"
        placeholder={'---\nname: weekly-report\ndescription: Summarise the week for the team\n---\n\n1. …'}
        aria-label="Skill instructions"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button size="sm" className="w-fit" disabled={!text.trim()} onClick={() => void add()}>
        Add skill
      </Button>
    </section>
  )
}

/** Search skills.sh and install one. */
function FindCard({ installed }: { installed: Skill[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RemoteSkill[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const have = new Set(installed.map((skill) => skill.origin))

  const search = async () => {
    setError('')
    setBusy('search')
    try {
      setResults(await searchSkillsSh(query, { limit: 12 }))
    } catch (failure) {
      setResults(null)
      setError(message(failure))
    } finally {
      setBusy(null)
    }
  }

  const install = async (id: string) => {
    setBusy(id)
    try {
      toast.success(`Installed /${(await Skills.install(id)).name}`)
    } catch (failure) {
      toast.error(message(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-2 border p-4">
      <h3 className="text-sm font-medium">Find skills on skills.sh</h3>
      <p className="text-xs text-muted-foreground">
        Skills here were written by other people. Read one (View, after installing) before you rely on it. Sensei can also search and
        install them itself while it works.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <Input
          placeholder="Search, such as “pdf” or “react testing”"
          aria-label="Search skills.sh"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={query.trim().length < 2 || busy === 'search'}>
          <SearchIcon />
          Search
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {results && !results.length && <p className="text-xs text-muted-foreground">Nothing found.</p>}
      {!!results?.length && (
        <ul className="flex flex-col gap-1.5">
          {results.map((skill) => (
            <li key={skill.id} className="flex items-center gap-2 border p-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{skill.name}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {skill.id} · {skill.installs.toLocaleString('en-US')} installs
                </span>
              </div>
              {have.has(skill.id) ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckIcon className="size-3.5" />
                  Installed
                </span>
              ) : (
                <Button size="sm" variant="outline" disabled={busy === skill.id} onClick={() => void install(skill.id)}>
                  <DownloadIcon />
                  Install
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Skills are shared by Ask Sensei, S-Note, S3D and S-Design: add them, install them, remove them here. */
export function SkillsSection() {
  const skills = useInstalledSkills()
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-xs text-muted-foreground">
        A skill is a saved set of instructions. Type <code className="font-mono">/skill-name</code> in Ask Sensei, S-Note, S3D or S-Design
        to run it, or let Sensei find and load one when a task fits. Skills are the same in every app.
      </p>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Installed ({skills.length})</h3>
        {skills.length ? (
          <ul className="flex flex-col gap-1.5">
            {skills.map((skill) => (
              <SkillRow key={skill.name} skill={skill} />
            ))}
          </ul>
        ) : (
          <p className="border border-dashed p-4 text-xs text-muted-foreground">
            No skills yet. Add one below, install one from skills.sh, or ask Sensei to save one.
          </p>
        )}
      </section>
      <AddCard />
      <FindCard installed={skills} />
    </div>
  )
}
