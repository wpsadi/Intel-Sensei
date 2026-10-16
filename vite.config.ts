import { URL, fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), svgr(), dropOversizedWasm()],
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
