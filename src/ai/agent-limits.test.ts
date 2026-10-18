import { describe, expect, it } from 'vitest'

import { MAX_AGENT_STEPS, stepNotice } from './agent-limits'

const budget = { used: 0, max: MAX_AGENT_STEPS }

describe('step limit', () => {
  it('is 60', () => {
    expect(MAX_AGENT_STEPS).toBe(60)
  })

  it('says nothing while the agent has plenty of steps left', () => {
    for (const step of [0, 1, 30, 44]) expect(stepNotice(budget, step)).toBeNull()
  })

  it('asks the agent to wrap up from 75% of the steps, with the count and share used', () => {
    const notice = stepNotice(budget, 45)!
    expect(notice.final).toBe(false)
    expect(notice.note).toContain('45 of 60 steps (75%)')
    expect(stepNotice(budget, 58)!.final).toBe(false)
    expect(stepNotice(budget, 58)!.note).toContain('58 of 60 steps (97%)')
  })

  it('forbids tools on the last step, so the agent ends with an answer', () => {
    const notice = stepNotice(budget, 59)!
    expect(notice.final).toBe(true)
    expect(notice.note).toMatch(/last step.*cannot call tools/)
  })

  it('counts steps taken in earlier passes of the same request', () => {
    // A third of the budget was used by earlier passes, so this run's 25th step is already at 75%.
    expect(stepNotice({ used: 20, max: 60 }, 24)).toBeNull()
    expect(stepNotice({ used: 20, max: 60 }, 25)!.note).toContain('45 of 60')
    expect(stepNotice({ used: 20, max: 60 }, 39)!.final).toBe(true)
  })

  it('works for a smaller budget', () => {
    expect(stepNotice({ used: 0, max: 8 }, 5)).toBeNull()
    expect(stepNotice({ used: 0, max: 8 }, 6)!.final).toBe(false)
    expect(stepNotice({ used: 0, max: 8 }, 7)!.final).toBe(true)
  })
})
