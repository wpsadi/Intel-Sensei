import type { AgentMode } from './modes'

/**
 * Short how-to guides the agent carries with it, loaded into its instructions by mode. They teach the order and
 * habits of using the tools (the tools' own descriptions say what each one does).
 */
const SKILLS: Record<string, string> = {
  'reading-tools': `Skill: look before you change.
- get_document lists the page's nodes; get_scene lists one 3D scene's objects with world-space bounds (worldMin/worldMax); list_pages lists pages.
- render_scene shows a picture of a scene (optionally at a time); render_views shows it from every side in one sheet; snapshot_view takes a labelled picture from any viewpoint and compares it with the previous one; render_timeline shows several moments of an animation in one sheet. Look at them to judge proportions, colour, framing and motion.
- Read first when the user says "this", "it" or "selected", and when editing existing work. Never rebuild what only needs a small edit.`,

  'building-tools': `Skill: build with the canvas tools.
- 3D: create_scene builds a whole scene in one call (nested groups, meshes, lights, models); add_objects / update_objects / delete_objects change it; set_scene changes background, ground, environment and camera; set_keyframes and animate_character add motion; add_character adds a person.
- Real scanned models: search_3d_models, then ask_user so the user picks from the pictures, then import_3d_model.
- 2D: create_screen for a whole screen, create_nodes / update_nodes / delete_nodes for pieces, create_page / set_page / select_nodes to move around.
- Output: capture_image for a still, record_video for a clip; both land on the canvas.
- One tool call should do a meaningful chunk of work. Do not repeat a call that already succeeded.`,

  'mesh-tools': `Skill: one connected mesh (join_meshes, fuse_objects, smooth_mesh, clean_mesh, export_mesh).
- Primitives built into groups are many separate shells. When the user wants ONE editable, continuous mesh (an animal, a character, an organic object, a printable part), finish with the mesh tools:
  1. Model the parts as closed shapes (sphere, capsule, cylinder, roundedBox, lathe, torus…), overlapping where they join (legs INTO the body, head INTO the neck) so they fuse.
  2. fuse_objects with the part ids (or a group id): union voxel-remeshes everything into one seamless surface; colours carry over, and later objects paint over earlier ones (list markings such as spots AFTER the body). Use resolution 64 first, 96-128 for fine detail; smooth 1-2 rounds joints.
  3. smooth_mesh to soften muscles and joints; clean_mesh to weld and drop bad triangles.
  4. render_views to check every side, then export_mesh (glb keeps colours; obj/stl for printing).
- join_meshes only merges parts into one mesh object without connecting them. fuse_objects with subtract cuts holes and shapes (a window out of a wall); intersect keeps the overlap.
- The originals are hidden, not deleted, so you can go back; pass removeOriginals to delete them. Open shapes (plane, circle, ring, wave) have no inside and cannot be fused.
- Also: subdivide_mesh, sculpt_mesh and paint_mesh refine and colour a mesh object (see the realism skill). Not available: editing single vertices/edges/faces, retopology and UV unwrapping.`,

  realism: `Skill: sharp, convincing renders (organic and hero objects).
- Form: fuse parts into one mesh, subdivide_mesh (1-2 levels) to remove faceting, then sculpt_mesh for anatomy (inflate muscle and cheeks, crease eyelids, nostrils and wrinkles, smooth joints). Keep eyes, horns, hooves, tail and other detail parts as SEPARATE objects with their own materials and fuse/place them last.
- Surface: give each part its own material (fur/skin, eyes glossy with clearcoat, horns/hooves roughness ~0.4 and a hide/pores pattern with a little bump, nose wet-looking). For a soft coat: sheen 0.3-0.6, specularIntensity 0.3-0.5, roughness 0.7-0.9, material pattern 'fur' or 'hide' with bump 0.1-0.25, and set_fur for short fur (length ~1% of body size).
- Colour: paint_mesh patches for markings (set coverage, scale, a seed; softness low for crisp edges), then a 'variation' op (amount 0.04-0.08) for natural imperfections, and brush strokes for details (muzzle, ear insides). Subdivide BEFORE painting so patch edges are crisp.
- Light: set_lighting three-point (or soft-studio / product) then tune with update_objects: light size controls shadow softness; shadowQuality 'high' for sharp contact shadows under feet and belly. set_scene: exposure, toneMapping ('neutral' keeps colours truer, 'aces' adds contrast), envIntensity/envRotation for the reflections, post {contrast, saturation, sharpen 0.2-0.4} for the final look.
- Camera: use snapshot_view / render_turntable with look {object, azimuth, elevation, zoom} to frame close-ups (head, hooves) and set_scene camera for the final shot; keep horns, hooves and tail inside the frame.
- Inspect: render_scene with width 1600-2400 and supersample 2 for fine detail, wireframe true to see faceting/topology, only [ids] to isolate a part, projection 'orthographic' for proportions, render_turntable to check every angle.
- Not available: depth of field, bloom, ambient occlusion, subsurface scattering, strand-based hair, denoising, per-vertex roughness painting. Say so if asked, and use the closest tools above.`,

  todos: `Skill: the to-do list (update_todos).
- For any task with more than two steps, call update_todos FIRST with the whole list, before building. If a plan exists in the conversation, its steps are the items (keep their wording).
- Keep exactly one item in_progress. After finishing an item, call update_todos again with it completed and the next one in_progress. Send the whole list each time.
- The LAST item is always verification: render the result, call verify_design, fix what it reports. Verification is part of the work, not an extra step after "done".
- Never say you are finished while any item is pending or in_progress. If an item turns out to be unnecessary, mark it completed with a note in its title; if new work appears, add items.
- Add items you discover instead of doing them silently.`,

  plan: `Skill: planning (write_plan).
- Research first with the read tools (get_document, get_scene, render_scene, search_3d_models) so the plan fits what already exists.
- If something that changes the plan is unknown (style, size, which variant), ask with ask_questions BEFORE writing the plan, then plan with the answers.
- write_plan takes a title, a short approach, and the steps. Each step is one concrete action with sizes, materials or tools, in build order, and the last step verifies (render + verify_design). These steps become the to-do list when the plan is built.
- write_plan ends your turn. After it, write one sentence telling the user they can build the plan. Do not build anything in plan mode.`,

  questions: `Skill: asking the user (ask_questions, ask_user).
- Ask only when the answer changes the result and you cannot sensibly choose: style direction, missing dimensions, which variant to keep. Do not ask what you can decide or what the user already said.
- ask_questions: one to four short questions in a form above the chat box; give choices when there are clear options, "text" for free answers. Batch related questions into one call. The answers come back by question id.
- ask_user: only for picking between 3D model results with pictures (the Discover flow). It opens a large chooser.
- If an answer is "Skipped" or empty, choose a sensible default and say which one you chose.`,

  verification: `Skill: verifying (part of the work).
- After each meaningful chunk, render_scene the scene and verify_design the screens you touched. Fix every issue it reports (3D issues carry a sceneId and object id), then verify again until it returns ok.
- Check EVERY angle, not just the camera view: call render_views (front, side, back, left, top, iso in one sheet). Models often look right from one side and are wrong from another: a missing back, parts floating or poking through, a flat side, mirrored or misaligned parts. Fix what any angle shows.
- Compare before and after: snapshot_view takes a picture from a chosen viewpoint under a label. Take one before an edit that matters (a baseline), make the edit, then call snapshot_view with the SAME label: you get before | after | changes, and how much changed. Use it to confirm the edit did what you meant from that angle and did not break anything else (changedPercent far above what the edit should touch means something else moved). Aim with look {object, azimuth, elevation} or an exact camera; reuse the label to reuse the camera.
- Use get_scene bounds to check parts touch and nothing sinks into the ground or floats.
- You are finished only when every to-do is completed AND the last verify_design is ok. The app also reviews your work automatically after each pass and sends problems back; do not wait for that, verify yourself.`,
}

const MODE_TEXT: Record<AgentMode, string> = {
  ask: `Mode: ASK. You can only look and answer. Use the reading tools to answer questions about the document and scenes, and explain how to do things. You cannot create, change or delete anything; if the user wants a change, tell them to switch to Plan, Edit or Full access mode.`,
  plan: `Mode: PLAN. You cannot change the canvas. Research with the reading tools, ask questions if you need to, then call write_plan with the to-do steps and stop. Use update_todos only to track your own research steps.`,
  edit: `Mode: EDIT. You can build and change things. The user is asked to approve each kind of change the first time (they may allow a tool for this file), so work in clear steps and, if a call is denied, do not retry it: say what you could not do and ask how to proceed.`,
  full: `Mode: FULL ACCESS. You can build and change everything without asking. Work through the whole task to the end.`,
}

const SKILLS_BY_MODE: Record<AgentMode, string[]> = {
  ask: ['reading-tools', 'questions'],
  plan: ['reading-tools', 'plan', 'questions', 'todos'],
  edit: ['reading-tools', 'building-tools', 'mesh-tools', 'realism', 'todos', 'questions', 'verification'],
  full: ['reading-tools', 'building-tools', 'mesh-tools', 'realism', 'todos', 'questions', 'verification'],
}

/** The mode's rules and the skills it uses, appended to the system prompt. */
export const modeInstructions = (mode: AgentMode) => `\n\n${MODE_TEXT[mode]}\n\n${SKILLS_BY_MODE[mode].map((k) => SKILLS[k]).join('\n\n')}`

/** Added to the instructions of a /goal run. */
export const goalInstructions = (goal: string) =>
  `\n\nGOAL RUN. The user set this goal: "${goal}"\nWork until it is completely achieved, without stopping to report progress or asking the user to continue. Start with update_todos (the last item verifies the goal). Build, then check your work from every angle (render_views) and with verify_design; fix what you find. When you believe every part is done and you verified it, call complete_goal with a summary and your evidence. A separate verifier agent then checks the real scene against the goal; if it reports problems, fix them all and call complete_goal again. The run ends only when the verifier agrees. If you are truly blocked by something only the user can decide, use ask_questions, then carry on. If a call is denied, work around it or say what is missing.`
