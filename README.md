# Sensei

Sensei is a browser-based workspace for notes, AI-assisted work, design, and 3D scenes. It runs as a React 19 + TypeScript application built with Vite. Your projects and settings are kept in the browser; AI and web features connect directly to the providers you configure.

## Services and apps

- **Ask Sensei** — AI chat with conversation history, file attachments, reusable skills, web search, page reading, and an in-browser Python workspace for working with files and data.
- **SNote** — a block-based notes workspace with pages, databases, views, media, and an AI writing/chat assistant.
- **S-Design** — a canvas for creating and editing visual designs with AI assistance.
- **S3D** — a workspace for 3D documents, scenes, imported files, and an AI scene assistant.
- **SBrowse** — a browser workspace with saved sessions and an AI agent that can view and operate the current page when you enable screen sharing/control.
- **AI usage** — a local record of model calls, with estimated prices from models.dev when pricing information is available.

The home screen links to each app and Settings. The apps share AI provider choices and can expose WebMCP tools to compatible in-browser agents while the relevant app is open.

## External providers and services

Configure provider keys in **Settings → AI providers**. Sensei calls the selected providers from your browser using your own credentials; model availability and charges depend on those providers and your selected models.

| Service              | What Sensei uses it for                                                         | Setup                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Google Gemini        | Chat, titles, embeddings and live voice; also speech-to-text and text-to-speech | Add a Gemini API key in Settings.                                                                            |
| Anthropic            | Chat and titles                                                                 | Add an Anthropic API key. An optional compatible base URL can point to a proxy or gateway.                   |
| OpenAI               | Chat and titles                                                                 | Add an OpenAI API key. An optional OpenAI-compatible base URL supports gateways such as Azure or OpenRouter. |
| Firecrawl            | Web search and extracting page or PDF text for AI tools                         | Works on a rate-limited keyless tier; add a Firecrawl key for higher limits.                                 |
| models.dev           | Model catalog and pricing used in AI model settings and AI usage                | Fetched by the app and cached in this browser; no account is configured in Sensei.                           |
| skills.sh and GitHub | Discovering public skills and downloading their instruction files               | Used from Settings → Skills or by the AI skills tools. No skills.sh account is required.                     |
| Pyodide CDN          | Loading the Python/WebAssembly runtime for the browser-based workspace          | Loaded on demand when a sandbox is first used.                                                               |

## Terminal capabilities and semantic lookup

Terminal agents expose `lookup_capability` for tasks they do not recognize. The `wiu` prefix is optional routing metadata for that lookup; it is removed before keyword or embedding search. Built-in entries cover LaTeX source validation, Python Excel workbooks, and Python PowerPoint workbooks. PowerPoint requests for LaTeX Beamer slides are routed to the LaTeX capability. Installed skills are searched semantically when a Gemini key is configured and fall back to keyword matching when it is not. Embeddings are created lazily and stored in the local PGlite `memory_vectors` table.

The terminal's `latex --check file.tex` command validates balanced braces and `\begin`/`\end` environments. To compile a PDF in this browser, run `latex --enable-swiftlatex` once and then `latex --swiftlatex file.tex`; the command writes `file.pdf` beside the source. `lookup_capability` accepts `wiu enable SwiftLaTeX` as a lookup query, but `wiu` is metadata rather than a shell command.

The browser compiler uses the official SwiftLaTeX PdfTeX WASM runtime shipped in `public/swiftlatex` (EPL-2.0 or GPL-2.0 with the Classpath Exception; see `NOTICE.md`). It fetches missing TeX packages from SwiftLaTeX's configured TeX Live endpoint as needed.

For pgvector, `<=>` returns cosine distance. Sensei reports cosine similarity as `1 - distance`, clamped to `[-1, 1]`: identical vectors score `1`, orthogonal vectors score about `0`, and opposite vectors score `-1`. Queries are ordered by ascending distance, and the database worker pages through matches so app scope filtering does not hide relevant results.

## Data and privacy

Sensei is client-side first. App records are stored locally in browser storage using PGlite in IndexedDB; files use browser Cache Storage, and preferences and API keys use localStorage. There is no application server or account service configured in this repository. Provider requests send the relevant prompts, files, or audio to the selected external service. Firecrawl receives URLs and search or scrape requests when those tools are used.

Settings can encrypt stored app data in this browser with a password. A password lock by itself does not encrypt data. Exports contain readable, unencrypted data even when storage encryption is enabled; API keys are excluded unless you opt in to exporting them. Keep backups somewhere safe.

## Development

Requirements: Node.js and npm (or Bun, with the included `bun.lock`).

```sh
npm install
npm run dev
```

Vite serves the app at `http://localhost:3001`.

Available commands:

```sh
npm run build        # TypeScript project build and production bundle
npm run lint         # Oxlint
npm test             # Vitest suite
npm run format:check # Check Oxfmt formatting
npm run preview      # Serve the production build locally
```

## Project layout

- `src/pages/` and `src/layouts/` — page-level composition and routing
- `src/features/` — domain features such as Ask Sensei, notes, settings, design, 3D, and vault/security
- `src/ai/` — model providers, inference, tools, memory, skills, and the browser sandbox
- `src/components/` — shared UI and feature components
- `src/db/` — local PGlite database and schema migrations
- `src/hooks/`, `src/lib/`, `src/types/`, and `src/constants/` — shared code and contracts
