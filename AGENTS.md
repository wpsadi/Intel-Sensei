# Repository Guidelines

## Project Structure & Module Organization

This repository is a React 19 + TypeScript application built with Vite. Code lives under `src/`:

- `src/pages/` and `src/layouts/` define page-level composition.
- `src/features/` contains domain modules such as `ask-sensei`, `note`, `settings`, `s-3d`, and `vault`.
- `src/ai/` contains inference, memory, tools, skills, sandbox, and worker code.
- `src/components/` holds shared UI, assistant-ui, AI elements, and feature components; reusable primitives are in `src/components/ui/`.
- `src/hooks/`, `src/lib/`, `src/types/`, and `src/constants/` contain shared utilities and contracts.
- `src/assets/` contains static assets. Tests sit beside the code they exercise and use `*.test.ts` or `*.test.tsx` names.

Use the `@/*` alias for imports from `src` (for example, `@/features/note`). Keep domain behavior inside its feature module and move shared code into the appropriate shared directory.

## Build, Test, and Development Commands

Install dependencies with `npm install` (or `bun install` with `bun.lock`). Then use:

- `npm run dev` — start Vite on port 3001 with hot reload.
- `npm run build` — run TypeScript’s project build and create a production bundle.
- `npm test` — execute the Vitest suite once.
- `npm run lint` — run Oxlint.
- `npm run format:check` — verify Oxfmt formatting; `npm run format` applies it.
- `npm run preview` — serve the built bundle locally on port 3001.

Run relevant tests, lint, format check, and build before opening a pull request.

## Coding Style & Naming Conventions

Use TypeScript and four-space indentation consistent with existing files. Prefer functional React components, explicit boundary types, and path aliases over long relative imports. Name components and types in PascalCase, hooks with a `use` prefix, and utilities in camelCase. Keep filenames kebab-case where it matches the surrounding directory. Let Oxlint and Oxfmt define mechanical style; avoid disabling rules without a documented reason.

## Testing Guidelines

Vitest with Testing Library and `jsdom` is used for unit and component tests. Place tests beside implementation, name them `*.test.ts`/`*.test.tsx`, and cover behavior, edge cases, and regressions. Use focused runs while iterating (for example, `npx vitest run src/features/s-3d/commands.test.ts`), then run the full suite.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, lowercase subjects (for example, `fixed table` or `added terminal and viewer`). Follow that style and keep commits focused. Pull requests should explain the user-visible change, list validation commands, link issues when applicable, and include screenshots or recordings for UI changes. Call out configuration, migration, or security implications.
