import * as React from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sidebar, SidebarContent } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DesignPanel } from '@/features/s-3d/inspector/design-panel'
import { PrototypePanel } from '@/features/s-3d/inspector/prototype-panel'
import { SceneInspector } from '@/features/s-3d/scene-editor/scene-panels'
import { useS3D } from '@/features/s-3d/store'

/** S3D inspector: Design (transform, layout, paint, effects, export) and Prototype (states, interactions) tabs. */
export function S3DRightSidebar({ className, ...props }: React.ComponentProps<typeof Sidebar>) {
  const [tab, setTab] = React.useState<'design' | 'prototype'>('design')
  const sceneOpen = useS3D((s) => !!s.sceneEdit)
  return (
    <Sidebar collapsible="none" className={cn('sticky top-0 hidden h-svh border-l lg:flex', className)} {...props}>
      <SidebarContent className="gap-0 overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
          {(['design', 'prototype'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('h-6 rounded-md px-2 text-xs font-medium capitalize text-muted-foreground hover:text-foreground', tab === t && 'bg-accent text-foreground')}
            >
              {t}
            </button>
          ))}
        </div>
        <TooltipProvider>
          <ScrollArea className="min-h-0 flex-1">{sceneOpen ? <SceneInspector /> : tab === 'design' ? <DesignPanel /> : <PrototypePanel />}</ScrollArea>
        </TooltipProvider>
      </SidebarContent>
    </Sidebar>
  )
}
