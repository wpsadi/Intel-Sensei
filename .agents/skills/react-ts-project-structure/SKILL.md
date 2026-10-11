---
name: react-ts-project-structure
description: Folder layout, file naming, and state-management conventions for React + TypeScript projects using TanStack Query and Zustand. Use when scaffolding a React/TS project, adding a feature, or deciding where a file, hook, store, or type should live.
---

# React + TypeScript Project Structure

Use this convention for React + TypeScript projects using TanStack Query and Zustand.

## Core Structure

```text
src/
├── assets/
├── components/
│   ├── ui/
│   └── common/
│
├── layouts/
│   ├── auth.layout.tsx
│   ├── main.layout.tsx
│   └── dashboard.layout.tsx
│
├── pages/
│   ├── home.page.tsx
│   ├── login.page.tsx
│   └── dashboard.page.tsx
│
├── features/
│   ├── auth/
│   ├── users/
│   └── dashboard/
│
├── hooks/
├── lib/
├── routes/
├── types/
│
├── app.tsx
├── main.tsx
└── index.css
```

## Feature Structure

When functionality is specific to one domain/feature, keep it inside that feature.

```text
features/
└── <feature>/
    ├── api/
    │   └── <feature>.api.ts
    ├── queries/
    │   └── <feature>.queries.ts
    ├── mutations/
    │   └── <feature>.mutations.ts
    ├── components/
    ├── hooks/
    ├── <feature>.store.ts
    ├── <feature>.types.ts
    ├── <feature>.utils.ts
    └── <feature>.constants.ts
```

## Responsibility Rules

- `api/` → raw API/HTTP functions.
- `queries/` → TanStack Query hooks and query configuration.
- `mutations/` → TanStack mutation hooks.
- `<feature>.store.ts` → Zustand client-side state.
- `components/` → components used only by that feature.
- `hooks/` → feature-specific React hooks.
- `<feature>.types.ts` → feature-specific TypeScript types.
- `<feature>.utils.ts` → feature-specific utility functions.
- `components/ui/` → reusable generic UI components.
- `components/common/` → reusable application-level components.
- `layouts/` → application layouts.
- `pages/` → route-level page components.
- `hooks/` (top-level) → shared hooks.
- `lib/` → shared infrastructure/configuration.
- `types/` → shared types.

## Server State vs Client State

Use **TanStack Query** for server state:

```text
API → TanStack Query → Components
```

Use **Zustand** for client/application state:

```text
User interaction → Zustand → Components
```

Do not duplicate server state in Zustand unless there is a specific reason.

## Naming Convention

Use lowercase dot-separated filenames:

```text
auth.layout.tsx
dashboard.page.tsx

user.api.ts
user.queries.ts
user.mutations.ts
user.store.ts
user.types.ts
user.utils.ts
```

## General Rule

Start simple. Only create `api/`, `queries/`, `mutations/`, `components/`, etc. inside a feature when that feature actually needs them.

Shared functionality belongs in the top-level directories; feature-specific functionality belongs inside `features/<feature>/`.
