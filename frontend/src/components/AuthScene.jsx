// Animated 3D hero for the sign-in screen (react-three-fiber).
// Falls back to nothing gracefully if WebGL is unavailable.
import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Stars } from '@react-three/drei';

function Knot() {
  const ref = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.rotation.x = t * 0.18;
      ref.current.rotation.y = t * 0.24;
    }
  });
  return (
    <Float speed={1.4} rotationIntensity={0.5} floatIntensity={1.3}>
      <mesh ref={ref} scale={1.12}>
        <torusKnotGeometry args={[1, 0.3, 220, 32]} />
        <MeshDistortMaterial
          color="#6366f1"
          emissive="#312e81"
          emissiveIntensity={0.55}
          roughness={0.18}
          metalness={0.85}
          distort={0.26}
          speed={1.6}
        />
      </mesh>
    </Float>
  );
}

function Orbiter({ radius, speed, size, color, offset, y }) {
  const ref = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime * speed + offset;
    if (ref.current) {
      ref.current.position.x = Math.cos(t) * radius;
      ref.current.position.z = Math.sin(t) * radius;
      ref.current.position.y = y + Math.sin(t * 1.7) * 0.25;
    }
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[size, 1]} />
      <meshStandardMaterial color={color} roughness={0.25} metalness={0.7} flatShading />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 4]} intensity={1.5} color="#c7d2fe" />
      <pointLight position={[-5, -3, -2]} intensity={1.2} color="#8b5cf6" />
      <Suspense fallback={null}>
        <Knot />
        <Orbiter radius={2.6} speed={0.5} size={0.16} color="#10b981" offset={0} y={0.6} />
        <Orbiter radius={2.9} speed={0.38} size={0.13} color="#f59e0b" offset={2.1} y={-0.5} />
        <Orbiter radius={2.3} speed={0.62} size={0.11} color="#38bdf8" offset={4.2} y={0.1} />
        <Stars radius={42} depth={22} count={1300} factor={2.6} saturation={0} fade speed={0.5} />
      </Suspense>
    </>
  );
}

class GLBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function AuthScene() {
  return (
    <GLBoundary>
      <Canvas
        dpr={[1, 1.8]}
        camera={{ position: [0, 0, 5.4], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ pointerEvents: 'none' }}
      >
        <Scene />
      </Canvas>
    </GLBoundary>
  );
}
