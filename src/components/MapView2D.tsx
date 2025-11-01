import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

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

interface Aircraft {
  id: string;
  latitude: number;
  longitude: number;
}

export default function MapView2D({ selectedCountry }: MapView2DProps) {
  const [countries, setCountries] = useState<GeoJSONFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warLevel, setWarLevel] = useState(1);
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

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
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
          
          {/* Circular radar display around selected country */}
          {selectedCountry && countryCentroids[selectedCountry] && (() => {
            const [cx, cy] = projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight);
            const radarRadius = 60;
            const rings = 6;
            const degrees = [0, 45, 90, 135, 180, 225, 270, 315];
            
            return (
              <g>
                {/* Dark green transparent background */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radarRadius + 5}
                  fill="rgba(0, 50, 0, 0.4)"
                  opacity="0.8"
                  style={{ filter: "blur(2px)" }}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={radarRadius}
                  fill="rgba(0, 30, 0, 0.6)"
                  opacity="0.9"
                />
                
                {/* Concentric rings */}
                {Array.from({ length: rings }).map((_, i) => {
                  const r = ((i + 1) / rings) * radarRadius;
                  return (
                    <circle
                      key={`ring-${i}`}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="0.3"
                      opacity="0.25"
                    />
                  );
                })}
                
                {/* Grid lines (radials) */}
                {degrees.map((deg) => {
                  const rad = (deg * Math.PI) / 180;
                  const x2 = cx + Math.sin(rad) * radarRadius;
                  const y2 = cy - Math.cos(rad) * radarRadius;
                  return (
                    <line
                      key={`radial-${deg}`}
                      x1={cx}
                      y1={cy}
                      x2={x2}
                      y2={y2}
                      stroke="#00ff00"
                      strokeWidth="0.3"
                      opacity="0.25"
                    />
                  );
                })}
                
                {/* Outer circle with glow */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radarRadius}
                  fill="none"
                  stroke="#00ff00"
                  strokeWidth="1.5"
                  opacity="0.7"
                  style={{ filter: "drop-shadow(0 0 8px #00ff00)" }}
                />
                
                {/* Enhanced rotating sweep with fade trail */}
                <defs>
                  <radialGradient id="sweepTrailGradient">
                    <stop offset="0%" stopColor={warLevel >= 3 ? "#ff0000" : "#00ff00"} stopOpacity={0.3 + warLevel * 0.15} />
                    <stop offset="30%" stopColor={warLevel >= 3 ? "#ff0000" : "#00ff00"} stopOpacity={0.2 + warLevel * 0.1} />
                    <stop offset="60%" stopColor={warLevel >= 3 ? "#ff0000" : "#00ff00"} stopOpacity={0.1 + warLevel * 0.05} />
                    <stop offset="100%" stopColor={warLevel >= 3 ? "#ff0000" : "#00ff00"} stopOpacity="0" />
                  </radialGradient>
                </defs>
                
                {/* Multiple sweep trails for higher levels */}
                {Array.from({ length: warLevel }).map((_, idx) => (
                  <path
                    key={`sweep-${idx}`}
                    d={`M ${cx} ${cy} L ${cx} ${cy - radarRadius} A ${radarRadius} ${radarRadius} 0 0 0 ${cx - radarRadius * Math.sin(Math.PI * 0.4)} ${cy - radarRadius * Math.cos(Math.PI * 0.4)} Z`}
                    fill="url(#sweepTrailGradient)"
                    opacity={0.4 / (idx + 1)}
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={`${idx * (360 / warLevel)} ${cx} ${cy}`}
                      to={`${360 + idx * (360 / warLevel)} ${cx} ${cy}`}
                      dur={`${5 - warLevel}s`}
                      repeatCount="indefinite"
                    />
                  </path>
                ))}
                
                {/* Primary sweep lines (in front) - drawn LAST */}
                {Array.from({ length: warLevel }).map((_, idx) => (
                  <line
                    key={`line-${idx}`}
                    x1={cx}
                    y1={cy}
                    x2={cx}
                    y2={cy - radarRadius}
                    stroke={warLevel >= 4 ? "#ff0000" : "#00ff00"}
                    strokeWidth={1 + warLevel * 0.3}
                    opacity="1"
                    style={{ filter: `drop-shadow(0 0 ${4 + warLevel * 2}px ${warLevel >= 4 ? "#ff0000" : "#00ff00"})` }}
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={`${idx * (360 / warLevel)} ${cx} ${cy}`}
                      to={`${360 + idx * (360 / warLevel)} ${cx} ${cy}`}
                      dur={`${5 - warLevel}s`}
                      repeatCount="indefinite"
                    />
                  </line>
                ))}
                
                {/* Center dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="3"
                  fill="#00ff00"
                  opacity="1"
                  style={{ filter: "drop-shadow(0 0 4px #00ff00)" }}
                />
              </g>
            );
          })()}
          
          {/* Aircraft positions with war-level based styling */}
          {aircraft.map((plane) => {
            const [x, y] = projectToSVG(plane.longitude, plane.latitude, viewBoxWidth, viewBoxHeight);
            const pulseSize = 6 + warLevel * 2;
            const coreSize = 3 + warLevel * 0.5;
            return (
              <g key={plane.id} transform={`translate(${x}, ${y})`}>
                <circle 
                  cx="0" 
                  cy="0" 
                  r={pulseSize} 
                  fill={warLevel >= 4 ? "#ff0000" : "#ff3333"} 
                  opacity={0.2 + warLevel * 0.1} 
                  className="animate-pulse" 
                  style={{ filter: warLevel >= 3 ? `drop-shadow(0 0 ${warLevel * 2}px #ff0000)` : undefined }}
                />
                <circle cx="0" cy="0" r={coreSize} fill="#ff3333" opacity={0.7 + warLevel * 0.05} />
                <foreignObject x="-10" y="-10" width="20" height="20">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plane 
                      size={12 + warLevel * 2} 
                      color="#ffffff" 
                      fill={warLevel >= 4 ? "#ff0000" : "#ff3333"}
                      style={{ filter: warLevel >= 4 ? 'drop-shadow(0 0 4px #ff0000)' : undefined }}
                    />
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

      {/* War Intensity Level Buttons */}
      <div className="absolute bottom-8 right-8 bg-card/95 border-2 border-primary px-6 py-4 z-20 animate-scale-in">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <div 
              className="w-2 h-2 rounded-full animate-pulse" 
              style={{ backgroundColor: warLevel >= 4 ? '#ff0000' : '#00ff00' }}
            />
            <p 
              className="text-xs tracking-wider font-mono"
              style={{ color: warLevel >= 4 ? '#ff0000' : '#00ff00' }}
            >
              WAR INTENSITY: LEVEL {warLevel}
            </p>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <Button
                key={level}
                onClick={() => setWarLevel(level)}
                className={`w-12 h-12 text-xs font-mono border-2 transition-all ${
                  warLevel === level
                    ? level >= 4 
                      ? 'bg-[#ff0000] border-[#ff0000] text-white shadow-[0_0_20px_rgba(255,0,0,0.8)]' 
                      : 'bg-[#00ff00] border-[#00ff00] text-black shadow-[0_0_20px_rgba(0,255,0,0.8)]'
                    : 'bg-card border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary'
                }`}
              >
                {level}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
