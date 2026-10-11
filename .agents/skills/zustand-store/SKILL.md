---
name: zustand-store
description: Conventions for Zustand client-state stores in this project, including the persist + immer store pattern, hydration gating, and how components should select from stores. Use when creating or editing a *.store.ts file, reading or writing client state, or persisting state to localStorage.
---

# Zustand Store Conventions

Zustand holds **client/application state only**. Server data belongs in TanStack Query (see the `react-ts-project-structure` skill). Store files follow the feature layout: `features/<feature>/<feature>.store.ts`, or `lib/` for app-wide stores.

## Store Pattern: persist + immer

Use the curried `create<T>()(...)` form so TypeScript infers middleware types correctly.

```ts
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";

interface IAuthStore {
  hydrated: boolean;
  setHydrated(): void;
}

export const useAuthStore = create<IAuthStore>()(
  persist(
    immer((set) => ({
      hydrated: false,
      setHydrated() {
        set({ hydrated: true });
      },
    })),
    {
      name: "auth",
      onRehydrateStorage() {
        return (state, error) => {
          if (!error) state?.setHydrated();
        };
      },
    }
  )
);
```

Conventions:
- Interfaces are prefixed with `I` (`IAuthStore`), matching the project's existing style.
- Actions are methods on the store object, defined alongside state. Components never call `set` directly.
- `immer` lets actions mutate drafts (`set((s) => { s.items.push(x); })`), but plain object `set({...})` is fine for simple updates.
- `persist` `name` is the localStorage key. Keep it unique per store.

## Hydration Gate

`persist` reads localStorage asynchronously relative to first render. Use the `hydrated` flag from `onRehydrateStorage` to avoid rendering or redirecting on stale defaults:

```tsx
const hydrated = useAuthStore((s) => s.hydrated);
if (!hydrated) return null; // or a spinner
```

Do this in route guards and any UI whose first render depends on persisted values.

## Persisting Only What Matters

By default `persist` saves the whole state, including `hydrated`. Use `partialize` to save only the fields that must survive reloads:

```ts
{
  name: "auth",
  partialize: (state) => ({ token: state.token }),
  onRehydrateStorage() { /* ... */ },
}
```

Do not persist server data here. Cache it in TanStack Query instead.

## Reading State in Components

- Select the smallest slice you need: `useAuthStore((s) => s.token)`. Do not subscribe to the whole store.
- Avoid `const { hydrated } = useAuthStore()`. It works, but it subscribes to the entire store and re-renders on any change. Use `const hydrated = useAuthStore((s) => s.hydrated);` instead.
- For several fields, return an object with `useShallow` from `zustand/react/shallow` to avoid unnecessary re-renders:

```ts
import { useShallow } from "zustand/react/shallow";

const { token, setHydrated } = useAuthStore(
  useShallow((s) => ({ token: s.token, setHydrated: s.setHydrated }))
);
```

- Read outside React (interceptors, query functions, utilities) with `useAuthStore.getState()`. Do not call hooks there.

## Rules

- Do not duplicate server state in Zustand. If it comes from an API, it belongs in a TanStack Query hook.
- Keep stores small and feature-scoped. Split a store when two features don't share state.
- Derive values with selectors rather than storing computed copies.
- Keep store files free of JSX and API calls. Call APIs from `api/` and mutations from `mutations/`, and update the store from those callbacks when needed.
