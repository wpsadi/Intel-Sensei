const seconds = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`)

/**
 * Logs where the time between an agent's model steps goes, so a slow run can be explained instead of guessed at. For each
 * step it logs how long it waited after the last one finished, how long preparing took (memory, tool choice), and, when
 * the step ends, how long the model call and its tools took together.
 */
export function createStepTimer(label: string) {
  let finishedAt = performance.now()
  let preparedAt = finishedAt
  return {
    /** Call when `prepareStep` starts. Call the result when it is done. */
    preparing(stepNumber: number) {
      const started = performance.now()
      const waited = started - finishedAt
      return () => {
        preparedAt = performance.now()
        console.info(
          `[${label}] step ${stepNumber + 1}: ${seconds(waited)} since ${stepNumber ? 'the last step' : 'the start'}, ${seconds(preparedAt - started)} preparing`,
        )
      }
    },
    /** Call when a step (its model call and tools) has finished. */
    finished(stepNumber: number) {
      finishedAt = performance.now()
      console.info(`[${label}] step ${stepNumber + 1}: model and tools took ${seconds(finishedAt - preparedAt)}`)
    },
  }
}
