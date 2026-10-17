# SDraw

Open **SDraw** (paintbrush) from Home or the app sidebar, or visit `/s-draw`.

The canvas is the unmodified `@excalidraw/excalidraw` component: native tools, shortcuts, properties, library, import/export, images, and undo/redo. Sheet controls sit beside its top-right controls. Scenes, embedded images, canvas preferences and the shared library persist in the shared client-side PGlite database. Fonts ship with the application rather than loading from the Excalidraw CDN. The editor follows Settings → Appearance, including System mode and live theme changes. Agent requests to change the theme update the shared application preference.

Sensei floats at the bottom right. Select drawing elements to focus local requests; its context includes an overview of every sheet and prioritizes selected elements and bound labels. The terminal has its own icon and floating window, independent of chat visibility. Both use a sandbox session scoped to the drawing file. Drag the terminal header to move it; its launcher is inside the chat header before “+”. Closing chat keeps a reply running; leaving SDraw or switching files cancels it.

Each file has a stable URL such as `/s-draw?fileId=<file-id>&chatId=<chat-id>`. The widget restores that conversation on reload and shows only chats belonging to that file. Starting a new conversation removes `chatId` while retaining `fileId`; opening Settings preserves both references. Opening `/s-draw` resumes the last file. Existing IndexedDB drawings and chats migrate into PGlite automatically, with legacy chats linked to the migrated file. Drawing and chat records participate in vault encryption and backups.

Use **Name sheet with Gemini** (sparkles beside Rename) to name the current sheet from its contents. Default sheet names are also named automatically after a drawing request completes. This uses the Gemini key in Settings; manual names are preserved, including renames made while a response is pending. Generated names persist with their file in PGlite.

## Default drawing skills

SDraw bundles `/sdraw-cli` as its only default drawing skill. Type `/` in chat to select it; there is no Skills button. It covers terminal commands, native labels and arrow bindings, bounded inspection of large scenes, and PNG review. It works without installation and coexists with skills installed in Settings. Explicit commands work in new requests, queued messages, and steering inputs.

## Agent access

Drawing tools register on `document.modelContext` through `use-webmcp-tool`. Sensei draws through the bundled terminal CLI, which discovers and executes these operations through the native browser consumer or Chrome's WebMCP testing API. Direct `sdraw_` tools are not included in the chat model’s tool list. It has no direct drawing-handler fallback. Use a browser exposing WebMCP; for Chrome builds requiring it, enable `chrome://flags/#enable-webmcp-testing` and restart. Configure the chat provider key in Sensei Settings.

Initial context and paginated element reads include bound box/arrow labels, text ownership, and each connector’s native start/end bindings, canvas endpoints and arrowheads. Reversed and bidirectional arrows retain their actual heads rather than assuming point order means flow direction. Unbound or dangling endpoints are explicit; the agent verifies ambiguous visual relationships with a capture instead of inferring connections from proximity or crossings. Searching label text also finds its owning box. `sdraw_check_layout` reports text outside containers, unbound text over shapes, connectors through content, and overlapping/crossing connectors in bounded pages. The agent builds native labels with nodes first, reads their resulting sizes, then routes connectors in separate lanes and checks/captures the result. Geometry checks are advisory, skip rotated elements, and approximate curves; intentional overlaps are reviewed rather than automatically changed. Before reporting completion, the agent must run `sdraw view` and open the returned PNG using `view_image` and repair/recheck defects it sees. Captures use the current theme and background; choose `scope: "all"`, `"selection"`, or `"elements"` with element IDs for a close-up including bound labels without changing the human selection. `maxSize` controls the longest image edge (800–2400 px; default 1600).

Element creation, updates and deletion name their target sheet and check the inspected scene revision. Fresh inspection is required after concurrent human changes. Reads are paginated; complete long text and native properties can be read in JSON chunks. The bundled `sdraw-cli` skill covers large files and selected regions; the obsolete separate guide tool has been removed. Drawing text is treated as untrusted content.

## Validation

- `npx vitest run src/features/s-draw`: persistence, context, registered tools, revision conflicts, agent streaming, independent windows, and actual native Excalidraw scene/image operations.
- `npm run build`: TypeScript and production assets, including local fonts.
- `npx oxlint src/features/s-draw src/pages/s-draw.page.tsx`: feature lint.
- `src/features/s-draw/webmcp/schema.json` and `evals.json`: tool-selection fixtures. Optional provider-backed evaluation: `npx webmcp-evals local -t src/features/s-draw/webmcp/schema.json -e src/features/s-draw/webmcp/evals.json`.

For browser verification, open SDraw, draw with native tools, add another sheet and an image, reload, and check both scenes and the library. Open/close chat and terminal independently. Select a region, ask Sensei to edit it, and verify unrelated content remains intact. In Chrome DevTools Application > WebMCP, inspect and execute `sdraw_get_document`, inspect a selected page with `sdraw_read_elements`, and create a shape using the reported sheet ID/revision. Confirm the change is visible and native Undo restores it. Run Lighthouse's Agentic browsing audit where available.

See [SDraw terminal CLI](sdraw-cli.md) for commands, image previews, bundled source provenance and desktop limitations.
