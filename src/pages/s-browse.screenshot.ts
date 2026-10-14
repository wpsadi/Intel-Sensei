/**
 * A page in a cross-origin iframe cannot be read or drawn by us, so its screenshot is a capture of this tab, cropped to the
 * iframe. The user shares the tab once (the browser asks); the stream is then kept so the agent can look whenever it wants.
 */
let stream: MediaStream | null = null
export const screenshotsOn = () => !!stream?.active

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
    })
    stream = next
    return true
  } catch {
    return false
  }
}

export async function screenshotOf(iframe: HTMLIFrameElement) {
  if (!stream?.active) return null
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  await video.play()
  // The first frame can arrive a moment after play() resolves.
  if (!video.videoWidth) await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }))
  const scale = video.videoWidth / window.innerWidth
  const rect = iframe.getBoundingClientRect()
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width * scale))
  canvas.height = Math.max(1, Math.round(rect.height * scale))
  canvas
    .getContext('2d')
    ?.drawImage(video, rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale, 0, 0, canvas.width, canvas.height)
  video.srcObject = null
  return canvas.toDataURL('image/png').split(',')[1]
}
