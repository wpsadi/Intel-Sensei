import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftIcon, CheckIcon, CloudIcon, LayersIcon, LoaderIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import senseiLogo from '@/assets/sensei.svg'
import { Sidebar, SidebarContent, SidebarHeader } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { useS3D } from '@/features/s-3d/store'
import { LayersPanel } from '@/features/s-design/layers/layers-panel'
import { AgentPanel } from '@/features/s-3d/agent/agent-panel'
import { SceneOutliner } from '@/features/s-3d/scene-editor/scene-panels'

function DocTitle() {
  const name = useS3D((s) => s.doc.name)
  const saving = useS3D((s) => s.saving)
  const [editing, setEditing] = React.useState(false)
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-xs" className="size-6" nativeButton={false} render={<Link to="/" aria-label="Back to home" />}><ArrowLeftIcon /></Button>
      {editing ? (
        <input
          autoFocus
          defaultValue={name}
          className="h-6 min-w-0 flex-1 rounded-sm border border-primary bg-background px-1 text-xs outline-none"
          onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== name) useS3D.getState().renameDoc(v); setEditing(false) }}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false) }}
        />
      ) : (
        <button className="min-w-0 flex-1 truncate text-left text-xs font-semibold" onDoubleClick={() => setEditing(true)} title="Double-click to rename">{name}</button>
      )}
      <span className="text-muted-foreground" title={saving === 'saved' ? 'Saved to this browser' : 'Saving…'}>
        {saving === 'saved' ? <span className="flex items-center"><CloudIcon className="size-3" /><CheckIcon className="-ml-1 size-2.5" /></span> : <LoaderIcon className="size-3 animate-spin" />}
      </span>
    </div>
  )
}

export function S3DLeftSidebar({ resizer, ...props }: React.ComponentProps<typeof Sidebar> & { resizer?: React.ReactNode }) {
  const tab = useS3D((s) => s.leftTab)
  const set = useS3D((s) => s.set)
  const sceneOpen = useS3D((s) => !!s.sceneEdit)
  const tabClass = (active: boolean) => cn('flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs transition-colors', active ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')
  return (
    <Sidebar className="border-r" collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-2 p-2">
        <DocTitle />
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5" role="tablist">
          <button role="tab" aria-selected={tab === 'agent'} className={tabClass(tab === 'agent')} onClick={() => set({ leftTab: 'agent' })}><img src={senseiLogo} alt="" className="size-3.5 brightness-0 dark:invert" />Agent</button>
          <button role="tab" aria-selected={tab === 'layers'} className={tabClass(tab === 'layers')} onClick={() => set({ leftTab: 'layers' })}><LayersIcon className="size-3.5" />Layers</button>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 overflow-hidden">
        {tab === 'layers' ? (sceneOpen ? <SceneOutliner /> : <LayersPanel />) : <AgentPanel />}
      </SidebarContent>
      {resizer}
    </Sidebar>
  )
}
