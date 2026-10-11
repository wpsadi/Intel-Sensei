import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig( {
  plugins: [
    react(),
    tailwindcss(),
    svgr(),
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
