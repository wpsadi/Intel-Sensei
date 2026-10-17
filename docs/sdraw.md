# SDraw

Open **SDraw** (paintbrush) from Home or the app sidebar, or visit `/s-draw`.

The canvas is the unmodified `@excalidraw/excalidraw` component: native tools, shortcuts, properties, library, import/export, images, and undo/redo. Sheet controls sit beside its top-right controls. Scenes, embedded images, canvas preferences and the shared library persist in the shared client-side PGlite database. Fonts ship with the application rather than loading from the Excalidraw CDN. The editor follows Settings → Appearance, including System mode and live theme changes. Agent requests to change the theme update the shared application preference.

Sensei floats at the bottom right. Select drawing elements to focus local requests; its context includes an overview of every sheet and prioritizes selected elements and bound labels. The terminal has its own icon and floating window, independent of chat visibility. Both use a sandbox session scoped to the drawing file. Drag the terminal header to move it; its launcher is inside the chat header before “+”. Closing chat keeps a reply running; leaving SDraw or switching files cancels it.

Each file has a stable URL such as `/s-draw?fileId=<file-id>&chatId=<chat-id>`. The widget restores that conversation on reload and shows only chats belonging to that file. Starting a new conversation removes `chatId` while retaining `fileId`; opening Settings preserves both references. Opening `/s-draw` resumes the last file. Existing IndexedDB drawings and chats migrate into PGlite automatically, with legacy chats linked to the migrated file. Drawing and chat records participate in vault encryption and backups.

Use **Name sheet with Gemini** (sparkles beside Rename) to name the current sheet from its contents. Default sheet names are also named automatically after a drawing request completes. This uses the Gemini key in Settings; manual names are preserved, including renames made while a response is pending. Generated names persist with their file in PGlite.

## Agent access

Drawing tools register on `document.modelContext` through `use-webmcp-tool`. Sensei discovers and executes those registered tools through the native browser consumer or Chrome's WebMCP testing API. It has no direct drawing-handler fallback. Use a browser exposing WebMCP; for Chrome builds requiring it, enable `chrome://flags/#enable-webmcp-testing` and restart. Configure the chat provider key in Sensei Settings.

Element creation, updates and deletion name their target sheet and check the inspected scene revision. Fresh inspection is required after concurrent human changes. Reads are paginated; complete long text and native properties can be read in JSON chunks. The bundled `sdraw-large-drawing` skill provides the workflow for large files and selected regions, and is also exposed through `sdraw_read_guide`. Drawing text is treated as untrusted content.

## Validation

- `npx vitest run src/features/s-draw`: persistence, context, registered tools, revision conflicts, agent streaming, independent windows, and actual native Excalidraw scene/image operations.
- `npm run build`: TypeScript and production assets, including local fonts.
- `npx oxlint src/features/s-draw src/pages/s-draw.page.tsx`: feature lint.
- `src/features/s-draw/webmcp/schema.json` and `evals.json`: tool-selection fixtures. Optional provider-backed evaluation: `npx webmcp-evals local -t src/features/s-draw/webmcp/schema.json -e src/features/s-draw/webmcp/evals.json`.

For browser verification, open SDraw, draw with native tools, add another sheet and an image, reload, and check both scenes and the library. Open/close chat and terminal independently. Select a region, ask Sensei to edit it, and verify unrelated content remains intact. In Chrome DevTools Application > WebMCP, inspect and execute `sdraw_get_document`, inspect a selected page with `sdraw_read_elements`, and create a shape using the reported sheet ID/revision. Confirm the change is visible and native Undo restores it. Run Lighthouse's Agentic browsing audit where available.
