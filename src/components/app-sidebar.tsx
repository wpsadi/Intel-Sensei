'use client'

import {
  ArrowLeftIcon,
  DollarSignIcon,
  DraftingCompassIcon,
  HomeIcon,
  NotebookPenIcon,
  PaintbrushIcon,
  PenToolIcon,
  Settings2Icon,
  SparklesIcon,
  TerminalIcon,
} from 'lucide-react'
import * as React from 'react'
import { BsBrowserChrome } from 'react-icons/bs'
import { Link } from 'react-router-dom'

import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const data = {
  navMain: [
    {
      title: 'Ask Sensei',
      url: '/ask-sensei',
      icon: <SparklesIcon />,
    },
    {
      title: 'Home',
      url: '/',
      icon: <HomeIcon />,
      isActive: true,
    },
    {
      title: 'SNote',
      url: '/s-note',
      icon: <NotebookPenIcon />,
    },
    {
      title: 'SDraw',
      url: '/s-draw',
      icon: <PaintbrushIcon />,
    },
    {
      title: 'S-Design',
      url: '/s-design',
      icon: <PenToolIcon />,
    },
    {
      title: 'S3D',
      url: '/s-3d',
      icon: <DraftingCompassIcon />,
    },
    {
      title: 'SBrowse',
      url: '/s-browse',
      icon: <BsBrowserChrome />,
    },
  ],
  navSecondary: [
    {
      title: 'AI usage',
      url: '/ai-usage',
      icon: <DollarSignIcon />,
    },
    {
      title: 'Settings',
      url: '?settings=open',
      icon: <Settings2Icon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />}>
              <ArrowLeftIcon />
              <span>Back to home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Link to="/" className="flex items-center gap-2 px-2 py-2 text-sm font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <TerminalIcon className="size-3.5" />
          </span>
          Sensei
        </Link>
        <NavMain items={data.navMain} />
      </SidebarHeader>
      <SidebarContent>
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
