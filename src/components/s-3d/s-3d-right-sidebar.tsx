import * as React from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Sidebar, SidebarContent } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SceneInspector } from '@/features/s-3d/scene-editor/scene-panels'
import { useS3D } from '@/features/s-3d/store'
import type { Service } from '@/features/s-3d/types'
import { DesignPanel } from '@/features/s-design/inspector/design-panel'
import { PrototypePanel } from '@/features/s-design/inspector/prototype-panel'
import { cn } from '@/lib/utils'

/** S3D inspector: Design (transform, layout, paint, effects, export) and Prototype (states, interactions) tabs. */
export function S3DRightSidebar({ className, service, ...props }: React.ComponentProps<typeof Sidebar> & { service: Service }) {
  const [tab, setTab] = React.useState<'design' | 'prototype'>('design')
  const sceneOpen = useS3D((s) => !!s.sceneEdit)
  return (
    <Sidebar collapsible="none" className={cn('sticky top-0 hidden h-svh border-l lg:flex', className)} {...props}>
      <SidebarContent className="gap-0 overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
          {/* While a 3D scene is open the inspector is the scene's: Design and Prototype are about 2D frames. */}
          {sceneOpen && <span className="px-2 text-xs font-medium">{service === '3d' ? 'Inspector' : '3D scene'}</span>}
          {!sceneOpen &&
            (['design', 'prototype'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'h-6 rounded-md px-2 text-xs font-medium capitalize text-muted-foreground hover:text-foreground',
                  tab === t && 'bg-accent text-foreground',
                )}
              >
                {t}
              </button>
            ))}
        </div>
        <TooltipProvider>
          <ScrollArea className="min-h-0 flex-1">
            {sceneOpen ? <SceneInspector /> : tab === 'design' ? <DesignPanel /> : <PrototypePanel />}
          </ScrollArea>
        </TooltipProvider>
      </SidebarContent>
    </Sidebar>
  )
}
