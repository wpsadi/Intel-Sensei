import { URL, fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import tailwindcss from '@tailwindcss/vite'

// Cloudflare Pages rejects files over 25 MiB, and the onnxruntime wasm (pulled in by transformers.js) is bigger.
// It is loaded from a CDN at runtime instead (see matting.ts), so keep it out of the build output.
const dropOversizedWasm = (): Plugin => ( {
  name: 'drop-oversized-wasm',
  generateBundle( _, bundle ) {
    for ( const name of Object.keys( bundle ) ) {
      if ( /ort-wasm.*\.wasm$/.test( name ) ) delete bundle[name]
    }
  },
} )

// https://vite.dev/config/
export default defineConfig( {
  plugins: [
    react(),
    tailwindcss(),
    svgr(),
    dropOversizedWasm(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath( new URL( './src', import.meta.url ) ),
    },
  },
  // The WebMCP block tools load lazily. Pre-bundling their dependencies stops Vite from discovering them on first
  // use, re-bundling under a new hash and breaking the open page's dynamic import ("Failed to fetch dynamically imported module").
  optimizeDeps: {
    include: ['@tiptap/react', '@tiptap/pm/model', '@tiptap/pm/state', 'marked', 'zod'],
  },
  server: {
    allowedHosts: ['port.3001.vm.wpsadi.dev'],
  },
} )
