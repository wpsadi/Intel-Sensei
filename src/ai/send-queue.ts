import { create } from 'zustand'

import { SEND_MODE } from '@/ai/send-mode'
import type { ChatAttachment } from '@/features/note/db/types'

/** A message sent while a reply was running, waiting to be sent or to be taken into the running reply. */
export interface PendingMessage {
  id: string
  text: string
  attachments?: ChatAttachment[]
  /** Sent into the running reply (steer) rather than held until it ends (queue). */
  steer: boolean
}

/** Pending messages by chat id, oldest first. Shared by Ask Sensei, the S-Note widget and the S3D agent. */
export const useSendQueue = create<{ items: Record<string, PendingMessage[]> }>()(() => ({ items: {} }))

const set = (chatId: string, update: (list: PendingMessage[]) => PendingMessage[]) =>
  useSendQueue.setState((state) => {
    const list = update(state.items[chatId] ?? [])
    const { [chatId]: _, ...rest } = state.items
    return { items: list.length ? { ...rest, [chatId]: list } : rest }
  })

export const removePending = (chatId: string, id: string) => set(chatId, (list) => list.filter((item) => item.id !== id))

/**
 * Holds a message sent while a reply is running. With steer behaviour (and a way to steer, `steerNow`) it also goes
 * into the running reply; if the reply ends before it is taken, it stays here and is sent like a queued one.
 */
export function submitWhileBusy(
  chatId: string,
  input: Pick<PendingMessage, 'text' | 'attachments'>,
  steerNow?: (message: PendingMessage) => void,
): PendingMessage {
  const message: PendingMessage = { id: crypto.randomUUID(), ...input, steer: SEND_MODE.value === 'steer' && !!steerNow }
  set(chatId, (list) => [...list, message])
  if (message.steer) steerNow?.(message)
  return message
}

/**
 * Removes and returns the next pending message, from `chatId` first, then from the chats in `others`. Chat ids of the
 * other surfaces are never touched, since the queue is shared.
 */
export function takeNextPending(chatId: string, others: string[] = []): { chatId: string; message: PendingMessage } | null {
  const items = useSendQueue.getState().items
  const from = [chatId, ...others].find((id) => items[id]?.length)
  const message = from ? items[from]?.[0] : undefined
  if (!from || !message) return null
  removePending(from, message.id)
  return { chatId: from, message }
}

/** A reply ended without taking some steering messages, so they wait like queued ones from now on. Only `chatId`'s when given. */
export function demoteSteering(chatId?: string) {
  useSendQueue.setState((state) => ({
    items: Object.fromEntries(
      Object.entries(state.items).map(([id, list]) => [id, chatId && id !== chatId ? list : list.map((item) => ({ ...item, steer: false }))]),
    ),
  }))
}
