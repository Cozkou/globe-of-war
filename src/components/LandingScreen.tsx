import { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from './ui/button';

interface LandingScreenProps {
  onStart: () => void;
}

function SpinningGlobe() {
  const globeRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.003;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main globe */}
      <Sphere ref={globeRef} args={[1.5, 64, 64]}>
        <meshStandardMaterial
          color="#0a2040"
          roughness={0.7}
          metalness={0.2}
          emissive="#051a35"
          emissiveIntensity={0.5}
        />
      </Sphere>
      
      {/* Atmosphere glow */}
      <Sphere args={[1.52, 64, 64]}>
        <meshBasicMaterial
          color="#ff3333"
          transparent
          opacity={0.15}
          side={THREE.BackSide}
        />
      </Sphere>
      
      {/* Grid overlay */}
      <Sphere args={[1.51, 32, 32]}>
        <meshBasicMaterial
          color="#ff3333"
          wireframe
          transparent
          opacity={0.2}
        />
      </Sphere>

      {/* Title text on globe */}
      <Text
        position={[0, 0.3, 1.6]}
        fontSize={0.25}
        color="#ff3333"
        anchorX="center"
        anchorY="middle"
        font="/fonts/PressStart2P-Regular.ttf"
        letterSpacing={0.15}
      >
        SKYTRACK
      </Text>

      {/* Subtitle text on globe */}
      <Text
        position={[0, -0.1, 1.6]}
        fontSize={0.08}
        color="#999999"
        anchorX="center"
        anchorY="middle"
        maxWidth={2.5}
        textAlign="center"
        letterSpacing={0.05}
      >
        REAL-TIME GLOBAL AIRCRAFT TRACKING
      </Text>
    </group>
  );
}

export default function LandingScreen({ onStart }: LandingScreenProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleStart = () => {
    setIsAnimating(true);
    setTimeout(() => {
      onStart();
    }, 1000);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black">
      {/* CRT scanlines effect */}
      <div className="absolute inset-0 pointer-events-none opacity-5 crt-effect"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.15) 2px, rgba(255, 0, 0, 0.15) 4px)'
        }}
      />
      
      <div className={`flex flex-col items-center gap-12 w-full ${isAnimating ? 'fly-up' : ''}`}>
        {/* 3D Globe Scene */}
        <div className="w-full h-[500px] md:h-[600px]">
          <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
            <color attach="background" args={['#000000']} />
            
            {/* Starfield */}
            <Stars 
              radius={100} 
              depth={50} 
              count={3000} 
              factor={4} 
              saturation={0} 
              fade 
              speed={0.5}
            />
            
            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={2} color="#ff0000" />
            <pointLight position={[-10, -10, -10]} intensity={1} color="#ff3333" />
            <directionalLight position={[5, 0, 5]} intensity={1.5} color="#ffffff" />
            
            <SpinningGlobe />
          </Canvas>
        </div>
        
        {/* Button below globe */}
        <Button
          onClick={handleStart}
          variant="default"
          size="lg"
          className="px-8 py-6 text-sm tracking-wider bg-primary hover:bg-primary/90 border-2 border-primary text-primary-foreground transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,0,0,0.5)] z-10"
        >
          SELECT COUNTRY
        </Button>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground tracking-wider z-10">
        WLDN x Builder's Brew | HackTheBurgh 2025 ©
      </div>

      {/* Red glow at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-war-blood/10 to-transparent pointer-events-none" />
    </div>
  );
}
