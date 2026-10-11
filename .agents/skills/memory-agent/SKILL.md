---
name: memory-agent
description: How to give an AI SDK agent long-term memory with a filesystem-style memory tool, core/archival/recall memory types, and prepareCall injection. Use when building or changing an agent's memory, a memory tool, or anything that saves facts, notes or past conversations for a model to use later. Source is the AI SDK cookbook "Build a Custom Memory Tool".
---

# Memory agent (AI SDK)

Memory means saving the right information at the right time, in the right place, and injecting it back into the conversation when it matters. Without it every conversation is the first one.

Source: https://ai-sdk.dev/cookbook/guides/custom-memory-tool. Memory types follow Letta's definitions (https://www.letta.com/blog/agent-memory).

## Storage primitive

Store memories as files in a hierarchy. Models know files and paths well, and a hierarchy groups memories by topic, time or type. "Filesystem" is an abstraction: the backing store can be a real sandboxed disk, an in-memory virtual filesystem, a shim over Postgres, or (in this browser app) IndexedDB through `idb`. What matters is a hierarchy plus an interface that can read, search and edit it.

## The interface: a memory tool

Give the model one tool and instructions for when and how to use it. Two routes:

- **Structured actions** (`view`, `create`, `update`, `search`). The model sends structured input and you run each action yourself. Safe by design, since only actions you built can run. Needs more upfront work. **Use this route in the browser.**
- **Bash-backed**. The model composes shell commands (`cat`, `grep`, `sed`, pipes). More powerful, but needs an approval layer against prompt injection: an AST-based command guard with an allowlist (for example `just-bash` `parse`), since the interpreter reads and writes real files. Only for server-side code.

Both routes share the same files, the same `prepareCall` injection and the same conversation logging.

## Memory types

| Type | What it holds | How it reaches the model |
| --- | --- | --- |
| **Core** | Short, stable facts: the user's name, preferences, where other memories live | Injected into the system prompt on every turn. No tool call needed |
| **Archival** | The model's notebook: detailed facts, summaries, timestamped notes | Read and written on demand through the memory tool |
| **Recall** | The conversations themselves, turn by turn | Searched through the memory tool to surface past discussions |

Cookbook layout: `.memory/core.md`, `.memory/notes.md`, `.memory/conversations.jsonl` (one JSON object per line, so it can be searched by keyword).

## Wiring

1. **Bootstrap** the store on startup: create it if missing and seed each part with starter content. Keep it local and private (add a directory store to `.gitignore`).
2. **Helpers**: read core memory (for the prompt) and append a conversation entry.
3. **Tool**: `tool({ description, inputSchema, execute })`. The description carries the rules:
   - If the prompt may depend on preferences, history, constraints or goals, search first, then reply. If it is self-contained or general knowledge, reply directly.
   - Keep searches short and focused (1-4 words).
   - Durable user facts go to core memory, details to notes.
   - Keep memory operations invisible in user-facing replies.
   - Return errors as text (`Memory action failed: ...`) so the model can recover.
4. **Agent**: `ToolLoopAgent` with `prepareCall` reading core memory fresh before every model call and putting it in `instructions`. If the model changes core memory mid-conversation, the next loop step already sees it.
5. **Run loop**: append the user message to conversation memory, run the agent, append the assistant reply.

```ts
const memoryAgent = new ToolLoopAgent({
  model,
  tools: { memory: memoryTool },
  prepareCall: async (settings) => ({
    ...settings,
    instructions: `Today's date is ${today}.\n\nCore memory:\n${await readCoreMemory()}\n\nYou can save and recall important information using the memory tool.`,
  }),
})
```

Typical flow: user says "Remember that my favorite editor is Neovim" -> the model calls `memory` to add a core fact -> replies "Got it" -> the next run's `prepareCall` shows the fact in the system prompt.

## Structured action input (Route A)

```ts
z.object({
  command: z.enum(['view', 'create', 'update', 'search']),
  path: z.string().optional(),     // required for view, create, update
  content: z.string().optional(),  // for create / update
  mode: z.enum(['append', 'overwrite']).optional(),
  query: z.string().optional(),    // for search
})
```

Resolve paths against a fixed allowlist of known memory files. Reject anything else.

## Bash command guard (Route B only)

Parse the command to an AST and walk every node (pipelines, subshells, loops, conditionals, functions, case items). Reject any command name not in the allowlist (`cat echo grep jq ls mkdir perl sed tail`). Do not use string matching or regex. A dynamically built command name yields no literal word, so it skips the check; that is acceptable only because `just-bash` is a JavaScript interpreter that cannot resolve it to a real binary.

## In this project

The browser version lives in `src/ai/memory/`, one folder per memory type. Storage is IndexedDB through `idb` (see the `idb` skill) in `db.ts`. Semantic search runs on an HNSW index inside a Web Worker (`vector/`). Embeddings come from the `EMBEDDINGS` class in `src/ai/inference/embeddings.ts`, the only place that calls the embedding model.

| Folder | Type | Scope | Reaches the model |
| --- | --- | --- | --- |
| `semantic/` | Facts and knowledge | Global | Pinned facts in every prompt, the rest through `search_facts` |
| `episodic/` | What happened: every chat turn, plus events the model records | Global | `search_events` |
| `procedural/` | How the user wants things done | Global | Latest ones in the prompt, the rest through `search_procedures` |
| `session/` | Notes for one chat | Hard-filtered by chat id: every call needs a chat id and the tool uses its bound chat id, never one the model gives | In that chat's prompt |
| `scratchpad/` | Working notes for one agent loop | Tied to chat id and message id, in memory only, disposed when the loop ends | In the prompt of each step, and through the `scratchpad` tool |

`prompt.ts` builds the memory block. Put it in `prepareStep`, not `prepareCall`: `prepareCall` runs once per call, so a fact or scratchpad note written in one step would not reach the next step.
