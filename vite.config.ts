import { createReadStream, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { URL, fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

// Cloudflare Pages rejects files over 25 MiB, and the onnxruntime wasm (pulled in by transformers.js) is bigger.
// It is loaded from a CDN at runtime instead (see matting.ts), so keep it out of the build output.
const dropOversizedWasm = (): Plugin => ({
  name: 'drop-oversized-wasm',
  generateBundle(_, bundle) {
    for (const name of Object.keys(bundle)) {
      if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name]
    }
  },
})

const excalidrawAssets = (): Plugin => {
  const root = fileURLToPath(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url))
  const files = new Map<string, string>()
  const collect = (directory: string, prefix = 'fonts') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = `${prefix}/${entry.name}`
      if (entry.isDirectory()) collect(join(directory, entry.name), name)
      else files.set(name, join(directory, entry.name))
    }
  }
  collect(root)
  return {
    name: 'excalidraw-local-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const prefix = `${server.config.base}excalidraw-assets/`
        const path = request.url?.split('?')[0]
        if (!path?.startsWith(prefix)) return next()
        const file = files.get(path.slice(prefix.length))
        if (!file) {
          response.statusCode = 404
          response.end()
          return
        }
        response.setHeader('Content-Type', file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream')
        createReadStream(file).on('error', next).pipe(response)
      })
    },
    generateBundle() {
      for (const [name, path] of files) this.emitFile({ type: 'asset', fileName: `excalidraw-assets/${name}`, source: readFileSync(path) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), svgr(), dropOversizedWasm(), excalidrawAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // The WebMCP block tools load lazily. Pre-bundling their dependencies stops Vite from discovering them on first
  // use, re-bundling under a new hash and breaking the open page's dynamic import ("Failed to fetch dynamically imported module").
  optimizeDeps: {
    include: ['@tiptap/react', '@tiptap/pm/model', '@tiptap/pm/state', 'marked', 'zod'],
    // PGlite loads its own wasm and data files next to its script, which pre-bundling would move.
    exclude: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  },
  // The shared PGlite worker is an ES module; the default iife format fails in a production build.
  worker: {
    format: 'es',
  },
  server: {
    allowedHosts: ['port.3001.vm.wpsadi.dev'],
  },
})
