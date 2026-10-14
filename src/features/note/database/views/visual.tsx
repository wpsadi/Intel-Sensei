import L from 'leaflet'

import 'leaflet/dist/leaflet.css'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ScrollArea } from '@/components/ui/scroll-area'

import { useViews } from '../../db/hooks'
import { VIEW_LABELS } from '../../db/repo'
import type { Page, PropertyDef, View } from '../../db/types'
import { pageTitle } from '../../editor/nodes/page-utils'
import { parsePlace, readValue } from '../property-values'
import { groupRows } from './group-rows'
import type { ViewProps } from './types'

/* ----------------------------------- map ----------------------------------- */

export function MapView(props: ViewProps) {
  const { database, view, rows, openRow } = props
  const placeProp = database.properties.find((p) => p.id === view.placeProperty) ?? database.properties.find((p) => p.type === 'place')
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const openRef = useRef(openRow)
  useLayoutEffect(() => {
    openRef.current = openRow
  })

  useEffect(() => {
    if (!container.current) return
    map.current = L.map(container.current).setView([20, 0], 2)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [placeProp?.id])

  useEffect(() => {
    if (!placeProp || !layer.current || !map.current) return
    layer.current.clearLayers()
    const points: L.LatLngTuple[] = []
    rows.forEach((row) => {
      const point = parsePlace(readValue(row, placeProp))
      if (!point) return
      points.push(point)
      L.circleMarker(point, { radius: 8, color: '#2563eb', fillOpacity: 0.7 })
        .bindTooltip(pageTitle(row.title))
        .on('click', () => openRef.current(row.id))
        .addTo(layer.current!)
    })
    if (points.length) map.current.fitBounds(L.latLngBounds(points), { maxZoom: 12, padding: [30, 30] })
  }, [rows, placeProp])

  if (!placeProp) return <p className="p-4 text-sm text-muted-foreground">Add a Place property (lat, lng) to use the map view.</p>
  return <div ref={container} className="z-0 h-[420px] w-full rounded-md border" />
}

/* ---------------------------------- charts --------------------------------- */

const PALETTE = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#64748b']

/** Groups rows by `view.groupBy` and aggregates `view.valueProperty` (or counts rows). */
function chartData(database: ViewProps['database'], view: View, rows: Page[]) {
  const groupProp: PropertyDef | undefined =
    database.properties.find((p) => p.id === view.groupBy) ?? database.properties.find((p) => p.type === 'status' || p.type === 'select')
  const valueProp = database.properties.find((p) => p.id === view.valueProperty && p.type === 'number')
  const aggregate = valueProp ? (view.aggregate ?? 'sum') : 'count'

  const reduce = (list: Page[]) => {
    if (aggregate === 'count' || !valueProp) return list.length
    const values = list.map((row) => Number(readValue(row, valueProp) ?? 0))
    const sum = values.reduce((a, b) => a + b, 0)
    return aggregate === 'avg' ? (values.length ? +(sum / values.length).toFixed(2) : 0) : sum
  }

  return {
    data: groupRows(rows, groupProp)
      .filter((g) => g.rows.length || g.key !== '__none')
      .map((g) => ({ name: g.label, value: reduce(g.rows) })),
    total: reduce(rows),
    label: valueProp ? `${aggregate} of ${valueProp.name}` : 'Count',
  }
}

export function ChartView({ database, view, rows }: ViewProps) {
  const { data, total, label } = chartData(database, view, rows)

  if (view.type === 'number') {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-md border">
        <div className="text-5xl font-semibold tabular-nums">{total.toLocaleString()}</div>
        <div className="mt-2 text-sm text-muted-foreground capitalize">{label}</div>
      </div>
    )
  }

  const axis = { fontSize: 12, stroke: 'currentColor', opacity: 0.6 }

  return (
    <div className="h-80 w-full rounded-md border p-3 text-muted-foreground">
      <ResponsiveContainer width="100%" height="100%">
        {view.type === 'donut' ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} label>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : view.type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" tick={axis} />
            <YAxis tick={axis} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="value" name={label} stroke={PALETTE[0]} strokeWidth={2} />
          </LineChart>
        ) : (
          <BarChart data={data} layout={view.type === 'bar_horizontal' ? 'vertical' : 'horizontal'}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            {view.type === 'bar_horizontal' ? (
              <>
                <XAxis type="number" tick={axis} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axis} width={100} />
              </>
            ) : (
              <>
                <XAxis dataKey="name" tick={axis} />
                <YAxis tick={axis} allowDecimals={false} />
              </>
            )}
            <Tooltip />
            <Bar dataKey="value" name={label} radius={4}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

/* -------------------------------- dashboard -------------------------------- */

/** Shows every other view of the same view set side by side as widgets. */
export function DashboardView(props: ViewProps & { renderView: (view: View) => React.ReactNode }) {
  const views = useViews(props.view.ownerId)?.filter((v) => v.id !== props.view.id && v.type !== 'dashboard' && v.type !== 'form')
  if (!views?.length) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <ChartView {...props} view={{ ...props.view, type: 'number' }} />
        <ChartView {...props} view={{ ...props.view, type: 'donut' }} />
        <p className="col-span-full text-xs text-muted-foreground">Add more views to this database to pin them on the dashboard.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {views.map((view) => (
        <section key={view.id} className="rounded-md border p-3">
          <h4 className="mb-2 text-sm font-medium">{view.name || VIEW_LABELS[view.type]}</h4>
          <ScrollArea className="h-[480px]">{props.renderView(view)}</ScrollArea>
        </section>
      ))}
    </div>
  )
}
