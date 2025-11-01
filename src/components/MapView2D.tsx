import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Slider } from './ui/slider';
import { HelpCircle, Plane } from 'lucide-react';
import { feature } from 'topojson-client';

interface MapView2DProps {
  selectedCountry: string;
}

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

interface ActiveAttack {
  id: string;
  fromCountry: string;
  toCountry: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  startTime: number;
  type: 'invasion' | 'battle' | 'aerial_assault' | 'naval_assault' | 'nuclear_strike';
  strength: number;
}

interface Aircraft {
  id: string;
  latitude: number;
  longitude: number;
}

export default function MapView2D({ selectedCountry }: MapView2DProps) {
  const [countries, setCountries] = useState<GeoJSONFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warIntensity, setWarIntensity] = useState([0]);
  const [activeAttacks, setActiveAttacks] = useState<ActiveAttack[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);

  useEffect(() => {
    fetch('/countries.json')
      .then(response => response.json())
      .then((topology: any) => {
        const countriesObject = topology.objects.countries;
        const geojson: any = feature(topology, countriesObject);
        setCountries(geojson.features as GeoJSONFeature[]);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading country data:', error);
        setIsLoading(false);
      });

    fetch('/aircraft-positions.json')
      .then(response => response.json())
      .then((data: { aircraft: Aircraft[] }) => {
        setAircraft(data.aircraft);
      })
      .catch(error => {
        console.error('Error loading aircraft data:', error);
      });
  }, []);

  // Calculate country centroids for beam targeting
  const countryCentroids = useMemo(() => {
    const centroids: { [key: string]: [number, number] } = {};
    countries.forEach((country) => {
      const { geometry, properties } = country;
      let allCoords: number[][] = [];
      
      if (geometry.type === 'Polygon') {
        allCoords = geometry.coordinates[0] as number[][];
      } else if (geometry.type === 'MultiPolygon') {
        allCoords = (geometry.coordinates[0][0] as number[][]);
      }
      
      if (allCoords.length > 0) {
        const avgLng = allCoords.reduce((sum, coord) => sum + coord[0], 0) / allCoords.length;
        const avgLat = allCoords.reduce((sum, coord) => sum + coord[1], 0) / allCoords.length;
        centroids[properties.name] = [avgLng, avgLat];
      }
    });
    return centroids;
  }, [countries]);

  // War attack generation based on intensity
  useEffect(() => {
    if (warIntensity[0] === 0) {
      setActiveAttacks([]);
      return;
    }

    const countryNames = Object.keys(countryCentroids);
    if (countryNames.length < 2) return;

    const attackTypes: ActiveAttack['type'][] = ['invasion', 'battle', 'aerial_assault', 'naval_assault'];
    
    // Add nuclear strikes at very high intensity
    if (warIntensity[0] > 90) {
      attackTypes.push('nuclear_strike');
    }

    const interval = setInterval(() => {
      const numAttacks = Math.floor(warIntensity[0] / 15) + 1;
      const newAttacks: ActiveAttack[] = [];

      for (let i = 0; i < numAttacks; i++) {
        const isFromSelected = Math.random() < 0.4;
        const fromCountry = isFromSelected 
          ? selectedCountry 
          : countryNames[Math.floor(Math.random() * countryNames.length)];
        
        let toCountry = countryNames[Math.floor(Math.random() * countryNames.length)];
        while (toCountry === fromCountry) {
          toCountry = countryNames[Math.floor(Math.random() * countryNames.length)];
        }

        if (countryCentroids[fromCountry] && countryCentroids[toCountry]) {
          const attackType = attackTypes[Math.floor(Math.random() * attackTypes.length)];
          newAttacks.push({
            id: `attack-${Date.now()}-${i}`,
            fromCountry,
            toCountry,
            fromCoords: countryCentroids[fromCountry],
            toCoords: countryCentroids[toCountry],
            startTime: Date.now(),
            type: attackType,
            strength: Math.floor(Math.random() * 30) + 70,
          });
        }
      }

      setActiveAttacks((prev) => {
        const now = Date.now();
        const filtered = prev.filter((attack) => now - attack.startTime < 3000);
        return [...filtered, ...newAttacks];
      });
    }, Math.max(200, 1200 - warIntensity[0] * 8));

    return () => clearInterval(interval);
  }, [warIntensity, countryCentroids, selectedCountry]);

  // Convert lat/lng to SVG coordinates using Equirectangular projection
  const projectToSVG = (lng: number, lat: number, width: number, height: number) => {
    const x = ((lng + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return [x, y];
  };

  const convertCoordinatesToPath = (coordinates: number[][], width: number, height: number): string[] => {
    if (coordinates.length === 0) return [];
    
    // Split polygons at antimeridian crossings
    const paths: string[] = [];
    let currentSegment: number[][] = [];
    
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      
      if (i > 0) {
        const [lng1] = coordinates[i - 1];
        const [lng2] = coord;
        
        // If there's a jump greater than 170 degrees, split the polygon
        if (Math.abs(lng2 - lng1) > 170) {
          // Finish current segment
          if (currentSegment.length > 1) {
            const pathParts = currentSegment.map((c, index) => {
              const [lng, lat] = c;
              const [x, y] = projectToSVG(lng, lat, width, height);
              return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
            });
            paths.push(pathParts.join(' ') + ' Z');
          }
          // Start new segment
          currentSegment = [coord];
          continue;
        }
      }
      
      currentSegment.push(coord);
    }
    
    // Add the final segment
    if (currentSegment.length > 1) {
      const pathParts = currentSegment.map((coord, index) => {
        const [lng, lat] = coord;
        const [x, y] = projectToSVG(lng, lat, width, height);
        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      });
      paths.push(pathParts.join(' ') + ' Z');
    }
    
    return paths;
  };

  const renderCountry = (country: GeoJSONFeature, width: number, height: number) => {
    const countryName = country.properties.name;
    const isSelected = countryName === selectedCountry;
    const { geometry } = country;
    
    const allPaths: string[] = [];
    
    if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach((ring) => {
        allPaths.push(...convertCoordinatesToPath(ring as number[][], width, height));
      });
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygon) => {
        polygon.forEach((ring) => {
          allPaths.push(...convertCoordinatesToPath(ring as number[][], width, height));
        });
      });
    }
    
    return allPaths
      .filter(path => path !== '')
      .map((path, index) => (
        <path
          key={`${countryName}-${index}`}
          d={path}
          fill="none"
          stroke="#ff3333"
          strokeWidth={isSelected ? 2.5 : 1.2}
          strokeOpacity={isSelected ? 1 : 0.6}
          className={isSelected ? "animate-pulse" : ""}
          style={isSelected ? {
            filter: "drop-shadow(0 0 8px #ff3333)"
          } : {}}
        />
      ));
  };

  const viewBoxWidth = 1000;
  const viewBoxHeight = 500;

  const getAttackVisual = (attack: ActiveAttack) => {
    const [x1, y1] = projectToSVG(attack.fromCoords[0], attack.fromCoords[1], viewBoxWidth, viewBoxHeight);
    const [x2, y2] = projectToSVG(attack.toCoords[0], attack.toCoords[1], viewBoxWidth, viewBoxHeight);
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Create curved path for missiles
    const curvature = distance * 0.25;
    const midX = (x1 + x2) / 2 - (dy / distance) * curvature;
    const midY = (y1 + y2) / 2 + (dx / distance) * curvature;
    const pathData = `M ${x1},${y1} Q ${midX},${midY} ${x2},${y2}`;
    
    switch (attack.type) {
      case 'nuclear_strike':
        return (
          <g key={attack.id}>
            {/* Missile trail with glow */}
            <path
              d={pathData}
              fill="none"
              stroke="url(#nuclearGradient)"
              strokeWidth="4"
              opacity="0.95"
              style={{ filter: "drop-shadow(0 0 12px #00ff00)" }}
            >
              <animate attributeName="stroke-dasharray" from="0,1000" to="1000,0" dur="1.2s" fill="freeze" />
              <animate attributeName="opacity" from="1" to="0" begin="1.2s" dur="0.3s" fill="freeze" />
            </path>
            {/* Missile head */}
            <circle r="4" fill="#ffff00" opacity="0.95">
              <animateMotion path={pathData} dur="1.2s" fill="freeze" />
              <animate attributeName="opacity" from="0.95" to="0" begin="1.2s" dur="0.1s" fill="freeze" />
            </circle>
            {/* Initial flash */}
            <circle cx={x2} cy={y2} r="0" fill="#ffffff" opacity="0">
              <animate attributeName="r" from="0" to="50" begin="1.2s" dur="0.2s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;0" begin="1.2s" dur="0.2s" fill="freeze" />
            </circle>
            {/* Main nuclear explosion */}
            <circle cx={x2} cy={y2} r="0" fill="#ffaa00" opacity="0">
              <animate attributeName="r" from="0" to="40" begin="1.4s" dur="0.4s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;0.8;0" begin="1.4s" dur="1.2s" fill="freeze" />
            </circle>
            {/* Secondary explosion ring */}
            <circle cx={x2} cy={y2} r="40" fill="none" stroke="#ff0000" strokeWidth="4" opacity="0">
              <animate attributeName="r" from="40" to="80" begin="1.8s" dur="0.6s" fill="freeze" />
              <animate attributeName="opacity" values="0;1;0" begin="1.8s" dur="0.6s" fill="freeze" />
            </circle>
            {/* Shockwave */}
            <circle cx={x2} cy={y2} r="80" fill="none" stroke="#ffff00" strokeWidth="2" opacity="0">
              <animate attributeName="r" from="80" to="120" begin="2.2s" dur="0.5s" fill="freeze" />
              <animate attributeName="opacity" values="0;0.7;0" begin="2.2s" dur="0.5s" fill="freeze" />
            </circle>
            {/* Debris particles */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
              const rad = (angle * Math.PI) / 180;
              const endX = x2 + Math.cos(rad) * 60;
              const endY = y2 + Math.sin(rad) * 60;
              return (
                <line
                  key={`debris-${angle}`}
                  x1={x2}
                  y1={y2}
                  x2={x2}
                  y2={y2}
                  stroke="#ff6600"
                  strokeWidth="2"
                  opacity="0"
                >
                  <animate attributeName="x2" from={x2} to={endX} begin="1.5s" dur="0.8s" fill="freeze" />
                  <animate attributeName="y2" from={y2} to={endY} begin="1.5s" dur="0.8s" fill="freeze" />
                  <animate attributeName="opacity" values="0;1;0" begin="1.5s" dur="0.8s" fill="freeze" />
                </line>
              );
            })}
          </g>
        );
      
      case 'invasion':
        return (
          <g key={attack.id}>
            {/* Multiple attack waves */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <g key={`${attack.id}-wave-${i}`}>
                <path
                  d={pathData}
                  fill="none"
                  stroke="#ff3333"
                  strokeWidth="2.5"
                  strokeDasharray="8,4"
                  opacity="0"
                  style={{ filter: "drop-shadow(0 0 6px #ff0000)" }}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="1000"
                    to="0"
                    begin={`${i * 0.25}s`}
                    dur="1.8s"
                    fill="freeze"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0.9;0.9;0"
                    begin={`${i * 0.25}s`}
                    dur="2s"
                    fill="freeze"
                  />
                </path>
                {/* Tank/unit marker */}
                <rect
                  x={x1 - 3}
                  y={y1 - 3}
                  width="6"
                  height="6"
                  fill="#ff0000"
                  opacity="0"
                >
                  <animateMotion path={pathData} begin={`${i * 0.25}s`} dur="1.8s" fill="freeze" />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    begin={`${i * 0.25}s`}
                    dur="2s"
                    fill="freeze"
                  />
                </rect>
                {/* Impact burst */}
                <circle cx={x2} cy={y2} r="0" fill="#ff3333" opacity="0">
                  <animate
                    attributeName="r"
                    from="0"
                    to="18"
                    begin={`${i * 0.25 + 1.8}s`}
                    dur="0.3s"
                    fill="freeze"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;0"
                    begin={`${i * 0.25 + 1.8}s`}
                    dur="0.3s"
                    fill="freeze"
                  />
                </circle>
                {/* Smoke trail */}
                {[0, 1, 2, 3].map((j) => (
                  <circle
                    key={`smoke-${j}`}
                    cx={x2 - j * 15}
                    cy={y2}
                    r="4"
                    fill="#666666"
                    opacity="0"
                  >
                    <animate
                      attributeName="r"
                      from="4"
                      to="10"
                      begin={`${i * 0.25 + 1.5 + j * 0.1}s`}
                      dur="0.6s"
                      fill="freeze"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.5;0"
                      begin={`${i * 0.25 + 1.5 + j * 0.1}s`}
                      dur="0.6s"
                      fill="freeze"
                    />
                  </circle>
                ))}
              </g>
            ))}
          </g>
        );
      
      case 'aerial_assault':
        return (
          <g key={attack.id}>
            {/* Flight path trail */}
            <path
              d={pathData}
              fill="none"
              stroke="url(#aerialGradient)"
              strokeWidth="2"
              strokeDasharray="20,10"
              opacity="0.7"
              style={{ filter: "drop-shadow(0 0 4px #ff6600)" }}
            >
              <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="1.5s" fill="freeze" />
              <animate attributeName="opacity" from="0.7" to="0" begin="1.5s" dur="0.3s" fill="freeze" />
            </path>
            {/* Multiple bombers */}
            {[0, 0.3, 0.6].map((delay, i) => (
              <g key={`bomber-${i}`}>
                {/* Bomber */}
                <polygon
                  points="-4,0 4,0 0,-8"
                  fill="#ff6600"
                  opacity="0"
                  style={{ filter: "drop-shadow(0 0 4px #ff3333)" }}
                >
                  <animateMotion path={pathData} begin={`${delay}s`} dur="1.5s" fill="freeze" />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    begin={`${delay}s`}
                    dur="1.8s"
                    fill="freeze"
                  />
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 0 0`}
                    to={`${Math.atan2(dy, dx) * (180 / Math.PI)} 0 0`}
                    dur="0.1s"
                    fill="freeze"
                  />
                </polygon>
                {/* Bombs */}
                {[0, 0.2, 0.4].map((bombDelay, j) => (
                  <circle
                    key={`bomb-${j}`}
                    r="2.5"
                    fill="#ff3333"
                    opacity="0"
                  >
                    <animateMotion path={pathData} begin={`${delay + bombDelay}s`} dur={`${1.5 - bombDelay}s`} fill="freeze" />
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      begin={`${delay + bombDelay}s`}
                      dur={`${1.8 - bombDelay}s`}
                      fill="freeze"
                    />
                  </circle>
                ))}
              </g>
            ))}
            {/* Continuous explosions */}
            <circle cx={x2} cy={y2} r="0" fill="#ff3333" opacity="0">
              <animate attributeName="r" values="0;15;0" dur="0.5s" begin="0.8s" repeatCount="3" />
              <animate attributeName="opacity" values="0;0.9;0" dur="0.5s" begin="0.8s" repeatCount="3" />
            </circle>
            <circle cx={x2} cy={y2} r="15" fill="none" stroke="#ff6600" strokeWidth="3" opacity="0">
              <animate attributeName="r" values="15;30;45" dur="0.5s" begin="0.8s" repeatCount="3" />
              <animate attributeName="opacity" values="0;0.8;0" dur="0.5s" begin="0.8s" repeatCount="3" />
            </circle>
          </g>
        );
      
      case 'naval_assault':
        return (
          <g key={attack.id}>
            {/* Wave path */}
            <path
              d={pathData}
              fill="none"
              stroke="url(#navalGradient)"
              strokeWidth="3"
              strokeDasharray="20,10"
              opacity="0"
              style={{ filter: "drop-shadow(0 0 8px #0088ff)" }}
            >
              <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="2s" fill="freeze" />
              <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2.3s" fill="freeze" />
            </path>
            {/* Ship */}
            <rect
              x={-6}
              y={-4}
              width="12"
              height="8"
              fill="#0088ff"
              opacity="0"
              rx="2"
              style={{ filter: "drop-shadow(0 0 4px #0088ff)" }}
            >
              <animateMotion path={pathData} dur="2s" fill="freeze" />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                dur="2.3s"
                fill="freeze"
              />
            </rect>
            {/* Naval bombardment */}
            {[0, 0.4, 0.8, 1.2].map((delay, i) => (
              <g key={`shell-${i}`}>
                <ellipse rx="2" ry="3" fill="#ff6600" opacity="0">
                  <animateMotion path={pathData} begin={`${delay}s`} dur={`${2 - delay}s`} fill="freeze" />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    begin={`${delay}s`}
                    dur={`${2.3 - delay}s`}
                    fill="freeze"
                  />
                </ellipse>
                <circle cx={x2} cy={y2} r="0" fill="#0088ff" opacity="0">
                  <animate
                    attributeName="r"
                    from="0"
                    to="22"
                    begin={`${2 + delay * 0.5}s`}
                    dur="0.4s"
                    fill="freeze"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0.9;0"
                    begin={`${2 + delay * 0.5}s`}
                    dur="0.4s"
                    fill="freeze"
                  />
                </circle>
              </g>
            ))}
            {/* Water splash effects */}
            {[0, 60, 120, 180, 240, 300].map((angle) => {
              const rad = (angle * Math.PI) / 180;
              const splashX = x2 + Math.cos(rad) * 30;
              const splashY = y2 + Math.sin(rad) * 30;
              return (
                <circle
                  key={`splash-${angle}`}
                  cx={x2}
                  cy={y2}
                  r="3"
                  fill="#66ccff"
                  opacity="0"
                >
                  <animate attributeName="cx" from={x2} to={splashX} begin="2s" dur="0.5s" fill="freeze" />
                  <animate attributeName="cy" from={y2} to={splashY} begin="2s" dur="0.5s" fill="freeze" />
                  <animate attributeName="opacity" values="0;0.8;0" begin="2s" dur="0.5s" fill="freeze" />
                </circle>
              );
            })}
          </g>
        );
      
      default: // battle
        return (
          <g key={attack.id}>
            {/* Battle line with energy pulses */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#ff0000"
              strokeWidth="3"
              opacity="0"
              strokeDasharray="10,5"
              style={{ filter: "drop-shadow(0 0 6px #ff0000)" }}
            >
              <animate attributeName="stroke-dashoffset" from="0" to="30" dur="0.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.8;0.8;0" dur="2.5s" fill="freeze" />
            </line>
            {/* Energy pulses traveling both ways */}
            {[0, 0.5, 1, 1.5].map((delay) => (
              <circle key={`pulse-${delay}`} cx={x1} cy={y1} r="5" fill="#ff3333" opacity="0">
                <animate attributeName="cx" from={x1} to={x2} begin={`${delay}s`} dur="0.8s" fill="freeze" />
                <animate attributeName="cy" from={y1} to={y2} begin={`${delay}s`} dur="0.8s" fill="freeze" />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  begin={`${delay}s`}
                  dur="0.8s"
                  fill="freeze"
                />
              </circle>
            ))}
            {/* Continuous small explosions at midpoint */}
            <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r="0" fill="#ff6600" opacity="0">
              <animate attributeName="r" values="0;12;0" dur="0.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.9;0" dur="0.4s" repeatCount="indefinite" />
            </circle>
          </g>
        );
    }
  };

  const shouldShake = activeAttacks.length > 5 || activeAttacks.some(a => a.type === 'nuclear_strike');
  const hasNuclear = activeAttacks.some(a => a.type === 'nuclear_strike');

  return (
    <div className={`relative w-full h-screen bg-background overflow-hidden ${shouldShake ? 'animate-shake' : ''}`}>
      {/* Nuclear flash overlay */}
      {hasNuclear && (
        <div className="absolute inset-0 bg-white pointer-events-none z-30 animate-pulse opacity-20" />
      )}
      {/* Subtle scanline effect */}
      <div className="absolute inset-0 pointer-events-none opacity-5 crt-effect"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.15) 2px, rgba(255, 0, 0, 0.15) 4px)'
        }}
      />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background">
          <p className="text-xs text-primary text-glow tracking-wider">LOADING MAP DATA...</p>
        </div>
      )}
      
      {/* Map container with animation */}
      <div className="absolute inset-0 flex items-center justify-center p-8 animate-fade-in">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-full"
          style={{ maxHeight: '100%', maxWidth: '100%' }}
        >
          
          {/* Subtle grid overlay and gradients */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ff3333" strokeWidth="0.5" opacity="0.15"/>
            </pattern>
            <linearGradient id="nuclearGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00ff00" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#ffff00" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ff0000" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="aerialGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff6600" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ff0000" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="navalGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0088ff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#0044aa" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="radarGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00ff00" stopOpacity="0" />
              <stop offset="100%" stopColor="#00ff00" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          
          {/* Render all countries */}
          {countries.map((country) => renderCountry(country, viewBoxWidth, viewBoxHeight))}
          
          {/* Radar scanning effect around selected country */}
          {selectedCountry && countryCentroids[selectedCountry] && (
            <g>
              {/* Radar circles */}
              <circle
                cx={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]}
                cy={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1]}
                r="0"
                fill="none"
                stroke="#00ff00"
                strokeWidth="2"
                opacity="0.6"
              >
                <animate attributeName="r" from="0" to="150" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]}
                cy={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1]}
                r="0"
                fill="none"
                stroke="#00ff00"
                strokeWidth="2"
                opacity="0.6"
              >
                <animate attributeName="r" from="0" to="150" dur="3s" begin="1s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0" dur="3s" begin="1s" repeatCount="indefinite" />
              </circle>
              <circle
                cx={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]}
                cy={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1]}
                r="0"
                fill="none"
                stroke="#00ff00"
                strokeWidth="2"
                opacity="0.6"
              >
                <animate attributeName="r" from="0" to="150" dur="3s" begin="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0" dur="3s" begin="2s" repeatCount="indefinite" />
              </circle>
              
              {/* Rotating radar sweep */}
              <line
                x1={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]}
                y1={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1]}
                x2={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]}
                y2={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1] - 150}
                stroke="url(#radarGradient)"
                strokeWidth="40"
                opacity="0.4"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`0 ${projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]} ${projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1]}`}
                  to={`360 ${projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]} ${projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1]}`}
                  dur="4s"
                  repeatCount="indefinite"
                />
              </line>
              
              {/* Center dot */}
              <circle
                cx={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[0]}
                cy={projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight)[1]}
                r="5"
                fill="#00ff00"
                opacity="0.9"
              />
            </g>
          )}
          
          {/* Active attacks */}
          {activeAttacks.map((attack) => getAttackVisual(attack))}
          
          {/* Aircraft positions */}
          {aircraft.map((plane) => {
            const [x, y] = projectToSVG(plane.longitude, plane.latitude, viewBoxWidth, viewBoxHeight);
            return (
              <g key={plane.id} transform={`translate(${x}, ${y})`}>
                <circle cx="0" cy="0" r="8" fill="#ff0000" opacity="0.3" className="animate-pulse" />
                <circle cx="0" cy="0" r="4" fill="#ff3333" opacity="0.8" />
                <foreignObject x="-10" y="-10" width="20" height="20">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plane size={14} color="#ffffff" fill="#ff0000" />
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Country indicator in top-right corner */}
      <div className="absolute top-4 right-4 bg-card/95 border-2 border-primary px-6 py-3 flex items-center gap-2 z-20 animate-scale-in">
        <p className="text-xs text-primary tracking-wider text-glow">
          NATION: {selectedCountry.toUpperCase()}
        </p>
      </div>

      {/* Help button with modal */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 left-4 bg-card/95 border-2 border-primary hover:bg-primary/20 hover:border-war-glow transition-all z-20 animate-scale-in"
          >
            <HelpCircle className="h-5 w-5 text-primary" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card/95 border-2 border-primary max-w-md backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="text-primary tracking-wider text-glow">WAR PROTOCOL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              Welcome to the War Protocol simulation. You have selected your nation and are now viewing the global theater of operations.
            </p>
            <p>
              This strategic interface allows you to monitor your country's position and prepare for engagement.
            </p>
            <p className="text-xs text-primary tracking-wider text-glow mt-4">
              PREPARE FOR WAR.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Red glow at edges */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-war-blood/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-war-blood/10 to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-war-blood/10 to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-war-blood/10 to-transparent" />
      </div>

      {/* Radar sensitivity slider */}
      <div className="absolute bottom-8 right-8 bg-card/95 border-2 border-[#00ff00] px-6 py-4 z-20 animate-scale-in">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00ff00] animate-pulse" />
            <p className="text-xs text-[#00ff00] tracking-wider font-mono">
              RADAR SENSITIVITY
            </p>
            <span className="text-xs text-[#00ff00] font-mono ml-auto">{warIntensity[0]}%</span>
          </div>
          <Slider
            value={warIntensity}
            onValueChange={setWarIntensity}
            max={100}
            step={1}
            className="w-48"
          />
        </div>
      </div>
    </div>
  );
}
