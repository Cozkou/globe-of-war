import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Sphere } from '@react-three/drei';
import * as THREE from 'three';

const countries = [
  { name: "United States", lat: 37.0902, lng: -95.7129 },
  { name: "China", lat: 35.8617, lng: 104.1954 },
  { name: "Russia", lat: 61.5240, lng: 105.3188 },
  { name: "India", lat: 20.5937, lng: 78.9629 },
  { name: "Brazil", lat: -14.2350, lng: -51.9253 },
  { name: "United Kingdom", lat: 55.3781, lng: -3.4360 },
  { name: "France", lat: 46.2276, lng: 2.2137 },
  { name: "Germany", lat: 51.1657, lng: 10.4515 },
  { name: "Japan", lat: 36.2048, lng: 138.2529 },
  { name: "Australia", lat: -25.2744, lng: 133.7751 },
  { name: "Canada", lat: 56.1304, lng: -106.3468 },
  { name: "Mexico", lat: 23.6345, lng: -102.5528 },
  { name: "Italy", lat: 41.8719, lng: 12.5674 },
  { name: "Spain", lat: 40.4637, lng: -3.7492 },
  { name: "South Korea", lat: 35.9078, lng: 127.7669 },
  { name: "Indonesia", lat: -0.7893, lng: 113.9213 },
  { name: "Turkey", lat: 38.9637, lng: 35.2433 },
  { name: "Saudi Arabia", lat: 23.8859, lng: 45.0792 },
  { name: "South Africa", lat: -30.5595, lng: 22.9375 },
  { name: "Argentina", lat: -38.4161, lng: -63.6167 },
  { name: "Egypt", lat: 26.8206, lng: 30.8025 },
  { name: "Iran", lat: 32.4279, lng: 53.6880 },
  { name: "Pakistan", lat: 30.3753, lng: 69.3451 },
  { name: "Nigeria", lat: 9.0820, lng: 8.6753 },
  { name: "Poland", lat: 51.9194, lng: 19.1451 },
  { name: "Ukraine", lat: 48.3794, lng: 31.1656 },
  { name: "Sweden", lat: 60.1282, lng: 18.6435 },
  { name: "Norway", lat: 60.4720, lng: 8.4689 },
  { name: "Greece", lat: 39.0742, lng: 21.8243 },
  { name: "Portugal", lat: 39.3999, lng: -8.2245 },
];

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}

function EarthGlobe({ onCountryHover, onCountrySelect }: { 
  onCountryHover: (name: string | null) => void;
  onCountrySelect: (name: string) => void;
}) {
  const globeRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  
  useFrame((state) => {
    if (globeRef.current) {
      globeRef.current.rotation.y += 0.001;
    }
  });

  return (
    <group>
      <Sphere ref={globeRef} args={[2, 64, 64]}>
        <meshStandardMaterial
          color="#1a0505"
          roughness={0.7}
          metalness={0.3}
          emissive="#300000"
          emissiveIntensity={0.2}
        />
      </Sphere>
      
      {/* Country markers */}
      {countries.map((country) => {
        const position = latLngToVector3(country.lat, country.lng, 2.02);
        const isHovered = hovered === country.name;
        
        return (
          <mesh
            key={country.name}
            position={[position.x, position.y, position.z]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(country.name);
              onCountryHover(country.name);
            }}
            onPointerOut={() => {
              setHovered(null);
              onCountryHover(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onCountrySelect(country.name);
            }}
          >
            <sphereGeometry args={[isHovered ? 0.08 : 0.05, 8, 8]} />
            <meshStandardMaterial
              color={isHovered ? "#ff0000" : "#cc0000"}
              emissive={isHovered ? "#ff0000" : "#660000"}
              emissiveIntensity={isHovered ? 1 : 0.5}
            />
          </mesh>
        );
      })}
      
      {/* Grid lines for countries effect */}
      <Sphere args={[2.01, 32, 32]}>
        <meshBasicMaterial
          color="#ff0000"
          wireframe
          transparent
          opacity={0.15}
        />
      </Sphere>
    </group>
  );
}

export default function Globe({ onCountrySelect }: { onCountrySelect: (name: string) => void }) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  return (
    <div className="relative w-full h-screen">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ff0000" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#660000" />
        <EarthGlobe onCountryHover={setHoveredCountry} onCountrySelect={onCountrySelect} />
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={3}
          maxDistance={8}
          rotateSpeed={0.5}
        />
      </Canvas>
      
      {hoveredCountry && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-card/90 border-2 border-primary px-6 py-3 text-glow animate-fade-in">
          <p className="text-xs text-primary tracking-wider">{hoveredCountry}</p>
        </div>
      )}
    </div>
  );
}
