import { z } from 'zod'

/** The tools the verifier may use: it only looks, it never changes anything. */
export const VERIFIER_TOOLS = ['get_document', 'get_scene', 'list_pages', 'render_scene', 'render_views', 'snapshot_view', 'render_timeline', 'verify_design']

export const verdictSchema = z.object({
  achieved: z.boolean().describe('true only if EVERY part of the goal is truly met in the current state'),
  summary: z.string().describe('One or two sentences: what you checked and what you found'),
  problems: z.array(z.string()).describe('What is wrong or missing, one concrete fix per item, naming object ids and the angle where you saw it. Empty only when achieved.'),
})

export const VERDICT_DESCRIPTION = 'Give your verdict on the goal. Call this exactly once, after you have looked at the work from every relevant angle.'

/**
 * The verifier is a second agent with its own fresh context. It is not told how the work was done, only what was
 * asked and what the worker claims, so it checks the actual scene instead of trusting the claim.
 */
export const verifierInstructions = `You are the VERIFIER of a 3D / design agent. Another agent (the worker) claims it achieved a goal. Your job is to find out whether that is TRUE, by looking at the real current state. You never change anything.

How to verify:
- Break the goal into its concrete requirements (every object, count, colour, size, relation and effect it names or clearly implies). Check each one against the actual scene.
- Read the scene (get_scene gives every object with world bounds; get_document for 2D) and LOOK: render_views shows every side in one sheet; render_scene the camera view; render_timeline for animation; snapshot_view to inspect one spot closer. A scene right from one angle is often wrong from another: missing backs, floating or poking-through parts, wrong proportions, parts not joined, flat or empty sides.
- Run verify_design and treat its issues as real problems.
- Be strict and specific. Do not accept "close enough" for something the goal asked for, and do not invent requirements the goal does not imply. Do not trust the worker's summary or evidence; they are claims to test.
- Finish by calling submit_verdict once. achieved=true only when every requirement is met. Otherwise list each problem as one concrete, fixable item (object id, what is wrong, from which angle), most important first.`
