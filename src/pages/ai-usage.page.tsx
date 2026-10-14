import { Trash2Icon } from 'lucide-react'
import { useMemo } from 'react'

import { clearUsage } from '@/ai/usage'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useUsage } from '@/features/ai-usage/use-usage'

const usd = (value: number) => `$${value.toFixed(2)}`
/** Calls cost fractions of a cent, so the tables show seven decimals. */
const usd7 = (value: number) => `$${value.toFixed(7)}`
const count = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Spend per period and per model; reads the clock, so it lives outside render. */
function summarize(rows: ReturnType<typeof useUsage>['rows']) {
  const day = 24 * 60 * 60 * 1000
  const sum = (since: number) => (rows ?? []).filter((r) => r.at >= since).reduce((t, r) => t + (r.cost ?? 0), 0)
  const byModel = new Map<string, { calls: number; tokens: number; cost: number }>()
  for (const r of rows ?? []) {
    const entry = byModel.get(`${r.provider}/${r.model}`) ?? { calls: 0, tokens: 0, cost: 0 }
    entry.calls++
    entry.tokens += r.inputTokens + r.outputTokens
    entry.cost += r.cost ?? 0
    byModel.set(`${r.provider}/${r.model}`, entry)
  }
  const startOfDay = new Date().setHours(0, 0, 0, 0)
  return {
    today: sum(startOfDay),
    week: sum(Date.now() - 7 * day),
    all: sum(0),
    unpriced: (rows ?? []).filter((r) => r.cost === null).length,
    byModel: [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost),
  }
}

function AiUsagePage() {
  const { rows } = useUsage()

  const totals = useMemo(() => summarize(rows), [rows])

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <section className="flex flex-col gap-4 p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">AI usage</h1>
              <p className="text-sm text-muted-foreground">
                Every model call Sensei makes, priced with models.dev. Stored in this browser only.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!rows?.length}
              onClick={() => confirm('Delete the whole usage log?') && void clearUsage()}
            >
              <Trash2Icon /> Clear log
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['Today', totals.today],
                ['Last 7 days', totals.week],
                ['All time', totals.all],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{usd(value)}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          {totals.unpriced > 0 && (
            <p className="text-xs text-muted-foreground">
              {totals.unpriced} calls have no price on models.dev (or you are offline), so they count as $0.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>By model</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totals.byModel.map(([name, m]) => (
                    <TableRow key={name}>
                      <TableCell className="font-mono text-xs">{name}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.calls}</TableCell>
                      <TableCell className="text-right tabular-nums">{count.format(m.tokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{usd7(m.cost)}</TableCell>
                    </TableRow>
                  ))}
                  {rows && !rows.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No AI calls logged yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent calls</CardTitle>
              <CardDescription>The latest 200.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rows ?? []).slice(0, 200).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(r.at).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs">{r.model}</TableCell>
                        <TableCell className="text-right tabular-nums">{count.format(r.inputTokens)}</TableCell>
                        <TableCell className="text-right tabular-nums">{count.format(r.outputTokens)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.cost === null ? '—' : usd7(r.cost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AiUsagePage
