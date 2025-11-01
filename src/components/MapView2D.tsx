import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Slider } from './ui/slider';
import { HelpCircle } from 'lucide-react';
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

interface WarBeam {
  id: string;
  fromCountry: string;
  toCountry: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  startTime: number;
}

export default function MapView2D({ selectedCountry }: MapView2DProps) {
  const [countries, setCountries] = useState<GeoJSONFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warIntensity, setWarIntensity] = useState([0]);
  const [warBeams, setWarBeams] = useState<WarBeam[]>([]);

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

  // War beam generation effect
  useEffect(() => {
    if (warIntensity[0] === 0) {
      setWarBeams([]);
      return;
    }

    const countryNames = Object.keys(countryCentroids);
    if (countryNames.length < 2) return;

    const interval = setInterval(() => {
      const numBeams = Math.floor(warIntensity[0] / 10) + 1;
      const newBeams: WarBeam[] = [];

      for (let i = 0; i < numBeams; i++) {
        const isFromSelected = Math.random() < 0.5;
        const fromCountry = isFromSelected 
          ? selectedCountry 
          : countryNames[Math.floor(Math.random() * countryNames.length)];
        
        let toCountry = countryNames[Math.floor(Math.random() * countryNames.length)];
        while (toCountry === fromCountry) {
          toCountry = countryNames[Math.floor(Math.random() * countryNames.length)];
        }

        if (countryCentroids[fromCountry] && countryCentroids[toCountry]) {
          newBeams.push({
            id: `beam-${Date.now()}-${i}`,
            fromCountry,
            toCountry,
            fromCoords: countryCentroids[fromCountry],
            toCoords: countryCentroids[toCountry],
            startTime: Date.now(),
          });
        }
      }

      setWarBeams((prev) => {
        const now = Date.now();
        const filtered = prev.filter((beam) => now - beam.startTime < 2000);
        return [...filtered, ...newBeams];
      });
    }, Math.max(200, 1000 - warIntensity[0] * 8));

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
          {/* Subtle blue background with transparency */}
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="rgba(10, 32, 64, 0.2)" />
          
          {/* Subtle grid overlay - matching 3D globe style */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ff3333" strokeWidth="0.5" opacity="0.15"/>
            </pattern>
          </defs>
          <rect x="0" y="0" width={viewBoxWidth} height={viewBoxHeight} fill="url(#grid)" />
          
          {/* Render all countries */}
          {countries.map((country) => renderCountry(country, viewBoxWidth, viewBoxHeight))}
          
          {/* War beams */}
          {warBeams.map((beam) => {
            const [x1, y1] = projectToSVG(beam.fromCoords[0], beam.fromCoords[1], viewBoxWidth, viewBoxHeight);
            const [x2, y2] = projectToSVG(beam.toCoords[0], beam.toCoords[1], viewBoxWidth, viewBoxHeight);
            
            return (
              <g key={beam.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#ff0000"
                  strokeWidth="2"
                  opacity="0.8"
                  className="animate-pulse"
                  style={{
                    filter: "drop-shadow(0 0 4px #ff0000)",
                  }}
                >
                  <animate
                    attributeName="opacity"
                    from="0"
                    to="0.8"
                    dur="0.3s"
                    fill="freeze"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.8"
                    to="0"
                    begin="1.7s"
                    dur="0.3s"
                    fill="freeze"
                  />
                </line>
                {/* Explosion effect at target */}
                <circle
                  cx={x2}
                  cy={y2}
                  r="3"
                  fill="#ff3333"
                  opacity="0"
                >
                  <animate
                    attributeName="r"
                    from="3"
                    to="15"
                    begin="0.3s"
                    dur="0.5s"
                    fill="freeze"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;0"
                    begin="0.3s"
                    dur="0.5s"
                    fill="freeze"
                  />
                </circle>
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

      {/* War intensity slider */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-96 bg-card/95 border-2 border-primary px-8 py-4 z-20 animate-scale-in">
        <div className="flex items-center gap-4">
          <p className="text-xs text-primary tracking-wider text-glow whitespace-nowrap">
            WAR INTENSITY
          </p>
          <Slider
            value={warIntensity}
            onValueChange={setWarIntensity}
            max={100}
            step={1}
            className="flex-1"
          />
          <p className="text-xs text-primary tracking-wider text-glow w-12 text-right">
            {warIntensity[0]}%
          </p>
        </div>
      </div>
    </div>
  );
}
