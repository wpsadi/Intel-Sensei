import { MinusIcon, RefreshCwIcon } from 'lucide-react'

import { uid } from '@/features/s-3d/db'
import { update } from '@/features/s-3d/inspector/field-utils'
import { IconBtn, NumberField, Section, Sel, TextField } from '@/features/s-3d/inspector/fields'
import { useS3D } from '@/features/s-3d/store'
import type { Interaction, NodeState, SNode } from '@/features/s-3d/types'

const capture = (n: SNode): NodeState['overrides'] =>
  structuredClone({
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    rotation: n.rotation,
    opacity: n.opacity,
    fills: n.fills,
    visible: n.visible,
    radius: n.radius,
  })

function StatesSection({ node }: { node: SNode }) {
  const setStates = (fn: (s: NodeState[]) => NodeState[]) => update([node.id], (n) => void (n.states = fn(n.states)))
  return (
    <Section title="States" onAdd={() => setStates((s) => [...s, { id: uid(), name: `State ${s.length + 1}`, overrides: capture(node) }])}>
      {node.states.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Add a state to capture the layer's current look. Edit the layer, then add another.
        </p>
      )}
      {node.states.map((st) => (
        <div key={st.id} className="flex items-center gap-1">
          <TextField
            className="flex-1"
            value={st.name}
            onChange={(name) => setStates((s) => s.map((x) => (x.id === st.id ? { ...x, name } : x)))}
          />
          <IconBtn
            label="Update from current"
            onClick={() => setStates((s) => s.map((x) => (x.id === st.id ? { ...x, overrides: capture(node) } : x)))}
          >
            <RefreshCwIcon />
          </IconBtn>
          <IconBtn label="Delete state" onClick={() => setStates((s) => s.filter((x) => x.id !== st.id))}>
            <MinusIcon />
          </IconBtn>
        </div>
      ))}
    </Section>
  )
}

const ACTIONS: { value: Interaction['action']; label: string }[] = [
  { value: 'go-to-frame', label: 'Go to frame' },
  { value: 'go-to-page', label: 'Go to page' },
  { value: 'set-state', label: 'Set state' },
  { value: 'toggle-visibility', label: 'Toggle visibility' },
  { value: 'open-url', label: 'Open URL' },
  { value: 'animate', label: 'Animate' },
]

function InteractionRow({ node, it }: { node: SNode; it: Interaction }) {
  const doc = useS3D((s) => s.doc)
  const set = (patch: Partial<Interaction>) =>
    update([node.id], (n) => void (n.interactions = n.interactions.map((x) => (x.id === it.id ? { ...x, ...patch } : x))))
  const nodes = Object.values(doc.nodes)
  const withStates = nodes.filter((n) => n.states.length)
  const targets: { value: string; label: string }[] =
    it.action === 'go-to-frame'
      ? nodes.filter((n) => n.type === 'frame').map((n) => ({ value: n.id, label: n.name }))
      : it.action === 'go-to-page'
        ? doc.pages.map((p) => ({ value: p.id, label: p.name }))
        : it.action === 'toggle-visibility'
          ? nodes.filter((n) => n.type !== 'comment').map((n) => ({ value: n.id, label: n.name }))
          : it.action === 'set-state'
            ? withStates.map((n) => ({ value: n.id, label: n.name }))
            : []
  const stateNode = it.action === 'set-state' ? doc.nodes[it.target ?? ''] : undefined
  return (
    <div className="flex flex-col gap-1 rounded-md border p-1.5">
      <div className="flex items-center gap-1">
        <Sel<Interaction['trigger']>
          value={it.trigger}
          options={[
            { value: 'click', label: 'On click' },
            { value: 'hover', label: 'On hover' },
            { value: 'load', label: 'On load' },
            { value: 'key', label: 'On key' },
          ]}
          onChange={(trigger) => set({ trigger })}
        />
        <IconBtn
          label="Remove interaction"
          onClick={() => update([node.id], (n) => void (n.interactions = n.interactions.filter((x) => x.id !== it.id)))}
        >
          <MinusIcon />
        </IconBtn>
      </div>
      {it.trigger === 'key' && <TextField value={it.key ?? ''} placeholder="Key, e.g. ArrowRight" onChange={(key) => set({ key })} />}
      <Sel
        value={it.action}
        options={ACTIONS}
        onChange={(action) => set({ action, target: undefined, value: undefined, animation: action === 'animate' ? 'pulse' : undefined })}
      />
      {targets.length > 0 && (
        <Sel<string>
          value={it.target ?? ''}
          options={[{ value: '', label: 'Choose target…' }, ...targets]}
          onChange={(target) => set({ target, value: undefined })}
        />
      )}
      {it.action === 'set-state' && targets.length === 0 && <p className="text-[11px] text-muted-foreground">No layers have states yet.</p>}
      {stateNode && (
        <Sel<string>
          value={it.value ?? ''}
          options={[
            { value: '', label: 'Choose state…' },
            { value: '__base', label: 'Default' },
            ...stateNode.states.map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(value) => set({ value })}
        />
      )}
      {it.action === 'open-url' && <TextField value={it.value ?? ''} placeholder="https://" onChange={(value) => set({ value })} />}
      {it.action === 'animate' && (
        <Sel<NonNullable<Interaction['animation']>>
          value={it.animation ?? 'pulse'}
          options={[
            { value: 'spin', label: 'Spin' },
            { value: 'float', label: 'Float' },
            { value: 'pulse', label: 'Pulse' },
            { value: 'shake', label: 'Shake' },
            { value: 'fade-in', label: 'Fade in' },
          ]}
          onChange={(animation) => set({ animation })}
        />
      )}
      <div className="grid grid-cols-2 gap-1">
        <NumberField label="ms" value={it.duration} min={0} step={50} onChange={(duration) => set({ duration })} />
        <Sel<Interaction['easing']>
          value={it.easing}
          options={['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'spring']}
          onChange={(easing) => set({ easing })}
        />
      </div>
    </div>
  )
}

export function PrototypePanel() {
  const selection = useS3D((s) => s.selection)
  const node = useS3D((s) => (s.selection.length === 1 ? s.doc.nodes[s.selection[0]] : undefined))
  if (!node) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {selection.length
          ? 'Select a single layer to edit its prototype.'
          : 'Select a layer to add states and interactions. Press Play to test them.'}
      </p>
    )
  }
  const add = () =>
    update(
      [node.id],
      (n) => void n.interactions.push({ id: uid(), trigger: 'click', action: 'go-to-frame', duration: 300, easing: 'ease-out' }),
    )
  return (
    <>
      <StatesSection node={node} />
      <Section title="Interactions" onAdd={add}>
        {node.interactions.length === 0 && <p className="text-[11px] text-muted-foreground">No interactions.</p>}
        {node.interactions.map((it) => (
          <InteractionRow key={it.id} node={node} it={it} />
        ))}
      </Section>
    </>
  )
}
