# SDraw terminal CLI

SDraw includes `sdraw`, with `excalidraw` as an alias, in each drawing file’s terminal and the agent’s `terminal` tool. The `/sdraw-cli` skill is bundled by default and appears in the chat’s slash menu. No separate installation is needed.

```sh
sdraw help
sdraw status
sdraw schema create
sdraw create --request create.json
sdraw read --json '{"query":"API"}'
sdraw check
sdraw view --out preview.png
sdraw kit
```

Inspect the action schema and current sheet revision before creating request files. `--request` paths are relative to `/home/user`; alternatively use `--json` with a quoted JSON object. Commands run standalone: prepare JSON with ordinary shell/Python or `write_file`, then invoke the CLI. `sdraw call sdraw_TOOL` exposes other registered SDraw actions with the same options.

The chat agent receives the terminal and image viewer rather than a duplicate set of direct drawing tools. The adapter invokes the registered WebMCP drawing operations, preserving native labels, arrow bindings, revision checks, undo and PGlite persistence. It requires the drawing workspace and WebMCP consumer to be available. Commands are scoped to their drawing file, recorded in terminal history, and excluded from reset/reload replay to prevent duplicate edits. After a conflict or uncertain result, inspect the current scene before writing again.

`view` saves a theme-aware PNG and returns its exact sandbox path. The agent must open it with `view_image`, repair visible defects, and recapture after changes. Preview files are temporary and need recapturing after a terminal reset. `export` uses SDraw’s browser download operation rather than writing a sandbox file.

## Upstream kit and provenance

The complete unmodified [Obsidian Excalidraw CLI agent kit](https://github.com/zsviczian/obsidian-excalidraw-cli) is bundled at revision `11d020f28d2a0ddabd1559038ea2b978f47e667a` in `public/bundles/obsidian-excalidraw-cli-11d020f28d2a.zip`, with its original AGPL-3.0-only license and an added `SDRAW-PROVENANCE.json` record. Source, docs, examples and tests are available without a GitHub request in `/home/user/bundled/obsidian-excalidraw-cli`. `sdraw kit` loads the bundle and reports this location and the adapted skill path.

Upstream helpers require Node, filesystem access and desktop Obsidian. They do not execute in SDraw’s Pyodide browser terminal. The SDraw-native command adapter implements the discovery, revision-safe editing, read-back and image-review workflow through the browser’s drawing tools. The adapted skill explains this distinction and the supported command dialect.
