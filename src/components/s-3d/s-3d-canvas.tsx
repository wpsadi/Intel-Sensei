import { useRef } from 'react'
import { useTheme } from 'next-themes'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Mesh } from 'three'

// Slowly spinning placeholder cube; replace with the real S3D scene.
function SpinningCube() {
  const meshRef = useRef<Mesh>(null)
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.5
  })
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color="#6366f1" />
    </mesh>
  )
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function S3DCanvas() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const background = isDark ? '#0a0a0a' : '#f5f5f5'
  const gridCenter = isDark ? '#525252' : '#a3a3a3'
  const gridLines = isDark ? '#262626' : '#e5e5e5'

  if (!hasWebGL()) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        WebGL is not available in this browser.
      </div>
    )
  }
  return (
    <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
      <color attach="background" args={[background]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <gridHelper args={[10, 10, gridCenter, gridLines]} />
      <SpinningCube />
      <OrbitControls makeDefault />
    </Canvas>
  )
}
