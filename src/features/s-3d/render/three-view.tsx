import { Center, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import type { Group } from 'three'

import type { Scene3D, Shape3D } from '../types'
import { animate, applyLook, buildScene, cameraAt, disposeTree, sceneDuration } from './scene3d'
import { useFileUrl } from './use-file-url'

function Primitive({ kind, color }: { kind: Shape3D; color: string }) {
  return (
    <mesh castShadow>
      {kind === 'cube' && <boxGeometry args={[1.4, 1.4, 1.4]} />}
      {kind === 'sphere' && <sphereGeometry args={[1, 48, 48]} />}
      {kind === 'torus' && <torusGeometry args={[0.8, 0.32, 32, 96]} />}
      {kind === 'cylinder' && <cylinderGeometry args={[0.8, 0.8, 1.6, 48]} />}
      {kind === 'cone' && <coneGeometry args={[0.9, 1.7, 48]} />}
      {kind === 'torusKnot' && <torusKnotGeometry args={[0.7, 0.24, 160, 24]} />}
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
    </mesh>
  )
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return (
    <Center>
      <primitive object={scene.clone()} />
    </Center>
  )
}

function Spinner({ spin, children }: { spin: boolean; children: React.ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += dt * 0.6
  })
  return <group ref={ref}>{children}</group>
}

/** A composed scene: rebuilt whenever the scene data changes, and always animated so motion is visible while designing. */
function SceneContent({ scene, play, interactive }: { scene: Scene3D; play: boolean; interactive: boolean }) {
  const { gl, scene: target, camera } = useThree()
  const [root, setRoot] = useState<THREE.Group | null>(null)
  const t = useRef(0)
  useEffect(() => {
    let alive = true
    let built: THREE.Group | null = null
    void buildScene(scene).then((r) => {
      if (!alive) return disposeTree(r)
      built = r
      setRoot(r)
    })
    return () => {
      alive = false
      if (built) disposeTree(built)
    }
  }, [scene])
  useEffect(() => {
    applyLook(target, scene, gl)
    const cam = camera as THREE.PerspectiveCamera
    cam.position.set(...scene.camera.position)
    // oxlint-disable-next-line react/immutability -- the Three.js camera from useThree is meant to be mutated imperatively
    cam.fov = scene.camera.fov
    cam.lookAt(...scene.camera.target)
    cam.updateProjectionMatrix()
  }, [scene, gl, target, camera])
  useFrame((_, dt) => {
    if (!play || !root) return
    // Keyframed scenes loop over their timeline; pure looping motion just keeps running.
    const timed = scene.cameraKeys?.length || scene.objects.some((o) => o.keyframes?.length)
    t.current = timed ? (t.current + dt) % (sceneDuration(scene) + 1) : t.current + dt
    animate(root, t.current)
    if (scene.cameraKeys?.length && !interactive) {
      const c = cameraAt(scene, t.current)
      const cam = camera as THREE.PerspectiveCamera
      cam.position.set(...c.position)
      // oxlint-disable-next-line react/immutability -- per-frame camera animation in useFrame mutates the Three.js camera by design
      cam.fov = c.fov
      cam.lookAt(...c.target)
      cam.updateProjectionMatrix()
    }
  })
  return (
    <>
      {root && <primitive object={root} />}
      {interactive && <OrbitControls target={scene.camera.target} />}
    </>
  )
}

/** Shown when WebGL is unavailable or the browser ran out of contexts, so one 3D node never takes the editor down. */
function Fallback({ kind, color, label }: { kind: string; color: string; label: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: `radial-gradient(circle at 35% 30%, #fff8, transparent 40%), ${color}22`,
        borderRadius: 12,
        color: '#666',
        fontSize: 11,
        textAlign: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{kind === 'sphere' ? '●' : kind === 'torus' || kind === 'torusKnot' ? '◎' : '■'}</div>
        {label}
      </div>
    </div>
  )
}

export class GLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[S3D] 3D view failed:', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

let webgl: boolean | undefined
function hasWebGL() {
  if (webgl === undefined) {
    try {
      const c = document.createElement('canvas')
      const ctx = c.getContext('webgl2') || c.getContext('webgl')
      webgl = !!ctx
      ;(ctx as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      webgl = false
    }
  }
  return webgl
}

/**
 * One 3D object inside a canvas node. Orbiting is only enabled when `interactive` so dragging the node on the
 * design canvas still moves it.
 */
export default function ThreeView({
  kind,
  color,
  src,
  interactive,
  spin,
  rotation,
  scene,
}: {
  kind: Shape3D
  color: string
  src?: string
  interactive: boolean
  spin: boolean
  rotation: number
  scene?: Scene3D
}) {
  const url = useFileUrl(src ?? '')
  const fallback = (
    <Fallback kind={scene ? 'scene' : src ? 'model' : kind} color={color} label={scene ? '3D scene' : src ? '3D model' : kind} />
  )
  if (!hasWebGL()) return fallback
  if (scene)
    return (
      <GLBoundary fallback={fallback}>
        <Canvas
          shadows={scene.shadows ? 'soft' : false}
          camera={{ position: scene.camera.position, fov: scene.camera.fov }}
          gl={{ preserveDrawingBuffer: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
          style={{ pointerEvents: interactive ? 'auto' : 'none' }}
          // The canvas sits inside a zoomed container; offset sizes ignore that transform, so the drawing fills the node.
          resize={{ offsetSize: true }}
          dpr={[1, 2]}
        >
          <SceneContent scene={scene} play interactive={interactive} />
        </Canvas>
      </GLBoundary>
    )
  return (
    <GLBoundary fallback={fallback}>
      <Canvas
        resize={{ offsetSize: true }}
        camera={{ position: [2.6, 2, 2.6], fov: 45 }}
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.7} />
        <hemisphereLight args={['#ffffff', '#444455', 0.8]} />
        <directionalLight position={[4, 6, 4]} intensity={1.4} />
        <Suspense fallback={null}>
          <group rotation={[0, (rotation * Math.PI) / 180, 0]}>
            <Spinner spin={spin}>{src ? url && <Model url={url} /> : <Primitive kind={kind} color={color} />}</Spinner>
          </group>
        </Suspense>
        {interactive && <OrbitControls enablePan={false} />}
      </Canvas>
    </GLBoundary>
  )
}
