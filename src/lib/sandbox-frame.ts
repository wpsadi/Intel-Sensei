import POSTMATE_SCRIPT from 'postmate/build/postmate.min.js?raw'

/**
 * Talks to a sandboxed iframe over Postmate's wire protocol.
 *
 * Postmate's own parent class cannot be used here. It creates the iframe itself from a `url` and compares
 * `event.origin` with that URL's origin, but a frame sandboxed without allow-same-origin has the opaque origin
 * "null" and is loaded from srcDoc. So the child page runs the stock `Postmate.Model` and this file is the parent
 * half: it identifies the child by `event.source` (the frame's own window) instead of by origin.
 */

const MESSAGE_TYPE = 'application/x-postmate-v1+json'
const HANDSHAKE_ATTEMPTS = 5
const HANDSHAKE_INTERVAL_MS = 500

export type FrameChild = {
  /** Reads a property of the child's model. Functions and promises in the model are resolved first. */
  get: <T = unknown>(property: string) => Promise<T>
  /** Calls a function in the child's model without waiting for a result. */
  call: (property: string, data?: unknown) => void
  /** Listens for an event the child emits. One listener per event name, as in Postmate. */
  on: (event: string, listener: (data: unknown) => void) => void
  /** Stops listening. The iframe element is left alone, React owns it. */
  destroy: () => void
}

type Message = { postmate?: string; type?: string; uid?: number; value?: unknown }

let nextUid = 0

/**
 * Starts the handshake with a Postmate child inside `frame`. Resolves once the child answers, rejects if it never does,
 * for instance because the page did not load the Postmate script.
 */
export function connectFrame(frame: HTMLIFrameElement, model: Record<string, unknown> = {}): Promise<FrameChild> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    let connected = false
    let timer: ReturnType<typeof setInterval> | undefined
    const listeners = new Map<string, (data: unknown) => void>()

    // Only this frame's window is trusted. The target origin has to be '*' because an opaque origin cannot be named.
    const fromChild = (event: MessageEvent) => {
      const message = event.data as Message | null
      return event.source === frame.contentWindow && message?.type === MESSAGE_TYPE && typeof message.postmate === 'string'
    }
    const post = (message: Record<string, unknown>) => frame.contentWindow?.postMessage({ ...message, type: MESSAGE_TYPE }, '*')

    const onEmit = (event: MessageEvent) => {
      if (!fromChild(event) || (event.data as Message).postmate !== 'emit') return
      const { name, data } = (event.data as { value: { name: string; data: unknown } }).value
      listeners.get(name)?.(data)
    }

    const child: FrameChild = {
      get: (property) =>
        new Promise((done) => {
          const uid = ++nextUid
          const onReply = (event: MessageEvent) => {
            const message = event.data as Message
            if (!fromChild(event) || message.postmate !== 'reply' || message.uid !== uid) return
            window.removeEventListener('message', onReply)
            done(message.value as never)
          }
          window.addEventListener('message', onReply)
          post({ postmate: 'request', property, uid })
        }),
      call: (property, data) => post({ postmate: 'call', property, data }),
      on: (event, listener) => void listeners.set(event, listener),
      destroy: () => {
        window.removeEventListener('message', onEmit)
        window.removeEventListener('message', onHandshakeReply)
        frame.removeEventListener('load', send)
        clearInterval(timer)
        listeners.clear()
      },
    }

    function onHandshakeReply(event: MessageEvent) {
      if (!fromChild(event) || (event.data as Message).postmate !== 'handshake-reply') return
      connected = true
      clearInterval(timer)
      window.removeEventListener('message', onHandshakeReply)
      window.addEventListener('message', onEmit)
      resolve(child)
    }

    function send() {
      attempts++
      post({ postmate: 'handshake', model })
      if (attempts >= HANDSHAKE_ATTEMPTS) {
        clearInterval(timer)
        // Leaves a little time for the last answer to come back before giving up.
        setTimeout(() => {
          if (connected) return
          window.removeEventListener('message', onHandshakeReply)
          reject(new Error('The page did not answer the Postmate handshake.'))
        }, HANDSHAKE_INTERVAL_MS)
      }
    }

    window.addEventListener('message', onHandshakeReply)
    frame.addEventListener('load', send)
    timer = setInterval(send, HANDSHAKE_INTERVAL_MS)
  })
}

/**
 * Adds the Postmate child to an HTML document so its parent can reach it. The page gets a `sensei` model exposing
 * `title` and `height`, and can use the global `Postmate` itself, for instance `Postmate.Model` with its own values.
 */
export function withFrameBridge(html: string) {
  const bridge = `<script>${POSTMATE_SCRIPT.replace(/<\/script/gi, '<\\/script')}</script><script>window.sensei=new Postmate.Model({title:function(){return document.title},height:function(){return document.documentElement.scrollHeight}})</script>`
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + bridge) : bridge + html
}
