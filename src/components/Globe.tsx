import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { Button } from '@/components/ui/button';

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

interface Capital {
  name: string;
  country: string;
  lat: number;
  lng: number;
}

const MAJOR_CAPITALS: Capital[] = [
  { name: "Washington D.C.", country: "USA", lat: 38.9072, lng: -77.0369 },
  { name: "London", country: "UK", lat: 51.5074, lng: -0.1278 },
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { name: "Berlin", country: "Germany", lat: 52.5200, lng: 13.4050 },
  { name: "Moscow", country: "Russia", lat: 55.7558, lng: 37.6173 },
  { name: "Beijing", country: "China", lat: 39.9042, lng: 116.4074 },
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
  { name: "New Delhi", country: "India", lat: 28.6139, lng: 77.2090 },
  { name: "Brasília", country: "Brazil", lat: -15.8267, lng: -47.9218 },
  { name: "Canberra", country: "Australia", lat: -35.2809, lng: 149.1300 },
  { name: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357 },
  { name: "Johannesburg", country: "South Africa", lat: -26.2041, lng: 28.0473 },
  { name: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332 },
  { name: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
  { name: "Ottawa", country: "Canada", lat: 45.4215, lng: -75.6972 },
  { name: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964 },
  { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { name: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.9780 },
  { name: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
  { name: "Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784 },
];

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

  // Create a filled mesh geometry for the entire country area
  const geometry = useMemo(() => {
    if (points.length < 3) return null;
    
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Add all points as vertices
    points.forEach(point => {
      vertices.push(point.x, point.y, point.z);
    });
    
    // Create triangles using fan triangulation
    for (let i = 1; i < points.length - 1; i++) {
      indices.push(0, i, i + 1);
    }
    
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    
    return geo;
  }, [points]);
  
  if (points.length < 2) return null;
  
  return (
    <group>
      {/* Invisible mesh for hover/click detection over entire country */}
      {geometry && (
        <mesh 
          geometry={geometry}
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
        color={isHovered ? "#ff6666" : "#ff3333"}
        lineWidth={isHovered ? 3 : 2}
        transparent
        opacity={1}
      />
    </group>
  );
}

function CapitalMarker({ capital, radius }: { capital: Capital; radius: number }) {
  const position = useMemo(() => {
    return latLngToVector3(capital.lat, capital.lng, radius + 0.01);
  }, [capital, radius]);

  const labelPosition = useMemo(() => {
    return latLngToVector3(capital.lat, capital.lng, radius + 0.08);
  }, [capital, radius]);

  return (
    <group position={position}>
      <Sphere args={[0.015, 16, 16]}>
        <meshBasicMaterial color="#00ffff" />
      </Sphere>
      {/* Glow effect */}
      <Sphere args={[0.025, 16, 16]}>
        <meshBasicMaterial color="#00ccff" transparent opacity={0.7} />
      </Sphere>
      {/* Capital name label */}
      <Text
        position={[labelPosition.x - position.x, labelPosition.y - position.y, labelPosition.z - position.z]}
        fontSize={0.04}
        color="#00ffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.003}
        outlineColor="#000000"
      >
        {capital.name}
      </Text>
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
      {/* Globe sphere with much brighter ocean */}
      <Sphere ref={globeRef} args={[radius, 64, 64]}>
        <meshStandardMaterial
          color="#0a2040"
          roughness={0.6}
          metalness={0.3}
          emissive="#051a35"
          emissiveIntensity={0.6}
        />
      </Sphere>
      
      {/* Brighter blue glow effect */}
      <Sphere args={[radius + 0.02, 64, 64]}>
        <meshBasicMaterial
          color="#1a4080"
          transparent
          opacity={0.4}
          side={THREE.BackSide}
        />
      </Sphere>
      
      {/* Country borders */}
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
      
      {/* Brighter grid overlay */}
      <Sphere args={[radius + 0.001, 32, 32]}>
        <meshBasicMaterial
          color="#ff3333"
          wireframe
          transparent
          opacity={0.15}
        />
      </Sphere>

      {/* Capital city markers */}
      {MAJOR_CAPITALS.map((capital) => (
        <CapitalMarker key={capital.name} capital={capital} radius={radius} />
      ))}
    </group>
  );
}

export default function Globe({ onCountrySelect }: { onCountrySelect: (name: string) => void }) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countries, setCountries] = useState<GeoJSONFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleCountryClick = (name: string) => {
    setSelectedCountry(name);
  };

  const handleConfirmSelection = () => {
    if (selectedCountry) {
      onCountrySelect(selectedCountry);
    }
  };

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
    <div className="relative w-full h-screen bg-[#000000]">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background">
          <p className="text-xs text-primary text-glow tracking-wider">LOADING WORLD MAP...</p>
        </div>
      )}
      
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <color attach="background" args={['#000000']} />
        
        {/* Starfield background */}
        <Stars 
          radius={100} 
          depth={50} 
          count={5000} 
          factor={4} 
          saturation={0} 
          fade 
          speed={0.5}
        />
        
        <ambientLight intensity={0.9} />
        <pointLight position={[10, 10, 10]} intensity={3} color="#ff0000" />
        <pointLight position={[-10, -10, -10]} intensity={1.5} color="#ff3333" />
        <pointLight position={[0, 10, 0]} intensity={2} color="#ffffff" />
        <directionalLight position={[5, 5, 5]} intensity={1.8} color="#ff4444" />
        
        <EarthGlobe 
          countries={countries}
          onCountryHover={setHoveredCountry} 
          onCountrySelect={handleCountryClick} 
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
      
      {selectedCountry && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-20 animate-scale-in">
          <div className="bg-card/95 border-2 border-primary px-6 py-2">
            <p className="text-xs text-primary text-glow tracking-wider">
              SELECTED: {selectedCountry}
            </p>
          </div>
          <Button 
            onClick={handleConfirmSelection}
            className="bg-primary text-primary-foreground hover:bg-primary/90 border-2 border-primary px-8 py-4 text-xs tracking-wider font-bold"
          >
            CONFIRM SELECTION
          </Button>
        </div>
      )}
    </div>
  );
}
