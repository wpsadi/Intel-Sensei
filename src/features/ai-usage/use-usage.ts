import { useCallback, useEffect, useState } from 'react'
import { costOf, listUsage, loadPrices, type UsageLog } from '@/ai/usage'

export interface UsageRow extends UsageLog {
  /** USD, or null when models.dev has no price for this model. */
  cost: number | null
}

/** The usage log with each call priced from models.dev. It refreshes when a new call is logged. */
export function useUsage() {
  const [rows, setRows] = useState<UsageRow[] | null>(null)

  const refresh = useCallback(async () => {
    const [logs, prices] = await Promise.all([listUsage(), loadPrices()])
    setRows(logs.map((log) => ({ ...log, cost: costOf(prices, log) })).reverse())
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener('sensei-usage', refresh)
    return () => window.removeEventListener('sensei-usage', refresh)
  }, [refresh])

  return { rows, refresh }
}
