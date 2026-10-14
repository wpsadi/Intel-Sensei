'use client'

import { DatabaseBackupIcon, DollarSignIcon, type LucideIcon, Paintbrush, ShieldIcon, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'

import { AiSection } from './ai-section'
import { AppearanceSection } from './appearance-section'
import { BackupSection } from './backup-section'
import { SecuritySection } from './security-section'

const SETTINGS_PARAM = 'settings'
const SECTION_PARAM = 'section'

const SECTIONS = [
  { id: 'ai', name: 'AI features', icon: Sparkles },
  { id: 'security', name: 'Security', icon: ShieldIcon },
  { id: 'backup', name: 'Backup', icon: DatabaseBackupIcon },
  { id: 'appearance', name: 'Appearance', icon: Paintbrush },
  { id: 'usage', name: 'Usage', icon: DollarSignIcon },
] satisfies { id: string; name: string; icon: LucideIcon }[]

type SectionId = (typeof SECTIONS)[number]['id']

const SECTION_NAMES = Object.fromEntries(SECTIONS.map((section) => [section.id, section.name]))

function UsageSection({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">See how many tokens each model has used and what that cost.</p>
      <Button render={<Link to="/ai-usage" onClick={onNavigate} />} size="sm" className="w-fit">
        Open AI usage
      </Button>
    </div>
  )
}

// Open state lives in the URL (?settings=open) so any page can open it with a link; ?section=security opens a specific tab.
export function SettingsDialog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const open = searchParams.get(SETTINGS_PARAM) === 'open'
  const requested = searchParams.get(SECTION_PARAM)
  const [picked, setPicked] = useState<SectionId>('ai')
  const section = SECTIONS.find((item) => item.id === requested)?.id ?? picked

  const handleOpenChange = (next: boolean) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next) params.set(SETTINGS_PARAM, 'open')
      else {
        params.delete(SETTINGS_PARAM)
        params.delete(SECTION_PARAM)
      }
      return params
    })
  }

  const choose = (id: SectionId) => {
    setPicked(id)
    // An explicit ?section= would otherwise win over the choice.
    if (requested) {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        params.delete(SECTION_PARAM)
        return params
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[560px] md:max-w-[700px] lg:max-w-[800px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Customize your settings here.</DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {SECTIONS.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton isActive={item.id === section} onClick={() => choose(item.id)}>
                          <item.icon />
                          <span>{item.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[min(560px,85svh)] min-w-0 flex-1 flex-col overflow-hidden md:h-[540px]">
            <header className="flex shrink-0 items-center gap-2 px-4 pt-4 pr-14 pb-2 md:h-16 md:pt-0 md:pb-0">
              {/* The sidebar is hidden on small screens, so a picker takes its place. */}
              <div className="min-w-0 flex-1 md:hidden">
                <Select value={section} onValueChange={(value) => value && choose(value as SectionId)} items={SECTION_NAMES}>
                  <SelectTrigger className="w-full" aria-label="Settings section">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {SECTIONS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <item.icon />
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Breadcrumb className="hidden md:block">
                <BreadcrumbList>
                  <BreadcrumbItem>Settings</BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{SECTION_NAMES[section]}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-4 p-4 pt-2 md:pt-0">
                {section === 'ai' && <AiSection />}
                {section === 'security' && <SecuritySection />}
                {section === 'backup' && <BackupSection />}
                {section === 'appearance' && <AppearanceSection />}
                {section === 'usage' && <UsageSection onNavigate={() => handleOpenChange(false)} />}
              </div>
            </ScrollArea>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
