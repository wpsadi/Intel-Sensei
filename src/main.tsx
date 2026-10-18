import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { getDb } from './db/client'

// The database is the slowest thing to start (a Postgres in WebAssembly, opened from IndexedDB), and the lock screen waits
// for it. Starting it here lets it boot while the rest of the page downloads and React mounts, not after.
void getDb().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
