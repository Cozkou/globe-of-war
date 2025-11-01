import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Line } from '@react-three/drei';
import * as THREE from 'three';

// Simplified country border data (relative offsets from center point)
const countries = [
  { 
    name: "United States", 
    lat: 37.0902, 
    lng: -95.7129,
    borders: [
      [-15, 10], [-10, 12], [-5, 12], [0, 10], [5, 8], [10, 5], [12, 0], 
      [10, -5], [5, -8], [0, -10], [-5, -12], [-10, -12], [-15, -10], [-15, 10]
    ]
  },
  { 
    name: "China", 
    lat: 35.8617, 
    lng: 104.1954,
    borders: [
      [-12, 8], [-8, 10], [-2, 12], [4, 12], [10, 10], [12, 6], [12, 0],
      [10, -6], [6, -10], [0, -12], [-6, -10], [-12, -6], [-12, 8]
    ]
  },
  { 
    name: "Russia", 
    lat: 61.5240, 
    lng: 105.3188,
    borders: [
      [-20, 8], [-15, 12], [-5, 15], [5, 15], [15, 12], [20, 8], [20, 0],
      [18, -5], [12, -8], [5, -10], [-5, -10], [-12, -8], [-18, -5], [-20, 0], [-20, 8]
    ]
  },
  { 
    name: "India", 
    lat: 20.5937, 
    lng: 78.9629,
    borders: [
      [-6, 10], [-2, 12], [2, 12], [6, 10], [8, 5], [8, 0], [6, -5],
      [2, -10], [0, -12], [-2, -10], [-6, -5], [-8, 0], [-8, 5], [-6, 10]
    ]
  },
  { 
    name: "Brazil", 
    lat: -14.2350, 
    lng: -51.9253,
    borders: [
      [-8, 12], [-4, 14], [2, 14], [6, 12], [10, 8], [10, 2], [8, -4],
      [4, -10], [0, -12], [-4, -10], [-8, -6], [-10, 0], [-10, 6], [-8, 12]
    ]
  },
  { 
    name: "Australia", 
    lat: -25.2744, 
    lng: 133.7751,
    borders: [
      [-12, 6], [-8, 10], [-2, 12], [4, 12], [10, 8], [12, 2], [12, -4],
      [8, -10], [2, -12], [-4, -12], [-10, -8], [-12, -2], [-12, 6]
    ]
  },
  { 
    name: "Canada", 
    lat: 56.1304, 
    lng: -106.3468,
    borders: [
      [-15, 8], [-10, 12], [-2, 14], [6, 14], [12, 10], [15, 6], [15, 0],
      [12, -6], [6, -10], [0, -12], [-8, -10], [-15, -6], [-15, 8]
    ]
  },
  { 
    name: "Mexico", 
    lat: 23.6345, 
    lng: -102.5528,
    borders: [
      [-6, 8], [-2, 10], [2, 10], [6, 8], [8, 4], [8, -2], [6, -6],
      [2, -8], [-2, -8], [-6, -6], [-8, -2], [-8, 4], [-6, 8]
    ]
  },
  { 
    name: "Japan", 
    lat: 36.2048, 
    lng: 138.2529,
    borders: [
      [-2, 10], [0, 12], [2, 10], [3, 6], [3, 0], [2, -6], [0, -10],
      [-2, -8], [-3, -4], [-3, 4], [-2, 10]
    ]
  },
  { 
    name: "United Kingdom", 
    lat: 55.3781, 
    lng: -3.4360,
    borders: [
      [-3, 6], [-1, 8], [1, 8], [3, 6], [4, 2], [4, -2], [2, -6],
      [0, -8], [-2, -6], [-4, -2], [-4, 2], [-3, 6]
    ]
  },
];

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}

function createCountryOutline(country: typeof countries[0], radius: number) {
  const centerPos = latLngToVector3(country.lat, country.lng, radius);
  const points: THREE.Vector3[] = [];
  
  // Create outline points by offsetting from center
  country.borders.forEach(([latOffset, lngOffset]) => {
    const point = latLngToVector3(
      country.lat + latOffset / 6,
      country.lng + lngOffset / 6,
      radius + 0.01
    );
    points.push(point);
  });
  
  return points;
}

function CountryOutline({ country, radius, isHovered, onHover, onSelect }: {
  country: typeof countries[0];
  radius: number;
  isHovered: boolean;
  onHover: (name: string | null) => void;
  onSelect: (name: string) => void;
}) {
  const points = useMemo(() => createCountryOutline(country, radius), [country, radius]);
  
  return (
    <Line
      points={points}
      color={isHovered ? "#ff0000" : "#cc0000"}
      lineWidth={isHovered ? 3 : 2}
      transparent
      opacity={isHovered ? 1 : 0.8}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(country.name);
      }}
      onPointerOut={() => {
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(country.name);
      }}
    />
  );
}

function EarthGlobe({ onCountryHover, onCountrySelect }: { 
  onCountryHover: (name: string | null) => void;
  onCountrySelect: (name: string) => void;
}) {
  const globeRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 1.5;
  
  useFrame((state) => {
    if (globeRef.current) {
      globeRef.current.rotation.y += 0.001;
    }
  });

  const handleHover = (name: string | null) => {
    setHovered(name);
    onCountryHover(name);
  };

  return (
    <group>
      <Sphere ref={globeRef} args={[radius, 64, 64]}>
        <meshStandardMaterial
          color="#1a0505"
          roughness={0.7}
          metalness={0.3}
          emissive="#300000"
          emissiveIntensity={0.2}
        />
      </Sphere>
      
      {/* Country outlines */}
      {countries.map((country) => (
        <CountryOutline
          key={country.name}
          country={country}
          radius={radius}
          isHovered={hovered === country.name}
          onHover={handleHover}
          onSelect={onCountrySelect}
        />
      ))}
      
      {/* Grid lines for globe effect */}
      <Sphere args={[radius + 0.005, 32, 32]}>
        <meshBasicMaterial
          color="#ff0000"
          wireframe
          transparent
          opacity={0.1}
        />
      </Sphere>
    </group>
  );
}

export default function Globe({ onCountrySelect }: { onCountrySelect: (name: string) => void }) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  return (
    <div className="relative w-full h-screen">
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ff0000" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#660000" />
        <EarthGlobe onCountryHover={setHoveredCountry} onCountrySelect={onCountrySelect} />
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={2.5}
          maxDistance={6}
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
