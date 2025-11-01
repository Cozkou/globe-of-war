import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Line } from '@react-three/drei';
import * as THREE from 'three';
import { feature } from 'topojson-client';

interface CountryProperties {
  name: string;
}

interface GeoJSONFeature {
  type: string;
  properties: CountryProperties;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}

function convertCoordinatesToVectors(coordinates: number[][], radius: number): THREE.Vector3[] {
  return coordinates.map(([lng, lat]) => {
    // Skip invalid coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return latLngToVector3(lat, lng, radius);
  }).filter((v): v is THREE.Vector3 => v !== null);
}

function CountryRegion({ 
  coordinates, 
  radius, 
  countryName, 
  isHovered,
  onHover,
  onSelect 
}: { 
  coordinates: number[][];
  radius: number;
  countryName: string;
  isHovered: boolean;
  onHover: (name: string | null) => void;
  onSelect: (name: string) => void;
}) {
  const points = useMemo(() => {
    const vectors = convertCoordinatesToVectors(coordinates, radius + 0.002);
    return vectors.length > 1 ? vectors : [];
  }, [coordinates, radius]);
  
  const fillPoints = useMemo(() => {
    const vectors = convertCoordinatesToVectors(coordinates, radius + 0.001);
    return vectors.length > 2 ? vectors : [];
  }, [coordinates, radius]);
  
  if (points.length < 2) return null;
  
  // Create shape for filled area
  const shape = useMemo(() => {
    if (fillPoints.length < 3) return null;
    
    const shape = new THREE.Shape();
    // Project points onto 2D for shape creation
    fillPoints.forEach((point, i) => {
      const normalized = point.clone().normalize();
      const x = Math.atan2(normalized.z, normalized.x);
      const y = Math.asin(normalized.y);
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    });
    return shape;
  }, [fillPoints]);
  
  return (
    <group>
      {/* Invisible clickable mesh for the country area */}
      {fillPoints.length > 2 && (
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(countryName);
          }}
          onPointerOut={() => {
            onHover(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(countryName);
          }}
        >
          <sphereGeometry args={[radius + 0.001, 64, 64]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      
      {/* Visible border line */}
      <Line
        points={points}
        color={isHovered ? "#ff0000" : "#cc0000"}
        lineWidth={isHovered ? 2.5 : 1.5}
        transparent
        opacity={isHovered ? 1 : 0.7}
      />
    </group>
  );
}

function EarthGlobe({ 
  countries, 
  onCountryHover, 
  onCountrySelect 
}: { 
  countries: GeoJSONFeature[];
  onCountryHover: (name: string | null) => void;
  onCountrySelect: (name: string) => void;
}) {
  const globeRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 1.5;
  
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.001;
    }
  });

  const handleHover = (name: string | null) => {
    setHovered(name);
    onCountryHover(name);
  };

  return (
    <group ref={groupRef}>
      {/* Globe sphere */}
      <Sphere ref={globeRef} args={[radius, 64, 64]}>
        <meshStandardMaterial
          color="#0a0202"
          roughness={0.9}
          metalness={0.1}
          emissive="#1a0505"
          emissiveIntensity={0.3}
        />
      </Sphere>
      
      {/* Country regions */}
      {countries.map((country, index) => {
        const countryName = country.properties.name;
        const { geometry } = country;
        
        if (geometry.type === 'Polygon') {
          return geometry.coordinates.map((ring, ringIndex) => (
            <CountryRegion
              key={`${countryName}-${index}-${ringIndex}`}
              coordinates={ring as number[][]}
              radius={radius}
              countryName={countryName}
              isHovered={hovered === countryName}
              onHover={handleHover}
              onSelect={onCountrySelect}
            />
          ));
        } else if (geometry.type === 'MultiPolygon') {
          return geometry.coordinates.map((polygon, polyIndex) => 
            polygon.map((ring, ringIndex) => (
              <CountryRegion
                key={`${countryName}-${index}-${polyIndex}-${ringIndex}`}
                coordinates={ring as number[][]}
                radius={radius}
                countryName={countryName}
                isHovered={hovered === countryName}
                onHover={handleHover}
                onSelect={onCountrySelect}
              />
            ))
          );
        }
        return null;
      })}
      
      {/* Subtle grid overlay */}
      <Sphere args={[radius + 0.001, 32, 32]}>
        <meshBasicMaterial
          color="#ff0000"
          wireframe
          transparent
          opacity={0.05}
        />
      </Sphere>
    </group>
  );
}

export default function Globe({ onCountrySelect }: { onCountrySelect: (name: string) => void }) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [countries, setCountries] = useState<GeoJSONFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/countries.json')
      .then(response => response.json())
      .then((topology: any) => {
        // Convert TopoJSON to GeoJSON
        const countriesObject = topology.objects.countries;
        const geojson: any = feature(topology, countriesObject);
        setCountries(geojson.features as GeoJSONFeature[]);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading country data:', error);
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="relative w-full h-screen">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background">
          <p className="text-xs text-primary text-glow tracking-wider">LOADING WORLD MAP...</p>
        </div>
      )}
      
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={0.8} color="#ff0000" />
        <pointLight position={[-10, -10, -10]} intensity={0.4} color="#660000" />
        <directionalLight position={[5, 5, 5]} intensity={0.5} color="#ff3333" />
        
        <EarthGlobe 
          countries={countries}
          onCountryHover={setHoveredCountry} 
          onCountrySelect={onCountrySelect} 
        />
        
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={2.5}
          maxDistance={6}
          rotateSpeed={0.5}
        />
      </Canvas>
      
      {hoveredCountry && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-card/90 border-2 border-primary px-6 py-3 text-glow animate-fade-in z-20">
          <p className="text-xs text-primary tracking-wider">{hoveredCountry}</p>
        </div>
      )}
    </div>
  );
}
