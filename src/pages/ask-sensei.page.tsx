import { ArrowDownIcon, SquareTerminalIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { warmSandbox } from '@/ai/sandbox/client'
import { currentTodos } from '@/ai/utils/messages'
import { QueuedMessages } from '@/components/queued-messages'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { ArtifactPanel, DraftPanel } from '@/features/ask-sensei/artifact/artifact-panel'
import { useArtifacts } from '@/features/ask-sensei/artifact/artifact.store'
import { useAskSenseiStore } from '@/features/ask-sensei/ask-sensei.store'
import { ChatComposer } from '@/features/ask-sensei/components/chat-composer'
import { ChatList } from '@/features/ask-sensei/components/chat-list'
import { ChatTodoQueue } from '@/features/ask-sensei/components/chat-plan'
import { ChatQuestionsCard } from '@/features/ask-sensei/components/chat-questions'
import { ContextUsage } from '@/features/ask-sensei/components/context-usage'
import { CONVERSATION_END_ID, Conversation } from '@/features/ask-sensei/components/conversation'
import { CALL_LEVEL_VAR } from '@/features/ask-sensei/components/live-call'
import { useCommandRunning } from '@/features/ask-sensei/terminal/command-activity'
import { RunningSpinner } from '@/features/ask-sensei/terminal/running-spinner'
import { TerminalPanel } from '@/features/ask-sensei/terminal/terminal-panel'
import { useTerminals } from '@/features/ask-sensei/terminal/terminal.store'
import type { ChatAttachment } from '@/features/note/db/types'

/** The open chat is the URL: /ask-sensei/:chatId. Chats and messages are saved in IndexedDB through the Ask Sensei store. */
function AskSenseiPage() {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const {
    ready,
    chats,
    messages,
    streamingId,
    stopReply,
    load,
    createChat,
    sendMessage,
    retryReply,
    renameChat,
    setTodosCollapsed,
    regenerateTitle,
    deleteChat,
  } = useAskSenseiStore()
  const [atBottom, setAtBottom] = useState(true)
  const [inCall, setInCall] = useState(false)
  const terminalOpen = useTerminals((state) => state.open)
  const commandRunning = useCommandRunning(chatId)
  const setTerminalOpen = useTerminals((state) => state.setOpen)
  const artifact = useArtifacts((state) => state.current)
  const closeArtifact = useArtifacts((state) => state.close)

  useEffect(() => {
    void load()
  }, [load])

  const sortedChats = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats])
  const activeChat = chats.find((chat) => chat.id === chatId)
  const activeMessages = activeChat ? (messages[activeChat.id] ?? []) : []
  const newestId = sortedChats[0]?.id
  const activeChatId = activeChat?.id

  // The open chat's Python environment starts in the background on every load and every chat switch, and brings back
  // the files and commands the chat had, so it is ready by the time anything needs it.
  useEffect(() => {
    if (activeChatId) warmSandbox(activeChatId)
  }, [activeChatId])
  // The newest to-do list stays pinned above the input until all of its items are done.
  const pinnedTodos = currentTodos(activeMessages)
  // Questions Sensei is waiting on take the to-do list's place above the input until they are answered.
  const pendingQuestions = activeMessages.find((message) => message.id === streamingId && message.questions && !message.questions.answers)
  const showTodos = !pendingQuestions && pinnedTodos?.items.some((item) => item.status !== 'completed')

  // /ask-sensei with no chat id opens the newest chat.
  useEffect(() => {
    if (ready && !chatId && newestId) navigate(`/ask-sensei/${newestId}`, { replace: true })
  }, [ready, chatId, newestId, navigate])

  const openChat = (id: string) => navigate(`/ask-sensei/${id}`)

  const newChat = async () => openChat((await createChat()).id)

  // Sending with no chat open starts one. The URL moves to it straight away, and the reply streams in.
  const send = async (text: string, attachments: ChatAttachment[]) => {
    const id = await sendMessage(activeChat?.id ?? null, text, attachments)
    if (id && id !== activeChat?.id) openChat(id)
  }

  const removeChat = async (id: string) => {
    await deleteChat(id)
    if (chatId === id) {
      const next = sortedChats.find((chat) => chat.id !== id)
      navigate(next ? `/ask-sensei/${next.id}` : '/ask-sensei', {
        replace: true,
      })
    }
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <ChatList
        chats={sortedChats}
        activeId={activeChat?.id ?? null}
        onSelect={openChat}
        onNew={newChat}
        onRegenerateTitle={regenerateTitle}
        onRename={renameChat}
        onDelete={removeChat}
      />
      <SidebarInset className="h-svh min-w-0 overflow-hidden md:my-0!">
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <h1 className="truncate text-base font-semibold">{activeChat?.title ?? 'Ask Sensei'}</h1>
              <Button
                variant={terminalOpen ? 'secondary' : 'ghost'}
                size="icon-sm"
                className="ml-auto"
                aria-label={terminalOpen ? 'Hide terminal' : 'Show terminal'}
                aria-pressed={terminalOpen}
                disabled={!activeChat}
                onClick={() => setTerminalOpen(!terminalOpen)}
              >
                {commandRunning ? <RunningSpinner /> : <SquareTerminalIcon />}
              </Button>
            </header>
            <main className="relative isolate flex min-h-0 flex-1 flex-col">
              {/* Aurora behind the whole chat while a live call runs. It grows and brightens with the voice on the call. */}
              {inCall && (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 overflow-hidden">
                  <div
                    className="absolute inset-x-0 -bottom-16 h-96 origin-bottom blur-2xl transition-[transform,opacity] duration-75"
                    style={{
                      transform: `scaleY(calc(0.55 + var(${CALL_LEVEL_VAR}, 0) * 0.9))`,
                      opacity: `calc(0.55 + var(${CALL_LEVEL_VAR}, 0) * 0.45)`,
                      background:
                        'radial-gradient(ellipse 70% 60% at 50% 100%, #dbeafe 0%, #93c5fd 25%, #3b82f6 50%, #2563eb 70%, transparent 100%)',
                    }}
                  />
                </div>
              )}
              <Conversation
                messages={activeMessages}
                streamingId={streamingId}
                onRetry={() => activeChat && void retryReply(activeChat.id)}
                onAtBottomChange={setAtBottom}
              />
              <div className="relative mx-auto w-full max-w-3xl p-4">
                {activeMessages.length > 0 && !atBottom && (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Scroll to latest message"
                    className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-sm"
                    onClick={() => document.getElementById(CONVERSATION_END_ID)?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
                  >
                    <ArrowDownIcon />
                  </Button>
                )}
                {pendingQuestions && <ChatQuestionsCard message={pendingQuestions} isStreaming />}
                {showTodos && pinnedTodos && activeChat && (
                  <ChatTodoQueue
                    todos={pinnedTodos}
                    open={!activeChat.todosCollapsed}
                    onOpenChange={(open) => void setTodosCollapsed(activeChat.id, !open)}
                  />
                )}
                <QueuedMessages chatId={activeChat?.id ?? null} />
                <ChatComposer
                  chatId={activeChat?.id ?? null}
                  onChatOpened={openChat}
                  onSend={send}
                  onCallChange={setInCall}
                  context={<ContextUsage messages={activeMessages} />}
                  streaming={!!streamingId}
                  onStop={stopReply}
                />
              </div>
            </main>
            {terminalOpen && activeChat && (
              <TerminalPanel key={activeChat.id} chatId={activeChat.id} onClose={() => setTerminalOpen(false)} />
            )}
          </div>
          {artifact && artifact.chatId === activeChat?.id && artifact.draftId && (
            <DraftPanel key={artifact.draftId} draftId={artifact.draftId} onClose={closeArtifact} />
          )}
          {artifact && artifact.chatId === activeChat?.id && artifact.file && (
            <ArtifactPanel key={artifact.file.src} file={artifact.file} onClose={closeArtifact} />
          )}
        </div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}

export default AskSenseiPage
