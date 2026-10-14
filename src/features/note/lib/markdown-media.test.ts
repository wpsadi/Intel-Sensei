// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { docToMarkdown } from './markdown'
import { documentHtml } from './markdown-import'

const doc = (...content: unknown[]) => JSON.stringify({ type: 'doc', content })

describe('media in a document', () => {
  it('is written as a link to the stored file', () => {
    const md = docToMarkdown(
      doc(
        { type: 'media', attrs: { kind: 'image', src: 'snote-media:abc', name: 'chart.png' } },
        { type: 'media', attrs: { kind: 'video', src: 'snote-media:def', name: 'clip.mp4' } },
      ),
    )
    expect(md).toBe('![chart.png](snote-media:abc)\n\n[clip.mp4](snote-media:def "video")\n')
  })

  it('comes back as media blocks, and plain pictures and links stay as they are', () => {
    const html = documentHtml('![chart.png](snote-media:abc)\n\n[clip.mp4](snote-media:def "video")\n\nSee [docs](https://x.dev) now.\n')
    expect(html).toContain('<div data-type="media" kind="image" src="snote-media:abc" name="chart.png"></div>')
    expect(html).toContain('<div data-type="media" kind="video" src="snote-media:def" name="clip.mp4"></div>')
    expect(html).toContain('<p>See <a href="https://x.dev">docs</a> now.</p>')
  })
})
