import { describe, expect, it } from 'vitest'

import { artifactKind } from './artifact.store'

const kind = (name: string, type = '') => artifactKind({ name, type })

describe('artifactKind', () => {
  it('opens Office files by extension or MIME type', () => {
    expect(kind('report.docx')).toBe('docx')
    expect(kind('x', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('xlsx')
    expect(kind('deck.PPTX')).toBe('pptx')
    expect(kind('data.csv', 'text/csv')).toBe('csv')
  })

  it('treats Google Drive files as links, whatever their name or MIME type', () => {
    expect(kind('Plan.gdoc')).toBe('google')
    expect(kind('Budget.gsheet')).toBe('google')
    expect(kind('Talk.gslides')).toBe('google')
    expect(kind('Plan', 'application/vnd.google-apps.document')).toBe('google')
  })

  it('keeps the existing kinds', () => {
    expect(kind('a.md')).toBe('markdown')
    expect(kind('a.pdf', 'application/pdf')).toBe('pdf')
    expect(kind('a.png', 'image/png')).toBe('image')
    expect(kind('old.doc', 'application/msword')).toBeNull()
  })
})
