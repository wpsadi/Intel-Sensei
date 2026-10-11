"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { TerminalIcon, AudioLinesIcon, SearchIcon, SparklesIcon, HomeIcon, InboxIcon, Settings2Icon, MessageCircleQuestionIcon, NotebookPenIcon } from "lucide-react"

// This is sample data.
const data = {
  teams: [
    {
      name: "Acme Inc",
      logo: (
        <TerminalIcon
        />
      ),
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: (
        <AudioLinesIcon
        />
      ),
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: (
        <TerminalIcon
        />
      ),
      plan: "Free",
    },
  ],
  navMain: [
    {
      title: "Search",
      url: "#",
      icon: (
        <SearchIcon
        />
      ),
    },
    {
      title: "Ask Sensei",
      url: "/ask-sensei",
      icon: (
        <SparklesIcon
        />
      ),
    },
    {
      title: "Home",
      url: "#",
      icon: (
        <HomeIcon
        />
      ),
      isActive: true,
    },
    {
      title: "Inbox",
      url: "#",
      icon: (
        <InboxIcon
        />
      ),
      badge: "10",
    },
    {
      title: "SNote",
      url: "/s-note",
      icon: (
        <NotebookPenIcon
        />
      ),
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "?settings=open",
      icon: (
        <Settings2Icon
        />
      ),
    },
    {
      title: "Help",
      url: "#",
      icon: (
        <MessageCircleQuestionIcon
        />
      ),
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
        <NavMain items={data.navMain} />
      </SidebarHeader>
      <SidebarContent>
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
