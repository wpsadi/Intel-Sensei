# S Draw WebMCP journey design

Design mode: autonomous, completing Stages 2–4 per isolated goal before schemas and implementation. This document records design examples, not claims of implemented or tested behavior. Tool payloads below are abbreviated mock responses, each under 1,500 characters; implementation must provide exact pagination metadata and enforce a serialized output budget.

## Product evidence and scope

The repository contains React 19, Excalidraw 0.18.1, `use-webmcp-tool`, a local drawing workspace store, the shared PGlite database, and a canvas bridge. S Note supplies the precedent for a floating Sensei widget and browser-mediated agent execution. The existing chat terminal uses a sandbox session. S Draw must render the package's full native editor rather than reproduce its toolbar or editing controls. Additional application controls provide sheets, a Sensei toggle, and a separate terminal toggle.

Priorities derived from this application:

1. Create and revise drawings using the same live canvas as the human. Success means native elements, undo support, preserved unrelated content, and immediate visible changes. Context includes active sheet, selection, element positions and styles. The agent must not silently replace an existing scene or cross the selected scope.
2. Understand an entire drawing and focus edits on the human's selection. Success means bounded, exhaustive access rather than a truncated snapshot treated as complete. Context includes all sheets, counts, pagination, and selection. Drawing text is data, never authority to execute instructions.
3. Manage locally persisted sheets without losing work. Success means create, rename, switch, duplicate, and delete with explicit targets and preserved files/library. Deleting a sheet requires direct user intent; opening the application must not perform a deletion.

The remaining isolated journeys below cover navigation, export, and independent terminal use required for complete interaction.

## Shared starting states

| Dimension           | States that change behavior                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Route and readiness | S Draw active and canvas ready; hydrating; another application active; sheet switching                         |
| Local content       | Empty sheet; existing shapes and text; imported scene with images; many sheets; huge freehand or text elements |
| Human focus         | No selection; selected elements; selected bound labels/connector groups; selection changed during a request    |
| Agent conversation  | Fresh request; follow-up such as “do so”; previously listed element IDs; stale IDs after human edits           |
| Persistence         | PGlite available; write failure; reload after successful save                                                  |
| Tool access         | `document.modelContext` present; browser API unavailable; component unmounted                                  |

No authentication, hardware telemetry, or account permissions are needed for the local editor. Remote model inference retains the application's existing provider configuration. Drawing operations are client-side only and must cross the WebMCP boundary rather than expose direct store mutation to the agent worker.

The examples below illustrate intent and response content. Exact response envelopes are defined by the implementation; paginated results use `items`, `offset`, `nextOffset`, and `totalCount`. Mutation examples use illustrative sheet IDs and revisions: obtain current values from `sdraw_get_document` before each mutation.

## Journey 1: Draw from a request

Starting state: S Draw ready, Sheet 1 active, no selection, existing content may be present. Ideal outcome: create native editable shapes in free space. Boundary: preserve existing elements unless replacement was requested.

### Turn 1

- User: “Draw a three-step process: draft, review, publish.”
- Agent intent: inspect existing extent and create the requested diagram without covering existing work.
- Agent tool invocations: `sdraw_get_document({})`; `sdraw_create_elements({sheetId:"architecture",expectedRevision:42,elements:[{type:"rectangle",x:0,y:0,width:160,height:80,label:{text:"Draft"}},{type:"rectangle",x:240,y:0,width:160,height:80,label:{text:"Review"}},{type:"rectangle",x:480,y:0,width:160,height:80,label:{text:"Publish"}}]})`. Positions are illustrative; actual placement uses inspected bounds. Connected arrow skeletons follow within the same atomic creation operation when supported.
- Tool response: `{"status":"created","ids":["draft","review","publish","arrow1","arrow2"],"count":5}`.
- Site implementation and UI reaction: validate all skeletons first; normalize using Excalidraw's public helpers; commit once with native history capture; persist; await canvas update. Native shapes and bound labels appear and remain manually editable.
- Agent response: “Added the three-step process.”

### Turn 2

- User: “Make the second one green.”
- Agent intent: resolve “second” to the Review element from this conversation, not the second element in arbitrary scene order.
- Agent tool invocations: `sdraw_update_elements({sheetId:"architecture",expectedRevision:42,updates:[{id:"review",patch:{backgroundColor:"#b2f2bb"}}]})`.
- Tool response: `{"status":"updated","ids":["review"],"count":1}`.
- Site implementation and UI reaction: update through native element mutation/version handling and capture history; the Review shape changes color.
- Agent response: “Made Review green.”

Variations: missing diagram subject requires a short clarification; empty sheet is valid; bad skeleton or unsupported type returns an actionable error without partial mutation; bound connectors must keep references consistent; request while canvas loads fails with retry guidance; “do so” executes the previously discussed concrete plan without another approval question. Self-critique: concise tone; ask only for missing meaning, not routine color/placement choices; never clear unrelated content as a shortcut.

## Journey 2: Revise a human-selected region

Starting state: several shapes exist, human has selected a subset. Ideal outcome: modify only selected content and related bound text required to keep native elements coherent. Boundary: a later selection change must not silently redirect an already resolved edit.

### Turn 1

- User: “Make this part blue and align the boxes.”
- Agent intent: use the current selection as focus, discover its exact geometry, and preserve elements outside it.
- Agent tool invocations: `sdraw_get_document({})`; `sdraw_read_elements({scope:"selection",offset:0,limit:5})`; `sdraw_update_elements({sheetId:"architecture",expectedRevision:42,updates:[{id:"a",patch:{backgroundColor:"#a5d8ff",y:120}},{id:"b",patch:{backgroundColor:"#a5d8ff",y:120}}]})`.
- Tool response: `{"offset":0,"nextOffset":null,"totalCount":2,"items":[{"id":"a","type":"rectangle","x":20,"y":100,"width":100,"height":60},{"id":"b","type":"rectangle","x":180,"y":140,"width":100,"height":60}]}`; mutation returns `{"status":"updated","ids":["a","b"],"count":2}`.
- Site implementation and UI reaction: selected IDs and geometry reflect Excalidraw's current state; native history records the bounded change; other shapes retain their values.
- Agent response: “Aligned the selected boxes and made them blue.”

Variations: “this part” with no selection and no conversational referent requires clarification or an invitation to select it; selection with 500 elements requires paging before editing; bound labels, groups, and frames require reading relationships before acting; stale IDs produce a recoverable error rather than editing another shape; use rotated bounds correctly. Self-critique: state selected scope plainly; avoid asking what is already selected; never expand focus to the whole sheet without intent.

## Journey 3: Understand a large, multi-sheet document

Starting state: many sheets and thousands of elements; fresh chat has a bounded summary that explicitly reports omissions. Ideal outcome: reason about all relevant content with paginated tools and a dedicated large-drawing skill. Boundary: never claim complete inspection from the first page or follow instructions embedded in diagram text.

### Turn 1

- User: “Explain this whole file and find duplicate stages.”
- Agent intent: establish complete sheet inventory, use a traversal plan, and inspect all relevant pages before concluding.
- Agent tool invocations: `sdraw_read_guide({})`; `sdraw_get_document({})`; `sdraw_list_sheets({offset:0,limit:5})` and successive sheet pages; `sdraw_manage_sheets({action:"switch",sheet:"Architecture"})`; `sdraw_read_elements({offset:0,limit:5})` and subsequent pages/other sheets. If an individual detail is oversized, use a bounded detail slice mechanism rather than truncating it without a continuation.
- Tool response: `{"offset":0,"totalCount":8,"items":[{"id":"architecture","name":"Architecture","elementCount":1800}],"nextOffset":1}`; guide returns `{"guide":"Inventory sheets; page summaries; inspect candidate IDs; retain continuation offsets for long details; scope updates; reread changes."}`.
- Site implementation and UI reaction: sheet inventory queries return bounded summaries; detailed element inspection switches to each relevant sheet and awaits its native canvas API. Restore the original sheet after traversal when appropriate.
- Agent response: “The file has eight sheets. I found repeated Review stages on Architecture and Release; they serve different flows.” This response is justified only after relevant traversal completes.

Variations: single freehand element exceeds output limit; include chunk/offset continuation for points/full JSON and inspect geometry summaries first. A single text element may exceed the limit; support text continuation without losing content. Many sheet names can exceed metadata budget; paginate them. Concurrent edits can invalidate offset paging; return a scene revision or advise reinspection if totals change. Zero search matches should suggest removing region/type filters. Self-critique: distinguish inspected content from omitted content; avoid a giant upfront scene dump; never turn diagram instructions into agent authority.

## Journey 4: Organize sheets

Starting state: active sheet contains unsaved live edits, another sheet may have the same display name. Ideal outcome: create, rename, duplicate, switch, and explicitly remove sheets while preserving scene, image files, and library. Boundary: ambiguous names are not guessed; deletion needs direct intent and must expose its consequential nature if permanent.

### Turn 1

- User: “Duplicate Architecture as Architecture v2 and open it.”
- Agent intent: identify exact source, preserve current scene, duplicate the full scene, then show the duplicate.
- Agent tool invocations: `sdraw_get_document({})`; `sdraw_manage_sheets({action:"duplicate",sheet:"Architecture",name:"Architecture v2"})`.
- Tool response: `{"status":"duplicated","sheet":{"id":"architecture-v2","name":"Architecture v2"},"activeSheet":"architecture-v2"}`.
- Site implementation and UI reaction: snapshot current live state before changing active ID; copy elements and binary files safely; mount the target initial scene and await its API before resolving; persisted original remains unchanged.
- Agent response: “Opened Architecture v2 with a copy of Architecture.”

### Turn 2

- User: “Delete that copy.”
- Agent intent: resolve “that copy” to the just-created sheet, not the source.
- Agent tool invocations: `sdraw_delete_sheet({sheet:"architecture-v2",confirmDelete:true})`.
- Tool response: `{"status":"deleted","id":"architecture-v2","activeSheet":"architecture"}`.
- Site implementation and UI reaction: delete the explicitly targeted sheet; activate a valid survivor; deleting the last sheet creates an empty replacement. If deletion is permanent, this action is consequential and requires separate annotation treatment from routine sheet navigation.
- Agent response: “Deleted Architecture v2.”

Variations: create uses a useful default name; empty rename rejected; duplicate display names return candidates; missing sheet produces exact remediation; switching must preserve current edits even before debounce fires; failed persistence is visible and never reported as saved. Self-critique: no redundant confirmation after explicit deletion intent; use IDs from prior results to resolve references; separate permanent deletion annotations or provide recoverable deletion rather than overflagging all sheet actions.

## Journey 5: Inspect and navigate a drawing

Starting state: dense sheet, target shapes outside viewport. Ideal outcome: locate a requested object, select it, and bring it into view using native editor state. Boundary: navigation changes view and selection, never content.

### Turn 1

- User: “Show me the Review stage and use dark mode.”
- Agent intent: find Review text and its bound shape, select the appropriate target, then change view.
- Agent tool invocations: `sdraw_read_elements({query:"Review",offset:0,limit:5})`; `sdraw_select_elements({ids:["review"],fit:true})`; `sdraw_set_view({theme:"dark"})`.
- Tool response: `{"offset":0,"nextOffset":null,"totalCount":1,"items":[{"id":"review","type":"rectangle","label":"Review"}]}`; `{"status":"selected","ids":["review"]}`; `{"status":"updated","theme":"dark"}`.
- Site implementation and UI reaction: native selected IDs update; scroll centers the shape; editor theme changes; tool resolves after visual state is current.
- Agent response: “Selected Review and switched to dark mode.”

Variations: multiple Review stages require distinguishing sheets or regions; missing target returns nearby candidates or guidance; clearing selection is supported; zoom must be finite and within native limits; requested scroll/background remain view changes, not read-only queries. Self-critique: ask only for true target ambiguity; do not treat navigation as content editing or consequential.

## Journey 6: Remove requested elements

Starting state: multiple native elements, selected obsolete branch. Ideal outcome: remove only intended elements with native undo and consistent bound references. Boundary: preserve surrounding diagram and maintain focus rules.

### Turn 1

- User: “Remove this obsolete branch.”
- Agent intent: inspect selected elements and bound connectors to identify the intended deletion set.
- Agent tool invocations: `sdraw_read_elements({scope:"selection",offset:0,limit:5})`; `sdraw_delete_elements({sheetId:"architecture",expectedRevision:42,ids:["old-box","old-label","old-arrow"]})`.
- Tool response: `{"status":"deleted","ids":["old-box","old-label","old-arrow"],"count":3}`.
- Site implementation and UI reaction: mark deletion through native element operations, repair or remove relevant relationships, commit one undoable scene change, and persist it.
- Agent response: “Removed the selected obsolete branch. You can undo it in Excalidraw.”

Variations: no selection and unclear branch requires clarification; unknown IDs reject before any mutation; deleting bound text must not leave an invalid container binding; large deletions execute in bounded intentional batches rather than return a massive ID list. Self-critique: direct request authorizes reversible removal; no added approval ceremony; permanent sheet deletion differs from native undoable element deletion.

## Journey 7: Export a drawing

Starting state: native Excalidraw scene with text and possibly images. Ideal outcome: user receives a normal downloadable file without flooding model context. Boundary: exporting must not upload or publish the scene.

### Turn 1

- User: “Export this sheet as an SVG.”
- Agent intent: export active sheet with native rendering and return a small acknowledgment.
- Agent tool invocations: `sdraw_export_scene({format:"svg"})`.
- Tool response: `{"status":"downloaded","format":"svg","name":"Architecture.svg"}`.
- Site implementation and UI reaction: public Excalidraw export helper produces the SVG locally; a download starts; binary data, SVG markup, and base64 files do not enter the tool response.
- Agent response: “Downloaded Architecture.svg.”

Variations: selected-only export uses the current selection only when requested; JSON export preserves files and app state for native reimport; missing image data or export failure is an actionable error, not success. Human native import/export menus remain available independently. Self-critique: no confirmation for requested local download; never claim a download exists before successful creation; unsupported formats are explicit errors.

## Journey 8: Independent floating terminal

Starting state: Sensei chat may be open or closed; terminal may be open or closed. Ideal outcome: terminal icon toggles a separate floating window using the same agent sandbox session. Boundary: no canvas mutation through terminal shortcuts; drawing changes use only WebMCP.

### Turn 1

- User: clicks terminal icon while chat is closed.
- Agent intent: none; direct human interface action.
- Agent tool invocations: none. No WebMCP tool is required to simulate the toggle.
- Tool response: not applicable; no tool result is fabricated.
- Site implementation and UI reaction: an independent terminal window opens over the canvas; chat stays closed; terminal can be closed completely without a collapsed/minimized intermediate state. Opening or closing chat must not open, close, or dock the terminal.
- Agent response: none required.

Variations: chat and terminal both open; window positioning on small screens; terminal remains useful before the first chat by obtaining a stable session; switching chat must not discard terminal execution history or create invisible session mismatch; no terminal draw backdoor. Self-critique: keep product interaction ordinary; avoid making human toggles an unnecessary agent capability; terminal needs an accessible name and explicit close control.

## Consolidation and verification obligations

The isolated journeys justify `sdraw_get_document`, `sdraw_list_sheets`, `sdraw_read_elements`, `sdraw_read_element_field`, `sdraw_add_files`, `sdraw_create_elements`, `sdraw_update_elements`, `sdraw_delete_elements`, `sdraw_select_elements`, `sdraw_manage_sheets`, `sdraw_delete_sheet`, `sdraw_capture_view`, `sdraw_set_view`, `sdraw_read_guide`, and `sdraw_export_scene`. All names fit the 30-character budget. Final schema names must match implementation exactly.

- Pure document/element reads declare `readOnlyHint: true`. Outputs with sheet names, text, or other user content declare `untrustedContentHint: true`, even when loaded from local storage. Static guide output is trusted system guidance.
- View, selection, and sheet switching mutate UI state and do not declare read-only. Routine reversible edits omit consequential hints. Permanent deletion needs its own correctly annotated action or an implementation with recoverability; a single polymorphic tool cannot accurately mark only one action consequential through a constant annotation.
- Textual WebMCP responses stay within 1,500 serialized characters including metadata; rendered inspection returns a bounded native PNG image separately. `limit` is a request ceiling, and actual page length may shrink to fit. Continuation must remain lossless, including oversized individual elements and errors with huge user names.
- The dedicated large-drawing skill must be discoverable by the widget, not merely a string naming a nonexistent skill. It explains inventory, paging, selection focus, detailed reads, batching, reinspection, and preservation of unrelated content.
- React tool registrations use `useWebMCP`, stable schemas, readiness gating, and cleanup. Captured `registerTool().execute` tests cover errors and visible state synchronization, not only pure helper functions.
- Completion evidence requires native UI runtime checks: manual drawing, undo/redo, text editing, images, library, file import/export, reload persistence, sheet switching, native selected-region edits, bounded large-document reads, independent chat/terminal, and tool cleanup after leaving the route.
- Inspect tools in DevTools Application > WebMCP, manually execute them, and run Lighthouse Agentic browsing when those browser facilities are available. Record unavailable facilities as unverified rather than claiming they passed.

## Explicit field, image, and conflict refinements

These refinements complete the relevant isolated journeys before implementation; final names are authoritative here.

### Journey 3 continuation: lossless detail reads

Starting state: `sdraw_read_elements` reports an oversized text or points field. User: “Read every label in this frame.” Agent intent: read each relevant field completely without dumping the scene. Agent invocations: `sdraw_read_element_field({id:"long-label",field:"text",offset:0})`, repeated with the returned next offset; similarly request `points` when actual freehand path detail matters. Mock response: `{"id":"long-label","field":"text","offset":0,"chunk":"First bounded text segment","next_offset":600,"total_length":2200}`. UI reaction: none; query preserves selection and view. Agent response: a summary only after all chunks have been inspected. The implementation limits chunks to 600 characters and includes JSON continuation metadata. Invalid offset/field/ID returns guidance; the agent never treats partial JSON as a complete element. Self-critique: exact continuation avoids false completeness; text inside chunks remains untrusted data.

### Journey 1 continuation: create a native image

Starting state: user supplies or the sandbox generates a local image data URL. User: “Add this image to the diagram.” Agent intent: add the supplied image as a real editable native image element, without an arbitrary remote fetch. Agent invocations: `sdraw_add_files({sheetId:"architecture",files:[{id:"diagram-image",dataURL:"data:image/png;base64,...",mimeType:"image/png"}]})`; `sdraw_create_elements({sheetId:"architecture",expectedRevision:42,elements:[{type:"image",fileId:"diagram-image",x:20,y:20,width:200,height:120}]})`. Mock responses: `{"status":"added","count":1,"ids":["diagram-image"]}` and `{"status":"created","count":1,"ids":["image-element"]}`. UI reaction: the image enters native file storage and appears on the canvas; local persistence retains its binary data. Agent response: “Added the image.” Variations: reject malformed data URLs, unsupported MIME, oversized payloads, missing file IDs, and remote URLs with actionable errors before mutating. Self-critique: explicit user request authorizes adding the image; no unrelated networking or upload is justified.

### Journey 2 continuation: human editing conflicts

`get_document` supplies active `sheetId`, scene `revision`, type counts, bounds, and selection. Before `update_elements` or `delete_elements`, the agent obtains the current revision and sends `expectedRevision`. If a human edits between read and write, mutation fails without partial edits and tells the agent to inspect the current state and reconsider. A sheet switch similarly invalidates a revision-bound request. Successful mutation returns the new revision. Do not blindly replay stale geometry after a conflict. Self-critique: the user can keep drawing while Sensei works; the agent must respect new human changes rather than overwrite them.

### Journey 7 continuation: native local formats

`sdraw_export_scene` accepts native `.excalidraw`, SVG, and PNG formats using native Excalidraw serialization/export helpers. User: “Download an editable copy.” Agent intent: preserve the scene's native editability. Invocation: `sdraw_export_scene({format:"excalidraw"})`. Mock response: `{"status":"downloaded","format":"excalidraw","name":"Architecture.excalidraw"}`. UI reaction: native editable scene downloads locally with binary files. Agent response: “Downloaded the editable drawing.” For PNG, image bytes are downloaded locally and never returned inline to the model. Export failures remain errors. Self-critique: choose native format for “editable”; ask only when the requested output purpose does not establish a format.
