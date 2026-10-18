import { z } from 'zod'

/**
 * A map from any text key to a value, for a tool's input schema.
 *
 * `z.record(z.string(), x)` becomes a JSON Schema with `propertyNames`, which OpenAI does not support: the AI SDK strips it
 * and prints a warning on every request. An object whose extra keys all take one schema (`additionalProperties`) accepts
 * the same input and says it in a way every provider understands.
 */
export const looseRecord = <T extends z.ZodType>(value: T) => z.object({}).catchall(value)
