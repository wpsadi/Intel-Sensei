import { describe, expect, it } from 'vitest'

import { mentionedFiles, withFileMentions } from './file-mentions'

const names = ['report.pdf', 'report', 'Pasted text 2.txt', 'data.csv']

describe('@file mentions', () => {
  it('finds the files a message points at, and not a shorter name inside a longer one', () => {
    expect(mentionedFiles('summarise @report.pdf please', names)).toEqual(['report.pdf'])
    expect(mentionedFiles('plot @data.csv, then @report', names).sort()).toEqual(['data.csv', 'report'])
  })

  it('reads a name with spaces and ignores case', () => {
    expect(mentionedFiles('what is in @pasted TEXT 2.txt?', names)).toEqual(['Pasted text 2.txt'])
  })

  it('does not take an email address or an unknown file', () => {
    expect(mentionedFiles('mail me at a@data.csvx or @missing.txt', names)).toEqual([])
  })

  it('tells the model where the files are, and leaves other messages alone', () => {
    expect(withFileMentions('hello', names)).toBe('hello')
    const text = withFileMentions('open @data.csv', names)
    expect(text).toContain('open @data.csv')
    expect(text).toContain('"data.csv"')
    expect(text).toContain('sandbox home folder')
  })
})
