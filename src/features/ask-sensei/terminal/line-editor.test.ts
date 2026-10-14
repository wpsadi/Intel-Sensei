import { describe, expect, it } from 'vitest'

import { LineEditor, shellPrompt } from './line-editor'

const lines = (actions: ReturnType<LineEditor['feed']>) => actions.flatMap((a) => (a.type === 'submit' ? [a.line] : []))

describe('LineEditor', () => {
  it('collects typing and submits on enter', () => {
    const editor = new LineEditor()
    editor.feed('ls -l')
    expect(editor.line).toBe('ls -l')
    expect(lines(editor.feed('\r'))).toEqual(['ls -l'])
    expect(editor.line).toBe('')
  })

  it('edits in the middle of the line', () => {
    const editor = new LineEditor()
    editor.feed('cat fle')
    editor.feed('\x1b[D\x1b[D')
    editor.feed('i')
    expect(editor.line).toBe('cat file')
    editor.feed('\x7f')
    expect(editor.line).toBe('cat fle')
    editor.feed('\x1b[3~')
    expect(editor.line).toBe('cat fe')
  })

  it('walks back through history and returns to what was being typed', () => {
    const editor = new LineEditor()
    editor.feed('first\r')
    editor.feed('second\r')
    editor.feed('dra')
    editor.feed('\x1b[A')
    expect(editor.line).toBe('second')
    editor.feed('\x1b[A')
    expect(editor.line).toBe('first')
    editor.feed('\x1b[B\x1b[B')
    expect(editor.line).toBe('dra')
  })

  it('runs each line of a paste and keeps the last one open', () => {
    const editor = new LineEditor()
    expect(lines(editor.feed('pwd\nls\nwc'))).toEqual(['pwd', 'ls'])
    expect(editor.line).toBe('wc')
  })

  it('interrupts and clears with control keys', () => {
    const editor = new LineEditor()
    editor.feed('sleep 9')
    expect(editor.feed('\x03').some((a) => a.type === 'interrupt')).toBe(true)
    expect(editor.line).toBe('')
    expect(editor.feed('\x0c').some((a) => a.type === 'clear')).toBe(true)
  })

  it('does not repeat the same command in history', () => {
    const editor = new LineEditor()
    editor.feed('ls\r')
    editor.feed('ls\r')
    expect(editor.history).toEqual(['ls'])
  })
})

describe('shellPrompt', () => {
  const plain = (text: string) => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

  it('names the machine after the first part of the chat id', () => {
    expect(plain(shellPrompt('89e42fdc-7f36-48af-b27d-741b623a1118'))).toBe('user@89e42fdc:~$ ')
  })

  it('shows the home folder as ~ and folders under it from there', () => {
    const id = '89e42fdc-7f36-48af-b27d-741b623a1118'
    expect(plain(shellPrompt(id, '/home/user'))).toBe('user@89e42fdc:~$ ')
    expect(plain(shellPrompt(id, '/home/user/work/data'))).toBe('user@89e42fdc:~/work/data$ ')
    expect(plain(shellPrompt(id, '/tmp'))).toBe('user@89e42fdc:/tmp$ ')
  })
})
