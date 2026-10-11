/**
 * The user's current date and time, in their own time zone and in UTC, for a system prompt. Built
 * when each request starts, so the model knows what "today" and "latest" mean.
 */
export function currentTimePrompt(now = new Date()) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const local = now.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone })
  const utc = now.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone: 'UTC' })
  return `The user's local date and time is ${local} (time zone ${timeZone}). In UTC it is ${utc}.`
}
