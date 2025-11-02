import { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { Slider } from './ui/slider';
import { HelpCircle, Plane } from 'lucide-react';
import { feature } from 'topojson-client';
import { calculateBoundingBox, buildAircraftApiUrl } from '@/lib/country-bounds';

interface MapView2DProps {
  selectedCountry: string;
  onGameOver?: () => void;
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

export default function MapView2D({ selectedCountry, onGameOver }: MapView2DProps) {
  const [countries, setCountries] = useState<GeoJSONFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [warLevel, setWarLevel] = useState(1);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [enemyCountries, setEnemyCountries] = useState<string[]>([]);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [isAircraftLoading, setIsAircraftLoading] = useState(false);
  const [sensitivity, setSensitivity] = useState([0]); // Slider value 0-1
  const [showConflicts, setShowConflicts] = useState(false);
  const [visibleConflictCount, setVisibleConflictCount] = useState(0);
  const [randomConflicts, setRandomConflicts] = useState<Array<[string, string]>>([]);
  const [chainConflicts, setChainConflicts] = useState<Array<[string, string]>>([]);
  const [errorMessages, setErrorMessages] = useState<Array<{ id: number; message: string }>>([]);
  const [timeRemaining, setTimeRemaining] = useState(600); // 10 minutes in seconds
  const [timerStarted, setTimerStarted] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [explosionRays, setExplosionRays] = useState<Array<{ angle: number; id: number }>>([]);
  const [showThreatsDashboard, setShowThreatsDashboard] = useState(false);

  // Filter aircraft based on sensitivity - show more "dangerous" planes as sensitivity increases
  const visibleAircraft = useMemo(() => {
    const sensitivityValue = sensitivity[0];
    
    // At 0 sensitivity, show no planes
    if (sensitivityValue === 0) {
      return [];
    }
    
    // Calculate how many aircraft to show based on sensitivity (0-100%)
    const totalAircraft = aircraft.length;
    const visibleCount = Math.ceil(totalAircraft * sensitivityValue);
    
    // Return a subset of aircraft (first N aircraft)
    return aircraft.slice(0, visibleCount);
  }, [aircraft, sensitivity]);

  // Calculate threat statistics
  const threatStats = useMemo(() => {
    const stats = {
      total: visibleAircraft.length,
      inFlight: visibleAircraft.filter(a => a.onGround === false).length,
      onGround: visibleAircraft.filter(a => a.onGround === true).length,
      byCountry: {} as { [key: string]: number },
      avgAltitude: 0,
      avgSpeed: 0,
      altitudeRanges: {
        low: 0,      // < 3000m
        medium: 0,   // 3000-10000m
        high: 0      // > 10000m
      },
      speedRanges: {
        slow: 0,     // < 100 m/s
        medium: 0,   // 100-250 m/s
        fast: 0      // > 250 m/s
      }
    };

    if (visibleAircraft.length === 0) return stats;

    let totalAltitude = 0;
    let totalSpeed = 0;
    let altitudeCount = 0;
    let speedCount = 0;

    visibleAircraft.forEach(aircraft => {
      // Count by country
      const country = aircraft.originCountry || 'Unknown';
      stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;

      // Altitude stats
      if (aircraft.barometricAltitude !== null) {
        totalAltitude += aircraft.barometricAltitude;
        altitudeCount++;

        if (aircraft.barometricAltitude < 3000) stats.altitudeRanges.low++;
        else if (aircraft.barometricAltitude < 10000) stats.altitudeRanges.medium++;
        else stats.altitudeRanges.high++;
      }

      // Speed stats
      if (aircraft.velocity !== null) {
        totalSpeed += aircraft.velocity;
        speedCount++;

        if (aircraft.velocity < 100) stats.speedRanges.slow++;
        else if (aircraft.velocity < 250) stats.speedRanges.medium++;
        else stats.speedRanges.fast++;
      }
    });

    stats.avgAltitude = altitudeCount > 0 ? totalAltitude / altitudeCount : 0;
    stats.avgSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;

    return stats;
  }, [visibleAircraft]);

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

  // Update conflicts when sensitivity changes
  useEffect(() => {
    const intensityValue = sensitivity[0];
    if (intensityValue < 0.01) {
      setShowConflicts(false);
      setVisibleConflictCount(0);
      setErrorMessages([]);
      return;
    }
    
    setShowConflicts(true);
    const totalConflicts = enemyCountries.length + chainConflicts.length + randomConflicts.length;
    setVisibleConflictCount(0);
    
    // Gradually show all conflicts
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setVisibleConflictCount(count);
      if (count >= totalConflicts) {
        clearInterval(interval);
      }
    }, 150); // Faster animation for many conflicts
    
    return () => clearInterval(interval);
  }, [sensitivity, enemyCountries.length, chainConflicts.length, randomConflicts.length]);

  // Start timer when sensitivity first increases
  useEffect(() => {
    if (sensitivity[0] > 0 && !timerStarted) {
      setTimerStarted(true);
    }
  }, [sensitivity, timerStarted]);

  // Countdown timer with variable speed based on sensitivity
  useEffect(() => {
    if (!timerStarted || isExploding) return;

    // Calculate countdown speed: higher sensitivity = faster countdown
    // At 0 sensitivity: 1x speed, at max (1.0) sensitivity: 50x speed
    const speedMultiplier = 1 + (sensitivity[0] * 49);
    const intervalTime = 1000 / speedMultiplier;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 0) {
          setIsExploding(true);
          return 0;
        }
        return Math.max(0, prev - 1);
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [timerStarted, sensitivity, isExploding]);

  // Explosion effect - generate red X-rays
  useEffect(() => {
    if (!isExploding) return;

    const rays: Array<{ angle: number; id: number }> = [];
    for (let i = 0; i < 200; i++) {
      rays.push({
        angle: (360 / 200) * i,
        id: Date.now() + i
      });
    }
    setExplosionRays(rays);

    // Call game over after explosion animation
    setTimeout(() => {
      if (onGameOver) {
        onGameOver();
      }
    }, 6000);
  }, [isExploding, onGameOver]);

  // Generate fake error messages when sensitivity > 0.75
  useEffect(() => {
    if (sensitivity[0] > 0.75) {
      const errorInterval = setInterval(() => {
        const fakeErrors = [
          "CRITICAL: RADIATION DETECTED",
          "SYSTEM FAILURE: DEFENSE GRID OFFLINE",
          "WARNING: MISSILE LAUNCH DETECTED",
          "ERROR: COMMUNICATION LOST",
          "ALERT: PERIMETER BREACH",
          "CRITICAL: REACTOR OVERLOAD",
          "WARNING: HOSTILE AIRCRAFT DETECTED",
          "ERROR: COMMAND CENTER COMPROMISED",
          "ALERT: NUCLEAR SIGNATURE DETECTED",
          "CRITICAL: CIVILIAN CASUALTIES REPORTED"
        ];
        
        const randomError = fakeErrors[Math.floor(Math.random() * fakeErrors.length)];
        const newError = { id: Date.now() + Math.random(), message: randomError };
        
        setErrorMessages(prev => [...prev, newError]);
        
        // Remove error after 3 seconds
        setTimeout(() => {
          setErrorMessages(prev => prev.filter(e => e.id !== newError.id));
        }, 3000);
      }, 800);
      
      return () => clearInterval(errorInterval);
    } else {
      setErrorMessages([]);
    }
  }, [sensitivity]);

  // Map sensitivity to war level - extremely responsive to small changes
  useEffect(() => {
    // Exponential scaling: 0.1 = level 1, 0.2 = level 2, 0.4 = level 3, 0.6 = level 4, 0.8+ = level 5
    const exponentialScale = Math.pow(sensitivity[0], 0.5) * 7;
    const level = Math.min(5, Math.max(1, Math.ceil(exponentialScale)));
    setWarLevel(level);
  }, [sensitivity]);

  // Select enemy countries based on sensitivity - scales to ALL countries at 1.0
  useEffect(() => {
    if (countries.length === 0 || !selectedCountry) return;
    
    const availableCountries = countries
      .map(c => c.properties.name)
      .filter(name => name !== selectedCountry);
    
    const totalAvailable = availableCountries.length;
    const sensitivityValue = sensitivity[0];
    
    // For selected country targets: scale moderately
    let numEnemies;
    if (sensitivityValue >= 0.99) {
      numEnemies = Math.min(20, totalAvailable); // Cap at 20 for selected country
    } else if (sensitivityValue < 0.01) {
      numEnemies = 0;
    } else {
      // Less dramatic scaling for selected country
      const scale = Math.pow(sensitivityValue, 0.5);
      numEnemies = Math.ceil(scale * 20);
    }
    
    const shuffled = [...availableCountries].sort(() => Math.random() - 0.5);
    const selectedEnemies = shuffled.slice(0, numEnemies);
    setEnemyCountries(selectedEnemies);
    
    // Chain reaction: Each enemy country attacks another random country
    const chainPairs: Array<[string, string]> = [];
    selectedEnemies.forEach(enemy => {
      const availableTargets = availableCountries.filter(c => c !== enemy);
      if (availableTargets.length > 0) {
        const target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
        chainPairs.push([enemy, target]);
      }
    });
    setChainConflicts(chainPairs);
    
    // Random country-to-country conflicts: scale dramatically
    const randomPairs: Array<[string, string]> = [];
    
    if (sensitivityValue > 0.2) {
      // Exponential scaling: 0.3 = 5 conflicts, 0.5 = 20, 0.7 = 50, 1.0 = 100+
      const randomConflictScale = Math.pow((sensitivityValue - 0.2) / 0.8, 0.4);
      const numRandomConflicts = Math.floor(randomConflictScale * 120);
      
      for (let i = 0; i < numRandomConflicts && i < 150; i++) { // Cap at 150 for performance
        const country1 = availableCountries[Math.floor(Math.random() * availableCountries.length)];
        const country2 = availableCountries[Math.floor(Math.random() * availableCountries.length)];
        if (country1 !== country2) {
          randomPairs.push([country1, country2]);
        }
      }
    }
    
    setRandomConflicts(randomPairs);
  }, [sensitivity, countries, selectedCountry]);

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

  // Format timer display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get timer color based on time remaining
  const getTimerColor = () => {
    if (timeRemaining > 300) return '#00ff00'; // Green
    if (timeRemaining > 120) return '#ffff00'; // Yellow
    if (timeRemaining > 30) return '#ff9900'; // Orange
    return '#ff0000'; // Red
  };

  return (
    <div className="relative w-full h-screen bg-background overflow-hidden">
      {/* Timer display */}
      {timerStarted && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-30">
          <div
            className="font-mono text-6xl font-bold tracking-wider animate-pulse"
            style={{
              color: getTimerColor(),
              textShadow: `0 0 20px ${getTimerColor()}, 0 0 40px ${getTimerColor()}`,
              filter: timeRemaining < 30 ? 'brightness(1.5)' : 'brightness(1)'
            }}
          >
            {formatTime(timeRemaining)}
          </div>
        </div>
      )}

      {/* Fake error messages */}
      <div className="absolute top-4 left-4 space-y-2 z-20">
        {errorMessages.map((error) => (
          <div
            key={error.id}
            className="bg-red-900/90 border border-red-500 px-4 py-2 text-red-100 font-mono text-xs tracking-wider animate-fade-in"
            style={{
              textShadow: '0 0 10px rgba(255, 0, 0, 0.8)',
              animation: 'fade-in 0.3s ease-out'
            }}
          >
            {error.message}
          </div>
        ))}
      </div>

      {/* Subtle scanline effect */}
      <div className="absolute inset-0 pointer-events-none opacity-5 crt-effect"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 0, 0, 0.15) 2px, rgba(255, 0, 0, 0.15) 4px)'
        }}
      />

      {/* Explosion effect */}
      {isExploding && (
        <div className="absolute inset-0 z-50 pointer-events-none">
          {/* Multiple explosion flashes */}
          <div className="absolute inset-0 bg-white" style={{
            animation: 'explosionFlash 2s ease-out forwards'
          }} />
          
          {/* Radial explosion from center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-gradient-radial from-yellow-200 via-orange-500 to-red-600" style={{
            animation: 'explosionGrow 2s ease-out forwards',
            boxShadow: '0 0 200px 100px rgba(255, 100, 0, 0.8)'
          }} />
          
          {/* Shockwave rings */}
          {[0, 0.3, 0.6, 0.9].map((delay, i) => (
            <div key={i} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-4 border-orange-500" style={{
              animation: 'shockwave 2s ease-out forwards',
              animationDelay: `${delay}s`,
              opacity: 0
            }} />
          ))}
          
          {/* Debris particles */}
          {Array.from({ length: 50 }).map((_, i) => (
            <div key={i} className="absolute top-1/2 left-1/2 w-2 h-2 bg-red-600 rounded" style={{
              animation: 'debris 2s ease-out forwards',
              animationDelay: `${i * 0.02}s`,
              transform: `rotate(${i * 7.2}deg)`
            }} />
          ))}
          
          {/* GAME OVER text */}
          <div className="absolute inset-0 flex items-center justify-center z-50" style={{
            animation: 'gameOverFade 6s ease-out forwards',
            animationDelay: '1.5s',
            opacity: 0
          }}>
            <h1 className="text-8xl md:text-9xl font-bold text-red-600 tracking-[0.5em] text-center" style={{
              textShadow: '0 0 40px rgba(255, 0, 0, 1), 0 0 80px rgba(255, 0, 0, 0.8)'
            }}>
              GAME OVER
            </h1>
          </div>
          
          {/* Final fade to black */}
          <div className="absolute inset-0 bg-black" style={{
            animation: 'fadeToBlack 2s ease-out forwards',
            animationDelay: '1s',
            opacity: 0
          }} />
          
          <style>
            {`
              @keyframes explosionFlash {
                0% { opacity: 0; }
                10% { opacity: 1; }
                30% { opacity: 0; }
                40% { opacity: 0.8; }
                60% { opacity: 0; }
                100% { opacity: 0; }
              }
              
              @keyframes explosionGrow {
                0% { 
                  transform: translate(-50%, -50%) scale(0);
                  opacity: 1;
                }
                50% {
                  transform: translate(-50%, -50%) scale(15);
                  opacity: 0.8;
                }
                100% { 
                  transform: translate(-50%, -50%) scale(30);
                  opacity: 0;
                }
              }
              
              @keyframes shockwave {
                0% {
                  transform: translate(-50%, -50%) scale(0);
                  opacity: 1;
                  border-width: 8px;
                }
                100% {
                  transform: translate(-50%, -50%) scale(40);
                  opacity: 0;
                  border-width: 1px;
                }
              }
              
              @keyframes debris {
                0% {
                  transform: translate(-50%, -50%) rotate(0deg) translateX(0) scale(1);
                  opacity: 1;
                }
                100% {
                  transform: translate(-50%, -50%) rotate(360deg) translateX(800px) scale(0);
                  opacity: 0;
                }
              }
              
              @keyframes fadeToBlack {
                0% { opacity: 0; }
                100% { opacity: 1; }
              }
              
              @keyframes gameOverFade {
                0% { opacity: 0; transform: scale(0.5); }
                15% { opacity: 1; transform: scale(1.2); }
                25% { opacity: 1; transform: scale(1); }
                90% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(0.8); }
              }
            `}
          </style>
        </div>
      )}
      
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
          style={{ 
            maxHeight: '100%', 
            maxWidth: '100%',
            animation: sensitivity[0] > 0.75
              ? `mapShake ${Math.max(0.2, 1 - (visibleConflictCount / 200))}s infinite` 
              : 'none',
            transform: isExploding ? 'scale(1.5)' : 'scale(1)',
            opacity: isExploding ? 0 : 1,
            transition: 'all 2s ease-out'
          }}
        >
          <style>
            {`
              @keyframes mapShake {
                0%, 100% { transform: translate(0, 0) rotate(0deg); }
                10% { transform: translate(-1px, 1px) rotate(-0.2deg); }
                20% { transform: translate(1px, -1px) rotate(0.2deg); }
                30% { transform: translate(-1px, -1px) rotate(-0.2deg); }
                40% { transform: translate(1px, 1px) rotate(0.2deg); }
                50% { transform: translate(-1px, 1px) rotate(0deg); }
                60% { transform: translate(1px, -1px) rotate(-0.2deg); }
                70% { transform: translate(-1px, -1px) rotate(0.2deg); }
                80% { transform: translate(1px, 1px) rotate(-0.2deg); }
                90% { transform: translate(-1px, 1px) rotate(0.2deg); }
              }
            `}
          </style>
          
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
          
          {/* Spinning radar on selected country */}
          {selectedCountry && countryCentroids[selectedCountry] && !isExploding && (
            <g style={{ position: 'relative', zIndex: 9999 }}>
              {(() => {
                const [cx, cy] = projectToSVG(
                  countryCentroids[selectedCountry][0],
                  countryCentroids[selectedCountry][1],
                  viewBoxWidth,
                  viewBoxHeight
                );
                const radarRadius = 45;
                
                return (
                  <>
                    {/* Dark green background circle */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius}
                      fill="#003300"
                      opacity="0.8"
                    />
                    
                    {/* Radar sweep circles */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius * 0.66}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="1.2"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius * 0.33}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="0.9"
                    />
                    
                    {/* Spinning radar sweep - straight line */}
                    <g>
                      <defs>
                        <linearGradient id="radarSweepGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#00ff00" stopOpacity="0.9" />
                          <stop offset="100%" stopColor="#00ff00" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {/* Straight line from center */}
                      <line
                        x1={cx}
                        y1={cy}
                        x2={cx + radarRadius}
                        y2={cy}
                        stroke="url(#radarSweepGradient)"
                        strokeWidth="2"
                        style={{ 
                          transformOrigin: `${cx}px ${cy}px`,
                          animation: 'radarSpin 2s linear infinite'
                        }}
                      />
                      <style>
                        {`
                          @keyframes radarSpin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                          }
                        `}
                      </style>
                    </g>
                    
                    {/* Center dot */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r="3"
                      fill="#00ff00"
                      className="animate-pulse"
                    />
                  </>
                );
              })()}
            </g>
          )}
          
          {/* Conflict visualizations between selected country and enemies */}
          {showConflicts && selectedCountry && countryCentroids[selectedCountry] && enemyCountries.slice(0, visibleConflictCount).map((enemyCountry, idx) => {
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
              <g key={`conflict-${enemyCountry}-${idx}`} className="animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
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
                    opacity="0"
                  >
                    <animate
                      attributeName="opacity"
                      from="0"
                      to={warLevel === 1 ? "0.4" : "0.6"}
                      dur="0.5s"
                      fill="freeze"
                    />
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
                      opacity="0"
                      style={{ filter: `drop-shadow(0 0 ${warLevel * 2}px ${warLevel >= 4 ? "#ff0000" : "#ff8800"})` }}
                    >
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="0.7"
                        dur="0.5s"
                        fill="freeze"
                      />
                    </path>
                    
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
                
                {/* Level 3+: Simplified explosion effects at target */}
                {warLevel >= 3 && (
                  <g>
                    {/* Single explosion ring - reduced for performance */}
                    <circle
                      cx={x2}
                      cy={y2}
                      r="0"
                      fill="none"
                      stroke={warLevel >= 5 ? "#ff0000" : "#ff6600"}
                      strokeWidth="2"
                      opacity="0"
                    >
                      <animate
                        attributeName="r"
                        from="5"
                        to="25"
                        dur="1.5s"
                        begin={`${explosionStart}s`}
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        from="0.7"
                        to="0"
                        dur="1.5s"
                        begin={`${explosionStart}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                )}
                
                
                {/* Level 5: Counter-attack missiles from enemy - now shows at high sensitivity */}
                {sensitivity[0] >= 0.5 && (
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
                
                {/* Enemy country highlight - simplified */}
                <circle
                  cx={x2}
                  cy={y2}
                  r="4"
                  fill="#ff0000"
                  opacity={warLevel >= 3 ? 0.6 : 0.4}
                />
              </g>
            );
          })}
          
          {/* Chain reaction conflicts - attacked countries fight back to random targets */}
          {showConflicts && chainConflicts.map(([country1, country2], idx) => {
            const conflictIndex = enemyCountries.length + idx;
            if (conflictIndex >= visibleConflictCount) return null;
            if (!countryCentroids[country1] || !countryCentroids[country2]) return null;
            
            const [x1, y1] = projectToSVG(countryCentroids[country1][0], countryCentroids[country1][1], viewBoxWidth, viewBoxHeight);
            const [x2, y2] = projectToSVG(countryCentroids[country2][0], countryCentroids[country2][1], viewBoxWidth, viewBoxHeight);
            
            const dx = x2 - x1;
            const dy = y2 - y1;
            const cx = x1 + dx / 2 + dy * 0.3;
            const cy = y1 + dy / 2 - dx * 0.3;
            
            return (
              <g key={`chain-conflict-${idx}`} className="animate-fade-in">
                {/* Chain reaction missile path */}
                <path
                  d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                  fill="none"
                  stroke="#ffaa00"
                  strokeWidth="1.2"
                  opacity="0"
                  style={{ filter: "drop-shadow(0 0 4px #ffaa00)" }}
                  strokeDasharray="5,5"
                >
                  <animate
                    attributeName="opacity"
                    from="0"
                    to="0.6"
                    dur="0.5s"
                    fill="freeze"
                  />
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="100"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </path>
                
                {/* Animated missile for chain */}
                <circle
                  r="2.5"
                  fill="#ffff00"
                  style={{ filter: "drop-shadow(0 0 5px #ffff00)" }}
                >
                  <animateMotion
                    dur="3.5s"
                    repeatCount="indefinite"
                    begin={`${idx * 0.15}s`}
                  >
                    <mpath href={`#chain-path-${idx}`} />
                  </animateMotion>
                </circle>
                
                {/* Path definition for motion */}
                <defs>
                  <path
                    id={`chain-path-${idx}`}
                    d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                    fill="none"
                  />
                </defs>
              </g>
            );
          })}
          
          {/* Random country-to-country conflicts - starts after chain conflicts */}
          {showConflicts && randomConflicts.map(([country1, country2], idx) => {
            const conflictIndex = enemyCountries.length + chainConflicts.length + idx;
            if (conflictIndex >= visibleConflictCount) return null;
            if (!countryCentroids[country1] || !countryCentroids[country2]) return null;
            
            const [x1, y1] = projectToSVG(countryCentroids[country1][0], countryCentroids[country1][1], viewBoxWidth, viewBoxHeight);
            const [x2, y2] = projectToSVG(countryCentroids[country2][0], countryCentroids[country2][1], viewBoxWidth, viewBoxHeight);
            
            const dx = x2 - x1;
            const dy = y2 - y1;
            const cx = x1 + dx / 2 - dy * 0.2;
            const cy = y1 + dy / 2 + dx * 0.2;
            
            return (
              <g key={`random-conflict-${idx}`} className="animate-fade-in">
                {/* Curved missile path for random conflicts */}
                <path
                  d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                  fill="none"
                  stroke="#ff6600"
                  strokeWidth="1"
                  opacity="0"
                  style={{ filter: "drop-shadow(0 0 3px #ff6600)" }}
                >
                  <animate
                    attributeName="opacity"
                    from="0"
                    to="0.5"
                    dur="0.5s"
                    fill="freeze"
                  />
                </path>
                
                {/* Animated missile for random conflicts */}
                <circle
                  r="2"
                  fill="#ffaa00"
                  style={{ filter: "drop-shadow(0 0 4px #ffaa00)" }}
                >
                  <animateMotion
                    dur="4s"
                    repeatCount="indefinite"
                    begin={`${idx * 0.1}s`}
                  >
                    <mpath href={`#random-path-${idx}`} />
                  </animateMotion>
                </circle>
                
                {/* Path definition for motion */}
                <defs>
                  <path
                    id={`random-path-${idx}`}
                    d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                    fill="none"
                  />
                </defs>
              </g>
            );
          })}
          
          {/* Aircraft positions with minimal styling - only show based on sensitivity */}
          {visibleAircraft.map((plane) => {
            if (plane.latitude === null || plane.longitude === null) return null;
            
            const [x, y] = projectToSVG(plane.longitude, plane.latitude, viewBoxWidth, viewBoxHeight);
            return (
              <g 
                key={plane.icao24} 
                transform={`translate(${x}, ${y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedAircraft(plane)}
              >
                <circle cx="0" cy="0" r="2" fill="#ff3333" opacity={0.6} />
                <foreignObject x="-8" y="-8" width="16" height="16">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plane 
                      size={10} 
                      color="#ffffff" 
                      fill="#ff3333"
                    />
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>


      {/* Title at the top */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
        <h2 className="text-lg md:text-xl text-primary tracking-[0.3em]">SKYTRACK COMMAND</h2>
      </div>

      {/* Country indicator in top-right corner */}
      <div className="absolute top-4 right-4 bg-card/95 border-2 border-primary px-6 py-3 flex items-center gap-2 z-20 animate-scale-in">
        <p className="text-xs text-primary tracking-wider" style={{
          textShadow: '0 0 5px rgba(255, 0, 0, 0.5)'
        }}>
          NATION: {selectedCountry.toUpperCase()}
        </p>
      </div>

      {/* Help button with modal */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute bottom-4 right-4 bg-card/95 border-2 border-primary hover:bg-primary/20 hover:border-war-glow transition-all z-20 animate-scale-in"
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
              Welcome to the War Protocol simulation. You are viewing the global theater of operations for <span className="text-primary">{selectedCountry}</span>.
            </p>
            <p className="text-xs text-primary/80">
              <strong>WARNING:</strong> This is a chaos theory simulation. Small adjustments to the sensitivity slider create exponentially catastrophic outcomes.
            </p>
            <p>
              As radar sensitivity increases, more hostile aircraft are detected as threats. Each detected threat triggers defensive responses, which cascade into conflicts. The timer represents global stability - it accelerates as threats multiply.
            </p>
            <p className="text-xs text-primary tracking-wider text-glow mt-4">
              ONE ADJUSTMENT. TOTAL ANNIHILATION.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Threats Dashboard */}
      <Dialog open={showThreatsDashboard} onOpenChange={setShowThreatsDashboard}>
        <DialogContent className="bg-card/95 border-2 border-primary max-w-4xl backdrop-blur-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary tracking-wider text-glow text-lg">THREAT DETECTION DASHBOARD</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Real-time analysis of {threatStats.total} detected hostile aircraft
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-background/50 border border-primary/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">TOTAL THREATS</p>
                <p className="text-2xl font-bold text-orange-400">{threatStats.total}</p>
              </div>
              <div className="bg-background/50 border border-primary/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">IN FLIGHT</p>
                <p className="text-2xl font-bold text-red-500">{threatStats.inFlight}</p>
              </div>
              <div className="bg-background/50 border border-primary/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">ON GROUND</p>
                <p className="text-2xl font-bold text-yellow-500">{threatStats.onGround}</p>
              </div>
              <div className="bg-background/50 border border-primary/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">AVG ALTITUDE</p>
                <p className="text-2xl font-bold text-blue-400">{Math.round(threatStats.avgAltitude)}m</p>
              </div>
            </div>

            {/* Altitude Distribution */}
            <div className="bg-background/50 border border-primary/30 p-4">
              <h3 className="text-xs text-primary tracking-wider mb-3">ALTITUDE DISTRIBUTION</h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">LOW (&lt; 3,000m)</span>
                    <span className="text-orange-400">{threatStats.altitudeRanges.low}</span>
                  </div>
                  <div className="w-full bg-background h-4 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-600 to-orange-400"
                      style={{ width: `${threatStats.total > 0 ? (threatStats.altitudeRanges.low / threatStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">MEDIUM (3,000-10,000m)</span>
                    <span className="text-yellow-400">{threatStats.altitudeRanges.medium}</span>
                  </div>
                  <div className="w-full bg-background h-4 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-600 to-yellow-400"
                      style={{ width: `${threatStats.total > 0 ? (threatStats.altitudeRanges.medium / threatStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">HIGH (&gt; 10,000m)</span>
                    <span className="text-red-400">{threatStats.altitudeRanges.high}</span>
                  </div>
                  <div className="w-full bg-background h-4 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-red-400"
                      style={{ width: `${threatStats.total > 0 ? (threatStats.altitudeRanges.high / threatStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Speed Distribution */}
            <div className="bg-background/50 border border-primary/30 p-4">
              <h3 className="text-xs text-primary tracking-wider mb-3">VELOCITY DISTRIBUTION</h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">SLOW (&lt; 360 km/h)</span>
                    <span className="text-blue-400">{threatStats.speedRanges.slow}</span>
                  </div>
                  <div className="w-full bg-background h-4 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-blue-400"
                      style={{ width: `${threatStats.total > 0 ? (threatStats.speedRanges.slow / threatStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">MEDIUM (360-900 km/h)</span>
                    <span className="text-yellow-400">{threatStats.speedRanges.medium}</span>
                  </div>
                  <div className="w-full bg-background h-4 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-600 to-yellow-400"
                      style={{ width: `${threatStats.total > 0 ? (threatStats.speedRanges.medium / threatStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">FAST (&gt; 900 km/h)</span>
                    <span className="text-red-400">{threatStats.speedRanges.fast}</span>
                  </div>
                  <div className="w-full bg-background h-4 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-red-400"
                      style={{ width: `${threatStats.total > 0 ? (threatStats.speedRanges.fast / threatStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Top Origin Countries */}
            <div className="bg-background/50 border border-primary/30 p-4">
              <h3 className="text-xs text-primary tracking-wider mb-3">THREATS BY ORIGIN COUNTRY</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {Object.entries(threatStats.byCountry)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([country, count]) => (
                    <div key={country}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{country}</span>
                        <span className="text-orange-400">{count}</span>
                      </div>
                      <div className="w-full bg-background h-3 relative overflow-hidden">
                        <div 
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-600 to-orange-400"
                          style={{ width: `${threatStats.total > 0 ? (count / threatStats.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* All Aircraft List */}
            <div className="bg-background/50 border border-primary/30 p-4">
              <h3 className="text-xs text-primary tracking-wider mb-3">ALL DETECTED THREATS</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {visibleAircraft.map((aircraft, idx) => (
                  <div 
                    key={aircraft.icao24}
                    className="border border-primary/20 p-3 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedAircraft(aircraft);
                      setShowThreatsDashboard(false);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-mono text-orange-400">#{idx + 1} - {aircraft.icao24}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {aircraft.callsign || 'Unknown'} • {aircraft.originCountry || 'Unknown'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-primary">{aircraft.barometricAltitude ? `${Math.round(aircraft.barometricAltitude)}m` : 'N/A'}</p>
                        <p className="text-[10px] text-muted-foreground">{aircraft.velocity ? `${Math.round(aircraft.velocity * 3.6)} km/h` : 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

      {/* Attack Statistics Panel - Bottom Left */}
      <div className="absolute bottom-8 left-8 bg-card/95 border-2 border-primary px-6 py-4 z-20 animate-scale-in min-w-[280px]">
        <h3 className="text-xs text-primary tracking-wider text-glow mb-3 text-center border-b border-primary/30 pb-2">
          COMBAT STATISTICS
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground tracking-wide">ATTACKS RECEIVED</span>
            <span className="text-sm text-red-400 font-mono font-bold animate-pulse">{enemyCountries.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground tracking-wide">ATTACKS SENT</span>
            <span className="text-sm text-orange-400 font-mono font-bold animate-pulse">{chainConflicts.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground tracking-wide">RANDOM CONFLICTS</span>
            <span className="text-sm text-yellow-400 font-mono font-bold animate-pulse">{randomConflicts.length}</span>
          </div>
          <div className="border-t border-primary/30 pt-2 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-primary tracking-wide font-bold">TOTAL CONFLICTS</span>
              <span className="text-base text-primary font-mono font-bold text-glow animate-pulse">
                {enemyCountries.length + chainConflicts.length + randomConflicts.length}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-[10px] text-muted-foreground tracking-wide">THREAT LEVEL</span>
            <span 
              className="text-sm font-mono font-bold"
              style={{ color: `hsl(${120 - sensitivity[0] * 120}, 100%, 50%)` }}
            >
              {(sensitivity[0] * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-[10px] text-muted-foreground tracking-wide">COUNTRIES AFFECTED</span>
            <span className="text-sm text-cyan-400 font-mono font-bold">
              {new Set([
                selectedCountry,
                ...enemyCountries,
                ...chainConflicts.map(c => c[0]),
                ...chainConflicts.map(c => c[1]),
                ...randomConflicts.map(c => c[0]),
                ...randomConflicts.map(c => c[1])
              ]).size}
            </span>
          </div>
        </div>
      </div>

      {/* Loading indicator for aircraft */}
      {isAircraftLoading && (
        <div className="absolute bottom-20 right-8 bg-card/95 border-2 border-primary px-4 py-2 z-20 animate-scale-in">
          <p className="text-xs text-primary tracking-wider text-glow">LOADING AIRCRAFT DATA...</p>
        </div>
      )}
      
      {/* Red chaos overlay at high conflict count */}
      {visibleConflictCount > 50 && (
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, rgba(255, 0, 0, ${Math.min((visibleConflictCount - 50) / 200, 0.3)}) 0%, transparent 70%)`
          }}
        />
      )}
      
      {/* Red glow at edges */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-war-blood/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-war-blood/10 to-transparent" />
        <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-war-blood/10 to-transparent" />
        <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-war-blood/10 to-transparent" />
      </div>

      {/* Radar Sensitivity Slider - Bottom Center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 animate-scale-in bg-card/95 border-2 border-primary px-8 py-6 rounded-lg">
        <div className="space-y-4">
          <p className="text-xs tracking-widest font-bold text-center" style={{
            color: `hsl(${120 - sensitivity[0] * 120}, 100%, 50%)`
          }}>
            RADAR SENSITIVITY
          </p>
          <div className="w-64">
            <Slider
              value={sensitivity}
              onValueChange={setSensitivity}
              max={1}
              step={0.01}
              className="cursor-pointer"
            />
          </div>
          <div className="flex justify-between items-center text-xs gap-4">
            <p className="text-muted-foreground font-mono">
              {sensitivity[0].toFixed(2)}
            </p>
            <button
              onClick={() => setShowThreatsDashboard(true)}
              className="text-orange-400 font-mono text-[10px] hover:text-orange-300 hover:underline cursor-pointer transition-colors"
              disabled={visibleAircraft.length === 0}
            >
              {visibleAircraft.length} THREATS
            </button>
            <p className="text-primary font-mono text-[10px]">
              {enemyCountries.length + chainConflicts.length + randomConflicts.length} {(enemyCountries.length + chainConflicts.length + randomConflicts.length) === 1 ? 'CONFLICT' : 'CONFLICTS'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
