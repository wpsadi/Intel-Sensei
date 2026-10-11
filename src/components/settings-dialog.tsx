"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Bell,
  Check,
  Globe,
  Home,
  Keyboard,
  Link,
  Lock,
  Menu,
  MessageCircle,
  Paintbrush,
  Settings,
  Sparkles,
  Video,
} from "lucide-react"

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar"
import { FIRECRAWL_KEY } from "@/ai/utils/firecrawl-key"
import { GEMINI_KEY } from "@/ai/utils/gemini-key"
import { OPENAI_BASE_URL, OPENAI_KEY } from "@/ai/utils/openai-key"
import { GeminiTestDialog } from "@/components/gemini-test-dialog"
import { useSearchParams } from "react-router-dom"
import { useState } from "react"

const SETTINGS_PARAM = "settings"

const data = {
  nav: [
    { name: "Notifications", icon: Bell },
    { name: "Navigation", icon: Menu },
    { name: "Home", icon: Home },
    { name: "Appearance", icon: Paintbrush },
    { name: "Messages & media", icon: MessageCircle },
    { name: "Language & region", icon: Globe },
    { name: "Accessibility", icon: Keyboard },
    { name: "Mark as read", icon: Check },
    { name: "Audio & video", icon: Video },
    { name: "Connected accounts", icon: Link },
    { name: "Privacy & visibility", icon: Lock },
    { name: "Advanced", icon: Settings },
    { name: "AI features", icon: Sparkles },
  ],
}

/** Gemini key used by every AI feature in the app. Stored only in this browser. */
function AiFeaturesSection() {
  const [savedKey, setSavedKey] = useState(() => GEMINI_KEY.value)
  // Null until the user types, so the field shows the saved key.
  const [draft, setDraft] = useState<string | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const value = draft ?? savedKey ?? ""
  const dirty = draft !== null && draft.trim() !== (savedKey ?? "")

  const save = () => {
    GEMINI_KEY.value = value.trim()
    setSavedKey(value.trim())
    setDraft(null)
    setResult({ ok: true, message: "Saved." })
  }

  return (
    <div className="flex max-w-md flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Gemini API key</span>
        <input
          type="password"
          value={value}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="AIza…"
          className="h-9 rounded-md border bg-background px-3 outline-none"
        />
        <span className="text-xs text-muted-foreground">
          This key is used by all AI features across the app. Stored only in this browser; requests go directly from your browser to Google.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty} className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setTestOpen(true)} disabled={!value.trim()} className="rounded-md border px-3 py-1.5 disabled:opacity-50">
          Test
        </button>
        {result && <span className={result.ok ? "text-green-600" : "text-red-500"}>{result.message}</span>}
      </div>
      <GeminiTestDialog apiKey={value.trim()} open={testOpen} onOpenChange={setTestOpen} />
      <FirecrawlKeyField />
      <OpenAIKeyField />
    </div>
  )
}

/** OpenAI key and optional base URL for the S3D agent only. Stored only in this browser. */
function OpenAIKeyField() {
  const [savedKey, setSavedKey] = useState(() => OPENAI_KEY.value)
  const [savedUrl, setSavedUrl] = useState(() => OPENAI_BASE_URL.value)
  // Null until the user types, so the fields show the saved values.
  const [draft, setDraft] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const value = draft ?? savedKey
  const url = urlDraft ?? savedUrl
  const badUrl = !!url.trim() && !/^https?:\/\/\S+$/.test(url.trim())
  const dirty = (draft !== null && draft.trim() !== savedKey) || (urlDraft !== null && urlDraft.trim() !== savedUrl)

  const save = () => {
    OPENAI_KEY.value = value.trim()
    OPENAI_BASE_URL.value = url.trim()
    setSavedKey(value.trim())
    setSavedUrl(OPENAI_BASE_URL.value)
    setDraft(null)
    setUrlDraft(null)
    setSaved(true)
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">OpenAI API key (S3D only)</span>
        <input
          type="password"
          value={value}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
          placeholder="sk-…"
          className="h-9 rounded-md border bg-background px-3 outline-none"
        />
        <span className="text-xs text-muted-foreground">
          Used only by the S3D agent, because Gemini models do not perform well at 3D modelling. Everything else keeps using your Gemini key. Stored only in this browser.
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">OpenAI base URL (optional)</span>
        <input
          type="url"
          value={url}
          onChange={(event) => {
            setUrlDraft(event.target.value)
            setSaved(false)
          }}
          placeholder="https://api.openai.com/v1"
          className="h-9 rounded-md border bg-background px-3 outline-none"
        />
        <span className={badUrl ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {badUrl ? "Enter a full URL starting with http:// or https://." : "For a proxy or any OpenAI-compatible endpoint (Azure, OpenRouter, a local server…). Leave empty for api.openai.com. It must allow requests from this browser (CORS)."}
        </span>
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty || badUrl} className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50">
          Save
        </button>
        {saved && <span className="text-green-600">Saved.</span>}
      </div>
    </div>
  )
}

/** Firecrawl key that Sensei's web search uses. Stored only in this browser. */
function FirecrawlKeyField() {
  const [savedKey, setSavedKey] = useState(() => FIRECRAWL_KEY.value)
  // Null until the user types, so the field shows the saved key.
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const value = draft ?? savedKey
  const dirty = draft !== null && draft.trim() !== savedKey

  const save = () => {
    FIRECRAWL_KEY.value = value.trim()
    setSavedKey(value.trim())
    setDraft(null)
    setSaved(true)
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Firecrawl API key (optional)</span>
        <input
          type="password"
          value={value}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
          placeholder="fc-…"
          className="h-9 rounded-md border bg-background px-3 outline-none"
        />
        <span className="text-xs text-muted-foreground">
          Optional. Web search works without a key on Firecrawl's free tier, which is limited per IP; add a key from firecrawl.dev for higher limits. Stored only in this browser.
        </span>
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={!dirty} className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50">
          Save
        </button>
        {saved && <span className="text-green-600">Saved.</span>}
      </div>
    </div>
  )
}

// Open state lives in the URL (?settings=open) so any page can open it with a link.
export function SettingsDialog() {
  const [searchParams, setSearchParams] = useSearchParams()
  const open = searchParams.get(SETTINGS_PARAM) === "open"
  const [section, setSection] = useState("Messages & media")

  const handleOpenChange = (next: boolean) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (next) params.set(SETTINGS_PARAM, "open")
      else params.delete(SETTINGS_PARAM)
      return params
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your settings here.
        </DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar collapsible="none" className="hidden md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {data.nav.map((item) => (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          isActive={item.name === section}
                          onClick={() => setSection(item.name)}
                        >
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
          <main className="flex h-[480px] flex-1 flex-col overflow-hidden">
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="#">Settings</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{section}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col gap-4 p-4 pt-0">
              {section === "AI features" ? (
                <AiFeaturesSection />
              ) : (
                Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-video max-w-3xl rounded-xl bg-muted/50"
                  />
                ))
              )}
              </div>
            </ScrollArea>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
