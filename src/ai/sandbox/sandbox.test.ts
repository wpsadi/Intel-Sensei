import { loadPyodide } from 'pyodide'
import { beforeAll, describe, expect, it } from 'vitest'

import { formatScrape, scrapePage } from '@/ai/tools/scrape'
import { reflowMarkdown } from '@/features/note/sensei-widget/paste-file'

import { type PyodideLike, mountFile, prepare, readFile, runShell, safeName, writeTextFile } from './engine'
import { formatExec } from './tools'

/** A small PDF with one line of text per page, built by hand so the test needs no fixture file. */
function makePdf(pages: string[]) {
  const pageIds = pages.map((_, index) => 4 + index * 2)
  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pages.forEach((text, index) => {
    const pageId = pageIds[index]
    const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    if (!objects[id]) continue
    offsets[id] = out.length
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 ${offsets[id] ? 'n' : 'f'} \n`
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

let py: PyodideLike
const sh = async (command: string) => (await runShell(py, command)).output

beforeAll(async () => {
  py = (await loadPyodide()) as unknown as PyodideLike
  await prepare(py)
  mountFile(py, 'notes.txt', new TextEncoder().encode('alpha\nbeta\ngamma\nbeta again\n'))
  mountFile(py, 'guide.pdf', makePdf(['Layers panel basics', 'Brushes and masks', 'Exporting files']))
}, 180_000)

describe('file names', () => {
  it('keeps a name inside the home folder', () => {
    expect(safeName('../etc/passwd')).toBe('.._etc_passwd')
    expect(safeName('..')).toBe('_')
    expect(safeName('  ')).toBe('file')
  })

  it('renames a file that would overwrite another', () => {
    expect(mountFile(py, 'dup.txt', new Uint8Array([1]))).toBe('/home/user/dup.txt')
    expect(mountFile(py, 'dup.txt', new Uint8Array([2]))).toBe('/home/user/dup (2).txt')
    expect(readFile(py, 'dup (2).txt')).toEqual(new Uint8Array([2]))
  })
})

describe('read-only files', () => {
  const text = (value: string) => new TextEncoder().encode(value)

  it('go in a folder the terminal can read but not write to, and are replaced in place', async () => {
    expect(mountFile(py, 'doc.md', text('# one\n'), true)).toBe('/home/user/artifacts/doc.md')
    expect(await sh('cat artifacts/doc.md')).toBe('# one\n')
    expect(await sh('ls artifacts')).toContain('doc.md')
    await expect(sh('echo more >> artifacts/doc.md')).rejects.toThrow(/Permission denied/)
    await expect(sh('echo new > artifacts/other.md')).rejects.toThrow(/Permission denied/)
    expect(await sh('rm artifacts/doc.md')).toMatch(/Permission denied/)
    expect(await sh('cat artifacts/doc.md')).toBe('# one\n')
    expect(mountFile(py, 'doc.md', text('# two\n'), true)).toBe('/home/user/artifacts/doc.md')
    expect(await sh('cat artifacts/doc.md')).toBe('# two\n')
    // The rest of the home folder stays writable.
    await sh('echo ok > free.txt')
    expect(await sh('cat free.txt')).toBe('ok\n')
  })
})

describe('shell', () => {
  it('lists, reads and searches files', async () => {
    expect(await sh('ls')).toContain('notes.txt')
    expect(await sh('cat notes.txt')).toBe('alpha\nbeta\ngamma\nbeta again\n')
    expect(await sh('head -n 2 notes.txt')).toBe('alpha\nbeta\n')
    expect(await sh('tail -1 notes.txt')).toBe('beta again\n')
    expect(await sh('grep -n beta notes.txt')).toBe('2:beta\n4:beta again\n')
    expect(await sh('wc -l notes.txt')).toBe('4 notes.txt\n')
  })

  it('connects commands with pipes and writes with redirects', async () => {
    expect(await sh('cat notes.txt | grep beta | wc -l')).toBe('2\n')
    await sh('echo hello > out.txt && echo again >> out.txt')
    expect(await sh('cat out.txt')).toBe('hello\nagain\n')
    expect(await sh('sort -r < notes.txt | head -n 1')).toBe('gamma\n')
  })

  it('keeps the folder between calls', async () => {
    await sh('mkdir -p work/sub && cd work')
    expect((await runShell(py, 'pwd')).output.trim()).toBe('/home/user/work')
    await sh('cd')
    expect(await sh('find . -type d -name sub')).toBe('./work/sub\n')
  })

  it('says what went wrong and sets the exit code', async () => {
    const missing = await runShell(py, 'cat nope.txt')
    expect(missing.output).toBe('cat: nope.txt: No such file or directory\n')
    expect(missing.code).toBe(1)
    expect((await runShell(py, 'frobnicate')).output).toContain('command not found')
    expect((await runShell(py, 'grep zzz notes.txt')).code).toBe(1)
    expect((await runShell(py, 'cat nope.txt || echo fallback')).output).toContain('fallback')
  })

  it('tells the agent to use scrape when a download is blocked', async () => {
    const out = await sh('curl -o x.bin https://example.invalid/x.bin')
    expect(out).toContain('CORS')
    expect(out).toContain('scrape')
  })

  it('refuses links to this machine', async () => {
    expect(await sh('curl https://localhost/a.pdf')).toContain('only public web links')
    expect(await sh('curl http://example.com/a.pdf')).toContain('only https://')
  })

  it('cuts very long output and says so', async () => {
    const out = await sh('python -c "print(\'x\' * 100000)"')
    expect(out.length).toBeLessThan(31_000)
    expect(out).toContain('characters left out')
  })

  it('validates LaTeX source and reports malformed environments', async () => {
    writeTextFile(py, 'equation.tex', '\\documentclass{article}\n\\begin{document}\n$x^2$\n\\end{document}\n')
    expect(await sh('latex --check equation.tex')).toContain('source looks balanced')
    writeTextFile(py, 'broken.tex', '\\begin{document}\nmissing end\n')
    const result = await runShell(py, 'tex --check broken.tex')
    expect(result.output).toContain('environments do not match')
    expect(result.code).toBe(1)
  })
})

describe('PDFs', () => {
  it('reports the page count', async () => {
    expect(await sh('pdfinfo guide.pdf')).toContain('Pages: 3')
  })

  it('extracts pages in order, marked, and a range of them', async () => {
    const all = await sh('pdftotext guide.pdf')
    expect(all.indexOf('--- Page 1 ---')).toBeLessThan(all.indexOf('--- Page 3 ---'))
    expect(all).toContain('Brushes and masks')
    const some = await sh('pdftotext -f 2 -l 2 guide.pdf')
    expect(some).toContain('Brushes and masks')
    expect(some).not.toContain('Layers')
  })

  it('searches the text of a PDF through a pipe', async () => {
    expect(await sh('pdftotext guide.pdf | grep -i export')).toBe('Exporting files\n')
  })

  it('writes to a file when given one', async () => {
    expect(await sh('pdftotext guide.pdf guide.txt')).toContain('Wrote pages 1-3 of 3')
    expect(await sh('head -n 1 guide.txt')).toBe('--- Page 1 ---\n')
  })

  it('saves the pictures in a scanned page so the model can look at them', async () => {
    // Pillow writes a one-page PDF that holds a single big picture, like a scan.
    await sh("python -c \"from PIL import Image; Image.new('RGB', (800, 1000), 'red').save('scan.pdf')\"")
    const out = await sh('pdfimages -s 300 scan.pdf pages/p')
    expect(out).toContain('page 1: pages/p-1-1.jpg (240x300)')
    // JPEG signature
    expect(Array.from(readFile(py, 'pages/p-1-1.jpg').slice(0, 3))).toEqual([0xff, 0xd8, 0xff])
  }, 120_000)

  it('says a page with only text has no pictures, and what to do instead', async () => {
    expect(await sh('pdfimages -f 1 -l 1 guide.pdf g')).toContain('no pictures (text or drawings only: read it with pdftotext)')
    expect(await sh('pdfimages guide.pdf')).toContain('usage: pdfimages')
    expect(await sh('pdfimages notes.txt x')).toContain('not a readable PDF')
  }, 120_000)

  it('says plainly when the file is not a PDF', async () => {
    expect(await sh('pdftotext notes.txt')).toContain('not a readable PDF')
  })
})

describe('python scripts', () => {
  const run = async (script: string, args = '') => {
    writeTextFile(py, 'work/job.py', script)
    return runShell(py, `python work/job.py ${args}`)
  }

  it('runs a saved script with arguments and reads the files it needs', async () => {
    const result = await run('import sys\nprint(len(open("notes.txt").read().split()), sys.argv[1])', 'hello')
    expect(result.output).toBe('5 hello\n')
    expect(result.code).toBe(0)
  })

  it('writes files that the shell can then read', async () => {
    await run('open("py.txt", "w").write("from python")')
    expect(await sh('cat py.txt')).toBe('from python')
  })

  it('imports a helper module saved next to the script', async () => {
    writeTextFile(py, 'work/helper.py', 'def double(n):\n    return n * 2\n')
    expect((await run('from helper import double\nprint(double(21))')).output).toBe('42\n')
  })

  it('returns the error line and a failing exit code', async () => {
    const result = await run('print("before")\n1 / 0')
    expect(result.output).toContain('before')
    expect(result.output).toContain('ZeroDivisionError')
    expect(result.code).toBe(1)
  })

  it('honours sys.exit', async () => {
    expect((await run('import sys\nsys.exit(3)')).code).toBe(1)
    expect((await run('import sys\nprint("fine")\nsys.exit(0)')).code).toBe(0)
  })

  it('runs one-liners and bundled packages', async () => {
    expect(await sh('python -c "print(6 * 7)"')).toBe('42\n')
    expect((await run('import numpy as np\nprint(int(np.arange(4).sum()))')).output).toBe('6\n')
  })

  it('appends to a file and makes its folders', () => {
    writeTextFile(py, 'deep/er/log.txt', 'a')
    writeTextFile(py, 'deep/er/log.txt', 'b', true)
    expect(new TextDecoder().decode(readFile(py, 'deep/er/log.txt'))).toBe('ab')
  })
})

describe('reply text', () => {
  it('shows the output and a failed exit code', () => {
    expect(formatExec({ output: 'a\n', code: 0, cwd: '/' })).toBe('a')
    expect(formatExec({ output: 'oops\n', code: 1, cwd: '/' })).toBe('oops\n[exit code 1]')
    expect(formatExec({ output: '', code: 0, cwd: '/' })).toBe('(no output)')
  })
})

describe('paste markdown', () => {
  it('joins broken lines, keeps sentences apart and escapes list-like starts', () => {
    expect(reflowMarkdown('First line\nof one sentence.\nNext sentence here.\n\n- not a list')).toBe(
      'First line of one sentence.\n\nNext sentence here.\n\n\\- not a list',
    )
  })

  it('turns page markers into headings', () => {
    expect(reflowMarkdown('--- Page 1 ---\nOne\n\n--- Page 2 ---\nTwo')).toBe('### Page 1\n\nOne\n\n### Page 2\n\nTwo')
  })
})

describe('scrape', () => {
  const page = { markdown: 'x'.repeat(70_000), title: 'Chapter 1', status: 200 }

  it('returns a piece with where to continue, and the rest by offset', () => {
    const first = formatScrape('https://a.com/c1.pdf', page, 0)
    expect(first).toContain('Chapter 1\nhttps://a.com/c1.pdf')
    expect(first).toContain('Showing characters 0–30000 of 70000')
    expect(first).toContain('offset 30000')
    expect(formatScrape('https://a.com/c1.pdf', page, 60_000)).not.toContain('Showing characters 0')
  })

  it('points at the saved file instead of asking for offsets', () => {
    const text = formatScrape('https://a.com/c1.pdf', page, 0, 'c1.md')
    expect(text).toContain('saved as c1.md in the sandbox')
    expect(text).not.toContain('call scrape again')
  })

  it('says plainly when a page has no text', () => {
    expect(formatScrape('https://a.com/', { markdown: '' }, 0)).toContain('No text could be read')
  })

  it('posts the link to Firecrawl directly and reads the markdown', async () => {
    const original = globalThis.fetch
    let sent: { url: string; body: unknown } | null = null
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent = { url: String(input), body: JSON.parse(String(init?.body)) }
      return new Response(JSON.stringify({ success: true, data: { markdown: '# Hi', metadata: { title: 'T', statusCode: 200 } } }))
    }) as typeof fetch
    try {
      expect(await scrapePage('https://a.com/x')).toEqual({ markdown: '# Hi', title: 'T', status: 200 })
      expect(sent).toEqual({
        url: 'https://api.firecrawl.dev/v2/scrape',
        body: { url: 'https://a.com/x', formats: ['markdown'], onlyMainContent: true },
      })
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ success: false, error: 'Rate limited' }), { status: 429 })) as typeof fetch
      await expect(scrapePage('https://a.com/x')).rejects.toThrow('Rate limited')
    } finally {
      globalThis.fetch = original
    }
  })
})
