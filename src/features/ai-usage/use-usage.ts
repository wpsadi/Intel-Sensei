import { useCallback, useEffect, useState } from 'react'

import { type UsageLog, costOf, listUsage, loadPrices } from '@/ai/usage'

export interface UsageRow extends UsageLog {
  /** USD, or null when models.dev has no price for this model. */
  cost: number | null
}

async function loadRows(): Promise<UsageRow[]> {
  const [logs, prices] = await Promise.all([listUsage(), loadPrices()])
  return logs.map((log) => ({ ...log, cost: costOf(prices, log) })).reverse()
}

/** The usage log with each call priced from models.dev. It refreshes when a new call is logged. */
export function useUsage() {
  const [rows, setRows] = useState<UsageRow[] | null>(null)

  const refresh = useCallback(() => loadRows().then(setRows), [])

  useEffect(() => {
    void loadRows().then(setRows)
    window.addEventListener('sensei-usage', refresh)
    return () => window.removeEventListener('sensei-usage', refresh)
  }, [refresh])

  return { rows, refresh }
}
