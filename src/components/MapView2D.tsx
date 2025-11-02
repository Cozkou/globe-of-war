import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';

import { HelpCircle, Plane } from 'lucide-react';
import { feature } from 'topojson-client';
import { calculateBoundingBox, buildAircraftApiUrl } from '@/lib/country-bounds';

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
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  barometricAltitude: number | null;
  geometricAltitude: number | null;
  velocity: number | null;
  heading: number | null;
  verticalRate: number | null;
  onGround: boolean | null;
  timePosition: number | null;
  lastContact: number | null;
  squawk: string | null;
  spi: boolean | null;
  positionSource: number | null;
}

export default function MapView2D({ selectedCountry }: MapView2DProps) {
  const [countries, setCountries] = useState<GeoJSONFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warLevel, setWarLevel] = useState(1);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [enemyCountries, setEnemyCountries] = useState<string[]>([]);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [isAircraftLoading, setIsAircraftLoading] = useState(false);
  const [warIntensity, setWarIntensity] = useState(0); // 0-10 cycling value
  const [isHolding, setIsHolding] = useState(false);
  const [intensityDirection, setIntensityDirection] = useState(1); // 1 for up, -1 for down

  // Load country data
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
  }, []);

  // Fetch aircraft data when a country is selected
  useEffect(() => {
    if (!selectedCountry || countries.length === 0) {
      setAircraft([]);
      return;
    }

    // Find the selected country's geometry
    const country = countries.find(c => c.properties.name === selectedCountry);
    if (!country) {
      console.warn(`Country not found: ${selectedCountry}`);
      setAircraft([]);
      return;
    }

    // Calculate bounding box for the country
    try {
      const bbox = calculateBoundingBox(country.geometry as any);
      const apiUrl = buildAircraftApiUrl(bbox);
      
      console.log(`Fetching aircraft for ${selectedCountry}:`, bbox);
      setIsAircraftLoading(true);
      
      fetch(apiUrl)
        .then(response => response.json())
        .then((data: { success: boolean; data: Aircraft[]; count: number; error?: string }) => {
          setIsAircraftLoading(false);
          if (data.success && data.data) {
            // Filter out aircraft without valid coordinates
            const validAircraft = data.data.filter(
              a => a.latitude !== null && a.longitude !== null
            );
            console.log(`Loaded ${validAircraft.length} valid aircraft for ${selectedCountry}`);
            setAircraft(validAircraft);
          } else {
            console.error('Failed to load aircraft:', data.error || 'Unknown error');
            setAircraft([]);
          }
        })
        .catch(error => {
          console.error('Error loading aircraft data:', error);
          setIsAircraftLoading(false);
          setAircraft([]);
        });
    } catch (error) {
      console.error('Error calculating bounding box:', error);
      setIsAircraftLoading(false);
      setAircraft([]);
    }
  }, [selectedCountry, countries]);

  // Update war intensity while holding
  useEffect(() => {
    if (!isHolding) return;
    
    let animationFrame: number;
    
    const updateIntensity = () => {
      setWarIntensity(prev => {
        let next = prev + intensityDirection * 0.1; // Increase/decrease by 0.1
        
        // Reverse direction at boundaries
        if (next >= 10) {
          next = 10;
          setIntensityDirection(-1);
        } else if (next <= 0) {
          next = 0;
          setIntensityDirection(1);
        }
        
        return next;
      });
      
      animationFrame = requestAnimationFrame(updateIntensity);
    };
    
    animationFrame = requestAnimationFrame(updateIntensity);
    
    return () => cancelAnimationFrame(animationFrame);
  }, [isHolding, intensityDirection]);

  // Map intensity to war level (1-5)
  useEffect(() => {
    const level = Math.min(5, Math.max(1, Math.ceil(warIntensity / 2)));
    setWarLevel(level);
  }, [warIntensity]);

  // Select random enemy countries based on war level
  useEffect(() => {
    if (countries.length === 0 || !selectedCountry) return;
    
    const availableCountries = countries
      .map(c => c.properties.name)
      .filter(name => name !== selectedCountry);
    
    const numEnemies = warLevel; // Level 1 = 1 enemy, Level 5 = 5 enemies
    const shuffled = [...availableCountries].sort(() => Math.random() - 0.5);
    setEnemyCountries(shuffled.slice(0, numEnemies));
  }, [warLevel, countries, selectedCountry]);

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
          </defs>
          
          {/* Render all countries */}
          {countries.map((country) => renderCountry(country, viewBoxWidth, viewBoxHeight))}
          
          {/* Conflict visualizations between selected country and enemies */}
          {selectedCountry && countryCentroids[selectedCountry] && enemyCountries.map((enemyCountry, idx) => {
            if (!countryCentroids[enemyCountry]) return null;
            
            const [x1, y1] = projectToSVG(countryCentroids[selectedCountry][0], countryCentroids[selectedCountry][1], viewBoxWidth, viewBoxHeight);
            const [x2, y2] = projectToSVG(countryCentroids[enemyCountry][0], countryCentroids[enemyCountry][1], viewBoxWidth, viewBoxHeight);
            
            // Calculate control point for curved missile path
            const dx = x2 - x1;
            const dy = y2 - y1;
            const cx = x1 + dx / 2 - dy * 0.3;
            const cy = y1 + dy / 2 + dx * 0.3;
            
            const pathId = `missile-${idx}`;
            const missileDelay = `${idx * 0.8}s`;
            const missileDuration = 3 - warLevel * 0.3;
            const explosionStart = parseFloat(missileDelay) + missileDuration;
            
            return (
              <g key={`conflict-${enemyCountry}-${idx}`}>
                {/* Level 1-2: Warning lines */}
                {warLevel >= 1 && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={warLevel === 1 ? "#ffaa00" : "#ff6600"}
                    strokeWidth={warLevel === 1 ? "0.5" : "1"}
                    strokeDasharray={warLevel === 1 ? "5,5" : "3,3"}
                    opacity={warLevel === 1 ? 0.4 : 0.6}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to="100"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </line>
                )}
                
                {/* Level 2+: Curved missile trajectories */}
                {warLevel >= 2 && (
                  <>
                    <defs>
                      <path
                        id={pathId}
                        d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                        fill="none"
                      />
                    </defs>
                    
                    {/* Missile trail */}
                    <path
                      d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                      fill="none"
                      stroke={warLevel >= 4 ? "#ff0000" : "#ff8800"}
                      strokeWidth={warLevel >= 3 ? "2" : "1.5"}
                      opacity="0.7"
                      style={{ filter: `drop-shadow(0 0 ${warLevel * 2}px ${warLevel >= 4 ? "#ff0000" : "#ff8800"})` }}
                    />
                    
                    {/* Animated missile */}
                    <circle
                      r={warLevel >= 4 ? "4" : "3"}
                      fill={warLevel >= 4 ? "#ff0000" : "#ffff00"}
                      style={{ filter: `drop-shadow(0 0 ${warLevel * 3}px ${warLevel >= 4 ? "#ff0000" : "#ffff00"})` }}
                    >
                      <animateMotion
                        dur={`${missileDuration}s`}
                        repeatCount="indefinite"
                        begin={missileDelay}
                      >
                        <mpath href={`#${pathId}`} />
                      </animateMotion>
                    </circle>
                  </>
                )}
                
                {/* Level 3+: Explosion effects at target */}
                {warLevel >= 3 && (
                  <g>
                    {/* Multiple explosion rings */}
                    {[0, 1, 2].map((ringIdx) => (
                      <circle
                        key={`explosion-ring-${ringIdx}`}
                        cx={x2}
                        cy={y2}
                        r="0"
                        fill="none"
                        stroke={warLevel >= 5 ? "#ff0000" : "#ff6600"}
                        strokeWidth={warLevel >= 4 ? "3" : "2"}
                        opacity="0"
                      >
                        <animate
                          attributeName="r"
                          from="5"
                          to={warLevel >= 5 ? "40" : "25"}
                          dur="1.5s"
                          begin={`${explosionStart + ringIdx * 0.2}s`}
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          from="0.9"
                          to="0"
                          dur="1.5s"
                          begin={`${explosionStart + ringIdx * 0.2}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    ))}
                    
                    {/* Core explosion flash */}
                    <circle
                      cx={x2}
                      cy={y2}
                      r={warLevel >= 5 ? "12" : "8"}
                      fill={warLevel >= 5 ? "#ff0000" : "#ff8800"}
                      opacity="0"
                      style={{ filter: `blur(${warLevel}px)` }}
                    >
                      <animate
                        attributeName="opacity"
                        values="0;1;0"
                        dur="0.3s"
                        begin={`${explosionStart}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                )}
                
                {/* Level 4+: Debris particles */}
                {warLevel >= 4 && (
                  <g>
                    {Array.from({ length: 8 }).map((_, particleIdx) => {
                      const angle = (particleIdx / 8) * Math.PI * 2;
                      const distance = 20 + warLevel * 3;
                      const px = x2 + Math.cos(angle) * distance;
                      const py = y2 + Math.sin(angle) * distance;
                      
                      return (
                        <circle
                          key={`particle-${particleIdx}`}
                          r="2"
                          fill="#ff6600"
                          opacity="0"
                        >
                          <animate
                            attributeName="cx"
                            from={x2}
                            to={px}
                            dur="1s"
                            begin={`${explosionStart}s`}
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="cy"
                            from={y2}
                            to={py}
                            dur="1s"
                            begin={`${explosionStart}s`}
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0;0.8;0"
                            dur="1s"
                            begin={`${explosionStart}s`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      );
                    })}
                  </g>
                )}
                
                {/* Level 5: Counter-attack missiles from enemy */}
                {warLevel === 5 && (
                  <>
                    <defs>
                      <path
                        id={`counter-${pathId}`}
                        d={`M ${x2} ${y2} Q ${cx} ${cy} ${x1} ${y1}`}
                        fill="none"
                      />
                    </defs>
                    
                    {/* Counter missile trail */}
                    <path
                      d={`M ${x2} ${y2} Q ${cx} ${cy} ${x1} ${y1}`}
                      fill="none"
                      stroke="#ff0000"
                      strokeWidth="2"
                      opacity="0.6"
                      style={{ filter: "drop-shadow(0 0 10px #ff0000)" }}
                    />
                    
                    {/* Counter missile */}
                    <circle
                      r="4"
                      fill="#ff0000"
                      style={{ filter: "drop-shadow(0 0 15px #ff0000)" }}
                    >
                      <animateMotion
                        dur="2.5s"
                        repeatCount="indefinite"
                        begin={`${parseFloat(missileDelay) + 1.5}s`}
                      >
                        <mpath href={`#counter-${pathId}`} />
                      </animateMotion>
                    </circle>
                    
                    {/* Home country explosion */}
                    <circle
                      cx={x1}
                      cy={y1}
                      r="10"
                      fill="#ff0000"
                      opacity="0"
                      style={{ filter: "blur(5px)" }}
                    >
                      <animate
                        attributeName="opacity"
                        values="0;1;0"
                        dur="0.3s"
                        begin={`${parseFloat(missileDelay) + 4}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                )}
                
                {/* Enemy country highlight */}
                <circle
                  cx={x2}
                  cy={y2}
                  r="6"
                  fill="none"
                  stroke="#ff0000"
                  strokeWidth="2"
                  opacity={warLevel >= 3 ? 0.8 : 0.5}
                  className="animate-pulse"
                />
              </g>
            );
          })}
          
          {/* Aircraft positions with war-level based styling */}
          {aircraft.map((plane) => {
            if (plane.latitude === null || plane.longitude === null) return null;
            
            const [x, y] = projectToSVG(plane.longitude, plane.latitude, viewBoxWidth, viewBoxHeight);
            const pulseSize = 6 + warLevel * 2;
            const coreSize = 3 + warLevel * 0.5;
            return (
              <g 
                key={plane.icao24} 
                transform={`translate(${x}, ${y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedAircraft(plane)}
              >
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

      {/* Aircraft details modal */}
      <Dialog open={selectedAircraft !== null} onOpenChange={(open) => !open && setSelectedAircraft(null)}>
        <DialogContent className="bg-card/95 border-2 border-primary max-w-md backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="text-primary tracking-wider text-glow">AIRCRAFT INFORMATION</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Real-time flight tracking data
            </DialogDescription>
          </DialogHeader>
          {selectedAircraft && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">ICAO24</p>
                  <p className="text-primary font-mono">{selectedAircraft.icao24}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Callsign</p>
                  <p className="text-primary font-mono">{selectedAircraft.callsign || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Origin Country</p>
                  <p className="text-primary">{selectedAircraft.originCountry || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-primary">{selectedAircraft.onGround ? 'On Ground' : 'In Flight'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Latitude</p>
                  <p className="text-primary font-mono">{selectedAircraft.latitude?.toFixed(4) || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Longitude</p>
                  <p className="text-primary font-mono">{selectedAircraft.longitude?.toFixed(4) || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Barometric Altitude</p>
                  <p className="text-primary font-mono">
                    {selectedAircraft.barometricAltitude ? `${Math.round(selectedAircraft.barometricAltitude)}m` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Geometric Altitude</p>
                  <p className="text-primary font-mono">
                    {selectedAircraft.geometricAltitude ? `${Math.round(selectedAircraft.geometricAltitude)}m` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Velocity</p>
                  <p className="text-primary font-mono">
                    {selectedAircraft.velocity ? `${Math.round(selectedAircraft.velocity * 3.6)} km/h` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Heading</p>
                  <p className="text-primary font-mono">
                    {selectedAircraft.heading ? `${Math.round(selectedAircraft.heading)}°` : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vertical Rate</p>
                  <p className="text-primary font-mono">
                    {selectedAircraft.verticalRate 
                      ? `${selectedAircraft.verticalRate > 0 ? '+' : ''}${Math.round(selectedAircraft.verticalRate)} m/s` 
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Squawk</p>
                  <p className="text-primary font-mono">{selectedAircraft.squawk || 'N/A'}</p>
                </div>
              </div>
              {selectedAircraft.lastContact && (
                <div className="pt-2 border-t border-primary/20">
                  <p className="text-xs text-muted-foreground">Last Contact</p>
                  <p className="text-primary text-xs">
                    {new Date(selectedAircraft.lastContact * 1000).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Loading indicator for aircraft */}
      {isAircraftLoading && (
        <div className="absolute bottom-20 right-8 bg-card/95 border-2 border-primary px-4 py-2 z-20 animate-scale-in">
          <p className="text-xs text-primary tracking-wider text-glow">LOADING AIRCRAFT DATA...</p>
        </div>
      )}
      
      {/* Red glow at edges */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-war-blood/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-war-blood/10 to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-war-blood/10 to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-war-blood/10 to-transparent" />
      </div>

      {/* War Intensity Hold Button */}
      <div className="absolute bottom-8 right-8 bg-card/95 border-2 border-primary px-6 py-4 z-20 animate-scale-in">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <div 
              className="w-2 h-2 rounded-full animate-pulse" 
              style={{ 
                backgroundColor: `hsl(${120 - (warIntensity / 10) * 120}, 100%, 50%)` 
              }}
            />
            <p 
              className="text-xs tracking-wider font-mono"
              style={{ 
                color: `hsl(${120 - (warIntensity / 10) * 120}, 100%, 50%)` 
              }}
            >
              WAR INTENSITY: {warIntensity.toFixed(1)} / 10
            </p>
          </div>
          <Button
            onMouseDown={() => setIsHolding(true)}
            onMouseUp={() => setIsHolding(false)}
            onMouseLeave={() => setIsHolding(false)}
            onTouchStart={() => setIsHolding(true)}
            onTouchEnd={() => setIsHolding(false)}
            className="w-full h-20 text-sm font-mono border-2 transition-all select-none"
            style={{
              backgroundColor: `hsl(${120 - (warIntensity / 10) * 120}, 100%, 50%)`,
              borderColor: `hsl(${120 - (warIntensity / 10) * 120}, 100%, 40%)`,
              color: warIntensity > 5 ? '#ffffff' : '#000000',
              boxShadow: `0 0 ${10 + warIntensity * 2}px hsl(${120 - (warIntensity / 10) * 120}, 100%, 50%, 0.6)`,
            }}
          >
            {isHolding ? 'CHARGING...' : 'HOLD TO CHARGE'}
          </Button>
          <div className="text-xs text-center text-muted-foreground font-mono">
            LEVEL {warLevel} / 5
          </div>
        </div>
      </div>
    </div>
  );
}
