import { asSchema } from 'ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createFirecrawlMcpTools } from '@/ai/mcp/firecrawl'
import { schemas as drawSchemas } from '@/features/s-draw/webmcp/schemas'

import { looseRecord } from './loose-record'

describe('looseRecord', () => {
  it('accepts any text keys with valid values and rejects bad values, like a record', () => {
    const schema = looseRecord(z.string())
    expect(schema.parse({ Status: 'Done', Owner: 'Ana' })).toEqual({ Status: 'Done', Owner: 'Ana' })
    expect(schema.parse({})).toEqual({})
    expect(schema.safeParse({ Status: 3 }).success).toBe(false)
    expect(schema.safeParse('Done').success).toBe(false)
    expect(looseRecord(z.unknown()).parse({ any: [1, { deep: true }] })).toEqual({ any: [1, { deep: true }] })
  })

  it('describes itself without propertyNames, which OpenAI does not support, and keeps the value type', () => {
    const json = z.toJSONSchema(looseRecord(z.string()))
    expect(JSON.stringify(json)).not.toContain('propertyNames')
    expect(json).toMatchObject({ type: 'object', additionalProperties: { type: 'string' } })
    // The plain record is what caused the warning.
    expect(JSON.stringify(z.toJSONSchema(z.record(z.string(), z.string())))).toContain('propertyNames')
  })
})

describe('tool schemas sent to OpenAI', () => {
  it('has no propertyNames in the drawing update patch', () => {
    expect(JSON.stringify(z.toJSONSchema(drawSchemas.sdraw_update_elements))).not.toContain('propertyNames')
  })

  it('has no propertyNames in the Firecrawl tools', async () => {
    for (const [name, item] of Object.entries(createFirecrawlMcpTools())) {
      expect(JSON.stringify(await asSchema(item.inputSchema as never).jsonSchema), name).not.toContain('propertyNames')
    }
  })
})
