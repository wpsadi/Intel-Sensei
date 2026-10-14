/**
 * A page in a cross-origin iframe cannot be read or drawn by us, so its screenshot is a capture of this tab, cropped to the
 * iframe. The user shares the tab once (the browser asks); the stream is then kept so the agent can look whenever it wants.
 */
let stream: MediaStream | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export const screenshotsOn = () => !!stream?.active
export const subscribeScreenshots = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export async function startScreenshots(): Promise<boolean> {
  if (screenshotsOn()) return true
  try {
    const next = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    } as DisplayMediaStreamOptions)
    next.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (stream === next) stream = null
      notify()
    })
    stream = next
    notify()
    return true
  } catch {
    return false
  }
}

export function stopScreenshots() {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  notify()
}

/** The widest a screenshot is sent, so it stays cheap for the model while text is still readable. */
const MAX_WIDTH = 1280

/** How many iframe pixels one pixel of the screenshot stands for. */
export const shotScale = (iframe: HTMLIFrameElement) => Math.max(1, iframe.getBoundingClientRect().width / MAX_WIDTH)

export interface Screenshot {
  /** PNG, base64. */
  data: string
  /** Size of the picture. The model's coordinates are in these pixels. */
  width: number
  height: number
  /** Size of the iframe on the page, which is where actions land. */
  cssWidth: number
  cssHeight: number
}

export async function screenshotOf(iframe: HTMLIFrameElement): Promise<Screenshot | null> {
  if (!stream?.active) return null
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  await video.play()
  // The first frame can arrive a moment after play() resolves.
  if (!video.videoWidth) await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }))
  const rect = iframe.getBoundingClientRect()
  const source = video.videoWidth / window.innerWidth
  const out = Math.min(1, MAX_WIDTH / rect.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width * out))
  canvas.height = Math.max(1, Math.round(rect.height * out))
  canvas
    .getContext('2d')
    ?.drawImage(video, rect.left * source, rect.top * source, rect.width * source, rect.height * source, 0, 0, canvas.width, canvas.height)
  video.srcObject = null
  return {
    data: canvas.toDataURL('image/png').split(',')[1],
    width: canvas.width,
    height: canvas.height,
    cssWidth: rect.width,
    cssHeight: rect.height,
  }
}
