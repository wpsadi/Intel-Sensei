import { DEFAULT_MATERIAL, MATERIAL_PRESETS } from '../render/scene3d'
import type { Keyframe3D, Material3D, Obj3D, Scene3D, Vec3 } from '../types'

/**
 * A posable person built from primitives. The root group stands on the ground at its feet and faces +z at yaw 0.
 * Joints are pivot groups (hips, spine, neck, shoulders, elbows, hip joints, knees), so motions are just keyframed
 * rotations: x bends forward/back, z swings sideways.
 */
export interface CharacterLook {
  height: number
  build: 'male' | 'female'
  skin: string
  shirt: string
  pants: string
  shoes: string
  hair: string
}

export const DEFAULT_LOOK: CharacterLook = { height: 1.75, build: 'male', skin: '#e0ac69', shirt: '#f97316', pants: '#1e3a8a', shoes: '#1f2937', hair: '#2b1d14' }

/** Body measurements for a character of height h. */
function dims(look: CharacterLook) {
  const k = look.height / 1.75
  const slim = look.build === 'female' ? 0.88 : 1
  return {
    hip: 0.9 * k, thigh: 0.44 * k, shin: 0.42 * k, legR: 0.075 * k * slim,
    torso: 0.55 * k, torsoW: 0.4 * k * slim, torsoD: 0.22 * k, shoulder: 0.5 * k,
    upperArm: 0.3 * k, forearm: 0.27 * k, armR: 0.05 * k * slim,
    head: 0.115 * k, neck: 0.08 * k,
  }
}

const mat = (color: string, preset: keyof typeof MATERIAL_PRESETS = 'fabric'): Material3D => ({ ...DEFAULT_MATERIAL, ...MATERIAL_PRESETS[preset], color })

/** Builds the objects for one character. Every part id starts with `${id}-`. */
export function buildCharacter(id: string, name: string, look: CharacterLook, position: Vec3, yaw: number): Obj3D[] {
  const d = dims(look)
  const out: Obj3D[] = []
  const add = (o: Partial<Obj3D> & Pick<Obj3D, 'id' | 'kind'>) => {
    out.push({ name: o.id.replace(`${id}-`, ''), parent: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: true, ...o })
    return o.id
  }
  const group = (part: string, parent: string, position: Vec3) => add({ id: `${id}-${part}`, kind: 'group', parent, position })
  const mesh = (part: string, parent: string, o: Partial<Obj3D>) => add({ id: `${id}-${part}`, kind: 'mesh', parent, ...o })
  const limb = (r: number, len: number) => ({ geometry: 'capsule' as const, params: { radius: r, length: Math.max(0.01, len - 2 * r) }, position: [0, -len / 2, 0] as Vec3 })

  const root = add({ id, name, kind: 'group', position, rotation: [0, yaw, 0] })
  const hips = group('hips', root, [0, d.hip, 0])
  mesh('pelvis', hips, { geometry: 'roundedBox', params: { width: d.torsoW * 0.92, height: 0.16 * d.hip, depth: d.torsoD, radius: 0.05 }, material: mat(look.pants) })
  const spine = group('spine', hips, [0, 0.05, 0])
  mesh('torso', spine, { geometry: 'roundedBox', params: { width: d.torsoW, height: d.torso, depth: d.torsoD, radius: 0.07 }, position: [0, d.torso / 2, 0], material: mat(look.shirt) })
  const neck = group('neck', spine, [0, d.torso, 0])
  mesh('neck-mesh', neck, { geometry: 'cylinder', params: { radiusTop: d.head * 0.42, radiusBottom: d.head * 0.48, height: d.neck }, position: [0, d.neck / 2, 0], material: mat(look.skin, 'matte') })
  mesh('head', neck, { geometry: 'sphere', params: { radius: d.head }, position: [0, d.neck + d.head * 0.9, 0], scale: [0.9, 1.08, 0.98], material: mat(look.skin, 'matte') })
  mesh('hair', neck, {
    geometry: 'sphere', params: { radius: d.head * 1.04 },
    position: [0, d.neck + d.head * (look.build === 'female' ? 0.9 : 1.05), -d.head * 0.08],
    scale: look.build === 'female' ? [0.98, 1.12, 1.05] : [0.94, 0.8, 0.98],
    material: mat(look.hair, 'matte'),
  })
  for (const [side, x] of [['l', -1], ['r', 1]] as const) {
    // Eyes face +z so the facing direction reads in renders.
    mesh(`eye-${side}`, neck, { geometry: 'sphere', params: { radius: d.head * 0.1 }, position: [x * d.head * 0.35, d.neck + d.head, d.head * 0.88], material: mat('#111827', 'glossy') })
    const shoulder = group(`shoulder-${side}`, spine, [x * (d.torsoW / 2 + d.armR), d.torso - d.armR * 1.6, 0])
    mesh(`upper-arm-${side}`, shoulder, { ...limb(d.armR * 1.15, d.upperArm), material: mat(look.shirt) })
    const elbow = group(`elbow-${side}`, shoulder, [0, -d.upperArm, 0])
    mesh(`forearm-${side}`, elbow, { ...limb(d.armR, d.forearm), material: mat(look.skin, 'matte') })
    mesh(`hand-${side}`, elbow, { geometry: 'sphere', params: { radius: d.armR * 1.25 }, position: [0, -d.forearm - d.armR * 0.6, 0], material: mat(look.skin, 'matte') })
    const leg = group(`leg-${side}`, hips, [x * d.torsoW * 0.24, -0.02, 0])
    mesh(`thigh-${side}`, leg, { ...limb(d.legR * 1.1, d.thigh), material: mat(look.pants) })
    const knee = group(`knee-${side}`, leg, [0, -d.thigh, 0])
    mesh(`shin-${side}`, knee, { ...limb(d.legR, d.shin), material: mat(look.pants) })
    mesh(`foot-${side}`, knee, { geometry: 'roundedBox', params: { width: d.legR * 1.6, height: d.hip - d.thigh - d.shin + 0.02, depth: 0.26 * (look.height / 1.75), radius: 0.025 }, position: [0, -d.shin - (d.hip - d.thigh - d.shin) / 2 + 0.03, 0.05], material: mat(look.shoes, 'rubber') })
  }
  return out
}

/** The look stored on a character's root, so motions can be generated later for an existing character. */
export function lookOf(scene: Scene3D, id: string): CharacterLook | null {
  const root = scene.objects.find((o) => o.id === id && o.kind === 'group')
  const hips = scene.objects.find((o) => o.id === `${id}-hips`)
  if (!root || !hips) return null
  return { ...DEFAULT_LOOK, height: (hips.position[1] / 0.9) * 1.75 }
}

export type CharacterAction =
  | { type: 'walk'; to: [number, number]; speed?: number }
  | { type: 'run'; to: [number, number]; speed?: number }
  | { type: 'turn'; facing?: number; toward?: [number, number]; duration?: number }
  | { type: 'sit'; seatHeight: number; at?: [number, number]; facing?: number; duration?: number }
  | { type: 'stand'; to?: [number, number]; duration?: number }
  | { type: 'idle'; duration: number }
  | { type: 'wave'; duration?: number; side?: 'l' | 'r' }
  | { type: 'jump'; height?: number; duration?: number }

type Pose = Record<string, Vec3>
const JOINTS = ['hips', 'spine', 'neck', 'shoulder-l', 'shoulder-r', 'elbow-l', 'elbow-r', 'leg-l', 'leg-r', 'knee-l', 'knee-r'] as const

const r2 = (v: number) => Math.round(v * 1000) / 1000
const yawToward = (from: Vec3, to: [number, number]) => (Math.atan2(to[0] - from[0], to[1] - from[2]) * 180) / Math.PI
/** The equivalent of `target` nearest to `from`, so turns take the short way round. */
const nearAngle = (from: number, target: number) => target + 360 * Math.round((from - target) / 360)

const STAND: Pose = { 'shoulder-l': [0, 0, -4], 'shoulder-r': [0, 0, 4], 'elbow-l': [-6, 0, 0], 'elbow-r': [-6, 0, 0] }
const SIT: Pose = { 'leg-l': [-88, 0, -3], 'leg-r': [-88, 0, 3], 'knee-l': [88, 0, 0], 'knee-r': [88, 0, 0], spine: [-4, 0, 0], 'shoulder-l': [-28, 0, -6], 'shoulder-r': [-28, 0, 6], 'elbow-l': [-40, 0, 0], 'elbow-r': [-40, 0, 0] }

/**
 * Appends keyframes for a sequence of actions to a character and its joints. Starts at `start` (default: after the
 * character's last keyframe) and returns the time the sequence ends.
 */
export function animateCharacter(scene: Scene3D, id: string, actions: CharacterAction[], start?: number) {
  const root = scene.objects.find((o) => o.id === id)
  const look = lookOf(scene, id)
  if (!root || !look) throw new Error(`${id} is not a character (create it with add_character)`)
  const d = dims(look)
  const part = (j: string) => scene.objects.find((o) => o.id === `${id}-${j}`)!
  const keysOf = (o: Obj3D) => (o.keyframes ??= [])
  const lastT = Math.max(0, ...[root, ...JOINTS.map(part)].flatMap((o) => o.keyframes?.map((k) => k.t) ?? []))
  let t = start ?? lastT
  // Current state, continued from the last keys so sequences chain.
  const lastOf = (o: Obj3D, ch: 'position' | 'rotation') => [...(o.keyframes ?? [])].reverse().find((k) => k[ch])?.[ch] ?? o[ch]
  let pos = [...lastOf(root, 'position')] as Vec3
  let yaw = lastOf(root, 'rotation')[1]
  let hipY = lastOf(part('hips'), 'position')[1]
  const pose: Pose = Object.fromEntries(JOINTS.map((j) => [j, [...lastOf(part(j), 'rotation')] as Vec3]))
  const seated = () => hipY < d.hip - 0.15

  const keyRoot = (at: number, ease?: Keyframe3D['ease']) => keysOf(root).push({ t: r2(at), position: pos.map(r2) as Vec3, rotation: [0, r2(yaw), 0], ...(ease && { ease }) })
  const keyHips = (at: number) => keysOf(part('hips')).push({ t: r2(at), position: [0, r2(hipY), 0], rotation: pose.hips })
  const keyPose = (at: number, p: Pose, ease?: Keyframe3D['ease']) => {
    for (const j of JOINTS) {
      if (j === 'hips') continue
      const rot = p[j] ?? [0, 0, 0]
      pose[j] = rot
      keysOf(part(j)).push({ t: r2(at), rotation: rot.map(r2) as Vec3, ...(ease && { ease }) })
    }
  }
  // Anchor the current state so new motion starts from it rather than blending from earlier keys.
  keyRoot(t)
  keyHips(t)
  keyPose(t, pose)

  const turnTo = (target: number, dur = 0.35) => {
    const next = nearAngle(yaw, target)
    if (Math.abs(next - yaw) < 2) return
    yaw = next
    t += dur
    keyRoot(t)
  }
  const standUp = (dur = 1) => {
    if (!seated()) return
    // Lean forward, then rise.
    keyPose(t + dur * 0.35, { ...SIT, spine: [-28, 0, 0], 'shoulder-l': [-15, 0, -5], 'shoulder-r': [-15, 0, 5] })
    hipY = d.hip
    pose.hips = [0, 0, 0]
    t += dur
    keyHips(t)
    keyPose(t, STAND)
    keyRoot(t)
  }
  const locomote = (to: [number, number], speed: number, run: boolean) => {
    standUp()
    const dist = Math.hypot(to[0] - pos[0], to[1] - pos[2])
    if (dist < 0.02) return
    turnTo(yawToward(pos, to))
    const from = [...pos] as Vec3
    const stride = (run ? 1.6 : 0.75) * (look.height / 1.75)
    const steps = Math.max(2, Math.round(dist / stride) * 2 / 2)
    const stepT = dist / speed / steps
    const swing = run ? 38 : 24, knee = run ? 75 : 35, arm = run ? 40 : 22
    for (let i = 1; i <= steps; i++) {
      const side = i % 2 ? 1 : -1
      // Passing pose halfway through the step, contact pose at its end.
      const mid = t + stepT / 2
      keyPose(mid, {
        ...STAND, spine: [run ? 10 : 3, 0, 0],
        'leg-l': [side * -swing * 0.2, 0, 0], 'leg-r': [-side * -swing * 0.2, 0, 0],
        'knee-l': [side > 0 ? knee : 8, 0, 0], 'knee-r': [side > 0 ? 8 : knee, 0, 0],
        'elbow-l': [run ? -80 : -15, 0, 0], 'elbow-r': [run ? -80 : -15, 0, 0],
      }, 'linear')
      keysOf(part('hips')).push({ t: r2(mid), position: [0, r2(d.hip + (run ? 0.06 : 0.025)), 0], ease: 'linear' })
      t += stepT
      const k = i / steps
      pos = [from[0] + (to[0] - from[0]) * k, from[1], from[2] + (to[1] - from[2]) * k]
      keyRoot(t, 'linear')
      const last = i === steps
      keyPose(t, last ? STAND : {
        ...STAND, spine: [run ? 10 : 3, 0, 0],
        'leg-l': [side * -swing, 0, 0], 'leg-r': [side * swing, 0, 0],
        'knee-l': [side > 0 ? 5 : 20, 0, 0], 'knee-r': [side > 0 ? 20 : 5, 0, 0],
        'shoulder-l': [side * arm, 0, -5], 'shoulder-r': [-side * arm, 0, 5],
        'elbow-l': [run ? -80 : -15, 0, 0], 'elbow-r': [run ? -80 : -15, 0, 0],
      }, 'linear')
      keysOf(part('hips')).push({ t: r2(t), position: [0, r2(d.hip), 0], ease: 'linear' })
    }
  }

  for (const a of actions) {
    switch (a.type) {
      case 'walk':
      case 'run':
        locomote(a.to, a.speed ?? (a.type === 'run' ? 3.2 : 1.3), a.type === 'run')
        break
      case 'turn':
        turnTo(a.toward ? yawToward(pos, a.toward) : (a.facing ?? yaw), a.duration ?? 0.5)
        break
      case 'sit': {
        standUp()
        const dur = a.duration ?? 1.2
        // Face away from the seat, then lower the pelvis onto it while sliding back over it.
        if (a.facing !== undefined) turnTo(a.facing)
        else if (a.at) turnTo(yawToward([a.at[0], 0, a.at[1]], [pos[0], pos[2]]) )
        keyPose(t + dur * 0.4, { ...STAND, spine: [-25, 0, 0], 'leg-l': [-40, 0, 0], 'leg-r': [-40, 0, 0], 'knee-l': [55, 0, 0], 'knee-r': [55, 0, 0], 'shoulder-l': [-30, 0, -5], 'shoulder-r': [-30, 0, 5] })
        keysOf(part('hips')).push({ t: r2(t + dur * 0.4), position: [0, r2((d.hip + a.seatHeight) / 2 + 0.05), 0] })
        if (a.at) pos = [a.at[0], pos[1], a.at[1]]
        hipY = a.seatHeight + d.legR * 1.1
        t += dur
        keyRoot(t)
        keyHips(t)
        keyPose(t, SIT)
        break
      }
      case 'stand':
        standUp(a.duration ?? 1)
        if (a.to) locomote(a.to, 1.3, false)
        break
      case 'idle': {
        // A gentle breath so a held pose still looks alive.
        const base = { ...pose }
        const n = Math.max(1, Math.round(a.duration / 1.5))
        for (let i = 1; i <= n; i++) keyPose(t + (a.duration * (i - 0.5)) / n, { ...base, spine: [(base.spine?.[0] ?? 0) + 2, 0, 0], neck: [0, i % 2 ? 10 : -10, 0] })
        t += a.duration
        keyPose(t, base)
        keyHips(t)
        keyRoot(t)
        break
      }
      case 'wave': {
        const dur = a.duration ?? 2
        const side = a.side ?? 'r'
        const s = side === 'r' ? 1 : -1
        const base = { ...pose }
        const up = { ...base, [`shoulder-${side}`]: [0, 0, s * 150] as Vec3, [`elbow-${side}`]: [0, 0, s * 20] as Vec3 }
        keyPose(t + 0.3, up)
        const waves = Math.max(2, Math.round(dur * 2))
        for (let i = 1; i <= waves; i++) keyPose(t + 0.3 + ((dur - 0.6) * i) / waves, { ...up, [`elbow-${side}`]: [0, 0, s * (i % 2 ? -25 : 25)] as Vec3 })
        t += dur
        keyPose(t, base)
        keyRoot(t)
        keyHips(t)
        break
      }
      case 'jump': {
        standUp()
        const dur = a.duration ?? 0.9
        const h = a.height ?? 0.35
        const crouch = { ...STAND, 'leg-l': [-35, 0, 0] as Vec3, 'leg-r': [-35, 0, 0] as Vec3, 'knee-l': [60, 0, 0] as Vec3, 'knee-r': [60, 0, 0] as Vec3, spine: [15, 0, 0] as Vec3 }
        keyPose(t + dur * 0.25, crouch)
        keysOf(part('hips')).push({ t: r2(t + dur * 0.25), position: [0, r2(d.hip - 0.15), 0] })
        keyPose(t + dur * 0.55, { ...STAND, 'shoulder-l': [0, 0, -160], 'shoulder-r': [0, 0, 160] })
        keysOf(part('hips')).push({ t: r2(t + dur * 0.55), position: [0, r2(d.hip + h), 0] })
        keyPose(t + dur * 0.8, crouch)
        keysOf(part('hips')).push({ t: r2(t + dur * 0.8), position: [0, r2(d.hip - 0.1), 0] })
        t += dur
        keyPose(t, STAND)
        keyHips(t)
        keyRoot(t)
        break
      }
    }
  }
  for (const o of [root, ...JOINTS.map(part)]) o.keyframes?.sort((a, b) => a.t - b.t)
  return r2(t)
}
