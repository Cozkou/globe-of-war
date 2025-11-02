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
  const [sensitivity, setSensitivity] = useState([0.02]); // Slider value 0-0.1, starts at 0.02
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
  const [conflictHistory, setConflictHistory] = useState<Array<{ time: number; conflicts: number; threats: number; sensitivity: number }>>([]);
  const [dashboardCountdown, setDashboardCountdown] = useState(20);
  const [showTutorial, setShowTutorial] = useState(true);
  const [positionTrail, setPositionTrail] = useState<Array<{ x: number; y: number; sensitivity: number; timestamp: number }>>([]);

  // Filter aircraft based on sensitivity - show more "dangerous" planes as sensitivity increases
  const visibleAircraft = useMemo(() => {
    const sensitivityValue = sensitivity[0];

    // Below 0.02 sensitivity, show no planes
    if (sensitivityValue < 0.02) {
      return [];
    }

    // Above 0.03, show all planes (instant chaos)
    if (sensitivityValue >= 0.03) {
      return aircraft;
    }

    // Between 0.02 and 0.03, scale smoothly
    const totalAircraft = aircraft.length;
    const normalizedValue = (sensitivityValue - 0.02) / 0.01; // 0.02-0.03 maps to 0-1
    const visibleCount = Math.ceil(totalAircraft * normalizedValue);

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

  // Track conflict history for graphs
  useEffect(() => {
    const interval = setInterval(() => {
      const totalConflicts = enemyCountries.length + chainConflicts.length + randomConflicts.length;
      setConflictHistory(prev => {
        const newEntry = {
          time: Date.now(),
          conflicts: totalConflicts,
          threats: visibleAircraft.length,
          sensitivity: sensitivity[0]
        };
        // Keep last 60 entries (10 minutes if updating every 10 seconds)
        const updated = [...prev, newEntry].slice(-60);
        return updated;
      });
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [enemyCountries.length, chainConflicts.length, randomConflicts.length, visibleAircraft.length, sensitivity]);

  // Track position trail for graph visualization
  useEffect(() => {
    const currentSens = sensitivity[0] * 10; // 0-1 scale

    // Calculate position on graph
    let threats = 0;
    if (currentSens < 0.2) {
      threats = 0;
    } else if (currentSens >= 0.3) {
      threats = 2.5;
    } else {
      const normalized = (currentSens - 0.2) / 0.1;
      threats = Math.pow(normalized, 3) * 2.5;
    }

    const x = 80 + currentSens * 600;
    const y = 200 - (threats * 180);

    setPositionTrail(prev => {
      const newPoint = { x, y, sensitivity: currentSens, timestamp: Date.now() };
      // Keep last 50 points
      const updated = [...prev, newPoint].slice(-50);
      return updated;
    });
  }, [sensitivity]);

  // Update conflicts when sensitivity changes
  useEffect(() => {
    const intensityValue = sensitivity[0];
    if (intensityValue < 0.02) {
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
    // Below 0.02: 1x speed, between 0.02-0.03: scale smoothly to 50x, above 0.03: 50x speed
    let speedMultiplier;
    if (sensitivity[0] < 0.02) {
      speedMultiplier = 1;
    } else if (sensitivity[0] >= 0.03) {
      speedMultiplier = 50;
    } else {
      const normalizedValue = (sensitivity[0] - 0.02) / 0.01;
      speedMultiplier = 1 + (normalizedValue * 49);
    }
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

    // Open dashboard after game over text appears (4 seconds into explosion)
    setTimeout(() => {
      setShowThreatsDashboard(true);
      setDashboardCountdown(20);
    }, 4000);

    // Auto-close dashboard and call game over after 20 seconds
    setTimeout(() => {
      setShowThreatsDashboard(false);
      if (onGameOver) {
        onGameOver();
      }
    }, 24000); // 4 seconds wait + 20 seconds dashboard open
  }, [isExploding, onGameOver]);

  // Countdown timer for dashboard auto-close during game over
  useEffect(() => {
    if (!showThreatsDashboard || !isExploding) return;

    const interval = setInterval(() => {
      setDashboardCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showThreatsDashboard, isExploding]);

  // Generate fake error messages when sensitivity >= 0.03 (instant chaos)
  useEffect(() => {
    if (sensitivity[0] >= 0.03) {
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

  // Map sensitivity to war level - compressed to 0.02-0.03 range, smooth scaling
  useEffect(() => {
    const sensitivityValue = sensitivity[0];
    let level;

    if (sensitivityValue < 0.02) {
      level = 1;
    } else if (sensitivityValue >= 0.03) {
      level = 5; // Instant chaos
    } else {
      // Scale 0.02-0.03 to levels 1-5 smoothly
      const normalizedValue = (sensitivityValue - 0.02) / 0.01;
      level = Math.min(5, Math.max(1, Math.floor(1 + normalizedValue * 4)));
    }

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
    
    // For selected country targets: scale smoothly between 0.02-0.03
    let numEnemies;
    if (sensitivityValue < 0.02) {
      numEnemies = 0; // Nothing happens below 0.02
    } else if (sensitivityValue >= 0.03) {
      numEnemies = Math.min(20, totalAvailable); // Instant chaos at 0.03
    } else {
      // Scale smoothly between 0.02 and 0.03
      const normalizedValue = (sensitivityValue - 0.02) / 0.01;
      numEnemies = Math.ceil(normalizedValue * Math.min(20, totalAvailable));
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
    
    // Random country-to-country conflicts: scale smoothly between 0.02-0.03
    const randomPairs: Array<[string, string]> = [];

    if (sensitivityValue >= 0.02) {
      let numRandomConflicts;

      if (sensitivityValue >= 0.03) {
        // Instant chaos - maximum conflicts
        numRandomConflicts = 150;
      } else {
        // Scale smoothly between 0.02 and 0.03
        const normalizedValue = (sensitivityValue - 0.02) / 0.01;
        numRandomConflicts = Math.floor(normalizedValue * 150);
      }
      
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

  // Calculate bearing (angle) from point A to point B in degrees
  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
  };

  // Get the selected country's centroid
  const selectedCountryCentroid = useMemo(() => {
    if (!selectedCountry || !countryCentroids[selectedCountry]) return null;
    return countryCentroids[selectedCountry];
  }, [selectedCountry, countryCentroids]);

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
            animation: sensitivity[0] >= 0.03
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
                
                
                {/* Level 5: Counter-attack missiles from enemy - shows at or above 0.028 */}
                {sensitivity[0] >= 0.028 && (
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
          
          {/* Spinning radar on selected country - Below planes but above everything else */}
          {selectedCountry && countryCentroids[selectedCountry] && !isExploding && (
            <g>
              {(() => {
                const [cx, cy] = projectToSVG(
                  countryCentroids[selectedCountry][0],
                  countryCentroids[selectedCountry][1],
                  viewBoxWidth,
                  viewBoxHeight
                );
                const radarRadius = 45;
                const uniqueId = `radar-${selectedCountry.replace(/\s+/g, '-')}`;
                
                return (
                  <>
                    <defs>
                      {/* Radial gradient for radar background */}
                      <radialGradient id={`${uniqueId}-bg`} cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#001a00" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#003300" stopOpacity="0.8" />
                      </radialGradient>
                      
                      {/* Sweep gradient - fading trail */}
                      <linearGradient id={`${uniqueId}-sweep`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00ff00" stopOpacity="1" />
                        <stop offset="15%" stopColor="#00ff00" stopOpacity="0.8" />
                        <stop offset="40%" stopColor="#00cc00" stopOpacity="0.4" />
                        <stop offset="70%" stopColor="#009900" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#00ff00" stopOpacity="0" />
                      </linearGradient>
                      
                      {/* Sweep cone gradient for the arc effect */}
                      <radialGradient id={`${uniqueId}-sweep-cone`} cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#00ff00" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#00ff00" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    
                    {/* Dark green background circle */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius}
                      fill={`url(#${uniqueId}-bg)`}
                    />
                    
                    {/* Radar sweep circles (concentric rings) */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="1.5"
                      opacity="0.8"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius * 0.66}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="1.2"
                      opacity="0.6"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius * 0.33}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="0.9"
                      opacity="0.6"
                    />
                    
                    {/* Cross-hair lines (north/south, east/west) */}
                    <line
                      x1={cx}
                      y1={cy - radarRadius}
                      x2={cx}
                      y2={cy + radarRadius}
                      stroke="#00ff00"
                      strokeWidth="0.8"
                      opacity="0.4"
                    />
                    <line
                      x1={cx - radarRadius}
                      y1={cy}
                      x2={cx + radarRadius}
                      y2={cy}
                      stroke="#00ff00"
                      strokeWidth="0.8"
                      opacity="0.4"
                    />
                    
                    {/* Radar sweep cone/arc - rotating fading effect */}
                    <g>
                      <clipPath id={`${uniqueId}-clip`}>
                        <circle cx={cx} cy={cy} r={radarRadius} />
                      </clipPath>
                      <g clipPath={`url(#${uniqueId}-clip)`}>
                        <g transform={`translate(${cx}, ${cy})`}>
                          <g>
                            <animateTransform
                              attributeName="transform"
                              type="rotate"
                              from="0"
                              to="360"
                              dur="4s"
                              repeatCount="indefinite"
                            />
                            {/* Wide sweep arc for trail effect */}
                            <path
                              d={`M 0,0 L ${radarRadius},0 A ${radarRadius},${radarRadius} 0 0,1 ${radarRadius * Math.cos(Math.PI / 8)},${-radarRadius * Math.sin(Math.PI / 8)} Z`}
                              fill={`url(#${uniqueId}-sweep-cone)`}
                              opacity="0.6"
                            />
                            {/* Main sweep line */}
                            <line
                              x1={0}
                              y1={0}
                              x2={radarRadius}
                              y2={0}
                              stroke={`url(#${uniqueId}-sweep)`}
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          </g>
                        </g>
                      </g>
                    </g>
                    
                    {/* Center dot */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r="3"
                      fill="#00ff00"
                      opacity="0.9"
                    >
                      <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2s" repeatCount="indefinite" />
                    </circle>
                    
                    {/* Outer pulse ring */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radarRadius}
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="2"
                      opacity="0"
                    >
                      <animate
                        attributeName="opacity"
                        values="0;0.6;0"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="r"
                        values={`${radarRadius};${radarRadius * 1.1}`}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </>
                );
              })()}
            </g>
          )}
          
          {/* Aircraft positions - RENDER LAST SO PLANES ARE ON TOP OF RADAR */}
          {visibleAircraft.map((plane) => {
            if (plane.latitude === null || plane.longitude === null) return null;
            
            const [x, y] = projectToSVG(plane.longitude, plane.latitude, viewBoxWidth, viewBoxHeight);
            
            // Calculate rotation to point toward country centroid
            let rotation = 0;
            if (selectedCountryCentroid) {
              const bearing = calculateBearing(
                plane.latitude,
                plane.longitude,
                selectedCountryCentroid[1], // lat
                selectedCountryCentroid[0]  // lng
              );
              // Bearing is in compass degrees (0° = north, 90° = east, clockwise)
              // Plane icon points right/east (0° in SVG) by default
              // To point north: SVG needs -90° (or 270°), so bearing 0° -> -90°
              // To point east: SVG needs 0°, so bearing 90° -> 0°
              // Formula: SVG rotation = bearing - 90
              rotation = bearing - 90;
            }
            
            // Movement animation: in the rotated coordinate space, forward is positive X
            // (since the plane icon points right/east by default)
            const moveDistance = 2; // pixels to move forward in the direction plane is facing
            const moveX = moveDistance; // Move forward (right in rotated space)
            const moveY = 0; // No lateral movement
            
            return (
              <g 
                key={plane.icao24} 
                transform={`translate(${x}, ${y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedAircraft(plane)}
                className="aircraft-icon"
              >
                {/* Pulsing glow effect */}
                <circle cx="0" cy="0" r="6" fill="#ff3333" opacity={0.2}>
                  <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Base circle */}
                <circle cx="0" cy="0" r="3" fill="#ff3333" opacity={0.7} />
                {/* Plane icon rotated to face country and animated to move forward */}
                <g transform={`rotate(${rotation})`}>
                  <g>
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      values={`0,0;${moveX},${moveY};0,0`}
                      dur="3s"
                      repeatCount="indefinite"
                    />
                    <foreignObject x="-10" y="-10" width="20" height="20">
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        filter: 'drop-shadow(0 0 4px rgba(255, 51, 51, 0.8))'
                      }}>
                        <Plane 
                          size={12} 
                          color="#ffffff" 
                          fill="#ff3333"
                          strokeWidth={2}
                        />
                      </div>
                    </foreignObject>
                  </g>
                </g>
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

      {/* Combat Statistics Dashboard */}
      <Dialog 
        open={showThreatsDashboard} 
        onOpenChange={(open) => {
          setShowThreatsDashboard(open);
          // If closing during game over, restart immediately
          if (!open && isExploding && onGameOver) {
            onGameOver();
          }
        }}
      >
        <DialogContent className="bg-card/95 border-2 border-primary max-w-5xl backdrop-blur-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary tracking-wider text-glow text-lg">
              {isExploding ? "FINAL COMBAT REPORT" : "COMBAT STATISTICS DASHBOARD"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {isExploding 
                ? `Game summary - Press X to restart or wait ${dashboardCountdown} seconds`
                : "Real-time conflict monitoring and escalation analysis"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-background/50 border border-red-500/50 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">ACTIVE CONFLICTS</p>
                <p className="text-3xl font-bold text-red-500">{enemyCountries.length + chainConflicts.length + randomConflicts.length}</p>
              </div>
              <div className="bg-background/50 border border-orange-500/50 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">DIRECT ATTACKS</p>
                <p className="text-3xl font-bold text-orange-400">{enemyCountries.length}</p>
              </div>
              <div className="bg-background/50 border border-yellow-500/50 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">CHAIN REACTIONS</p>
                <p className="text-3xl font-bold text-yellow-500">{chainConflicts.length}</p>
              </div>
              <div className="bg-background/50 border border-primary/30 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">GLOBAL WARFARE</p>
                <p className="text-3xl font-bold text-primary">{randomConflicts.length}</p>
              </div>
              <div className="bg-background/50 border border-orange-500/50 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">THREATS DETECTED</p>
                <p className="text-3xl font-bold text-orange-400">{threatStats.total}</p>
              </div>
            </div>

            {/* Sensitivity vs Threats Correlation Graph - LIVE TRACKING SCREEN */}
            <div className="bg-background/50 border-2 border-red-500/50 p-4 relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <h3 className="text-xs text-red-400 tracking-wider font-bold">
                    🔴 LIVE TRACKING: YOUR THREAT POSITION
                  </h3>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  SENSITIVITY: {(sensitivity[0] * 1000).toFixed(0)}%
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mb-4">
                Camera locked on your position - Watch exponential escalation in real-time
              </p>
              <div className="relative h-64 border-4 border-red-500/50 bg-black overflow-hidden"
                   style={{
                     boxShadow: 'inset 0 0 30px rgba(255,0,0,0.3), 0 0 20px rgba(255,0,0,0.2)'
                   }}>
                {/* TV Screen Effect Overlay */}
                <div className="absolute inset-0 pointer-events-none z-50"
                     style={{
                       background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.03) 2px, rgba(255,0,0,0.03) 4px)'
                     }}>
                </div>

                {/* Threat Level Indicator */}
                {(() => {
                  const currentSens = sensitivity[0] * 10;
                  let threats = 0;
                  let actualThreats = visibleAircraft.length + enemyCountries.length + chainConflicts.length + randomConflicts.length;

                  if (currentSens < 0.2) {
                    threats = 0;
                  } else if (currentSens >= 0.3) {
                    threats = 2.5;
                  } else {
                    const normalized = (currentSens - 0.2) / 0.1;
                    threats = Math.pow(normalized, 3) * 2.5;
                  }

                  const threatLevel = threats === 0 ? "SAFE" :
                                     threats < 0.5 ? "LOW" :
                                     threats < 1.0 ? "MODERATE" :
                                     threats < 1.5 ? "HIGH" :
                                     threats < 2.0 ? "CRITICAL" : "MAXIMUM";

                  const threatColor = threats === 0 ? "#00ff00" :
                                     threats < 0.5 ? "#88ff00" :
                                     threats < 1.0 ? "#ffff00" :
                                     threats < 1.5 ? "#ffaa00" :
                                     threats < 2.0 ? "#ff6600" : "#ff0000";

                  return (
                    <div className="absolute top-2 left-2 right-2 z-40 flex justify-between items-start">
                      <div className="bg-black/80 border border-green-500/50 px-3 py-1 rounded">
                        <p className="text-[8px] text-green-400 font-mono">TRACKING ACTIVE</p>
                      </div>
                      <div className="bg-black/80 border-2 px-3 py-1 rounded" style={{ borderColor: threatColor }}>
                        <p className="text-[10px] font-mono font-bold" style={{ color: threatColor }}>
                          {threatLevel}: {actualThreats} CONFLICTS
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Dynamic Background - Changes color based on threat level */}
                {(() => {
                  const currentSens = sensitivity[0] * 10;
                  let threats = 0;
                  if (currentSens < 0.2) {
                    threats = 0;
                  } else if (currentSens >= 0.3) {
                    threats = 2.5;
                  } else {
                    const normalized = (currentSens - 0.2) / 0.1;
                    threats = Math.pow(normalized, 3) * 2.5;
                  }

                  const bgColor = threats === 0 ? "rgba(0, 50, 0, 0.3)" :
                                 threats < 0.5 ? "rgba(50, 50, 0, 0.3)" :
                                 threats < 1.0 ? "rgba(80, 40, 0, 0.3)" :
                                 threats < 1.5 ? "rgba(100, 20, 0, 0.4)" :
                                 threats < 2.0 ? "rgba(120, 0, 0, 0.5)" : "rgba(150, 0, 0, 0.6)";

                  return (
                    <div className="absolute inset-0 transition-colors duration-500"
                         style={{ backgroundColor: bgColor }}>
                    </div>
                  );
                })()}

                <svg
                  className="w-full h-full relative z-10"
                  viewBox={(() => {
                    // Calculate current position to lock camera on the point
                    const currentSens = sensitivity[0] * 10; // 0-1 scale

                    // Calculate current threat level
                    let currentThreats = 0;
                    if (currentSens < 0.2) {
                      currentThreats = 0;
                    } else if (currentSens >= 0.3) {
                      currentThreats = 2.5;
                    } else {
                      const normalized = (currentSens - 0.2) / 0.1;
                      currentThreats = Math.pow(normalized, 3) * 2.5;
                    }

                    // Point position in graph coordinates
                    const pointX = 80 + currentSens * 600;
                    const pointY = 200 - (currentThreats * 180);

                    // Lock viewport to center on the point but show wider context
                    // Show wider window so you can see the curve context
                    const viewWidth = 500;
                    const viewHeight = 300;
                    const centerX = pointX - viewWidth / 2;
                    const centerY = pointY - viewHeight / 2;

                    return `${centerX} ${centerY} ${viewWidth} ${viewHeight}`;
                  })()}
                  preserveAspectRatio="xMidYMid meet"
                  style={{
                    transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                >
                  <defs>
                    {/* Gradient for the danger zone */}
                    <linearGradient id="dangerZoneGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255,0,0,0.3)" />
                      <stop offset="100%" stopColor="rgba(255,0,0,0)" />
                    </linearGradient>

                    {/* Glow effect for the curve */}
                    <filter id="glowEffect">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Background grid */}
                  <line x1="80" y1="0" x2="80" y2="200" stroke="rgba(255,51,51,0.1)" strokeWidth="1" />
                  <line x1="0" y1="200" x2="800" y2="200" stroke="rgba(255,51,51,0.2)" strokeWidth="2" />

                  {/* Grid lines for reference - scrolling background */}
                  {(() => {
                    const lines = [];
                    for (let i = 0; i <= 10; i++) {
                      const y = i * 50;
                      lines.push(
                        <line key={`h${i}`} x1="0" y1={y} x2="800" y2={y}
                              stroke="rgba(255,51,51,0.1)" strokeWidth="1"
                              strokeDasharray="5,5" />
                      );
                    }
                    for (let i = 0; i <= 16; i++) {
                      const x = i * 50;
                      lines.push(
                        <line key={`v${i}`} x1={x} y1="-200" x2={x} y2="400"
                              stroke="rgba(255,51,51,0.1)" strokeWidth="1"
                              strokeDasharray="5,5" />
                      );
                    }
                    return lines;
                  })()}

                  {/* X-axis: Sensitivity scale - fixed at bottom */}
                  <text x="80" y="220" fill="#888" fontSize="10" fontFamily="monospace">0%</text>
                  <text x="280" y="220" fill="#00ff00" fontSize="10" fontFamily="monospace">20%</text>
                  <text x="480" y="220" fill="#ffaa00" fontSize="11" fontFamily="monospace" fontWeight="bold">25%</text>
                  <text x="680" y="220" fill="#ff0000" fontSize="12" fontFamily="monospace" fontWeight="bold">30%</text>
                  <text x="350" y="245" fill="#999" fontSize="11" fontFamily="monospace">RADAR SENSITIVITY →</text>

                  {/* Safe zone (0-20%) */}
                  <rect x="80" y="0" width="200" height="200" fill="rgba(0,255,0,0.05)" />
                  <text x="150" y="100" fill="rgba(0,255,0,0.5)" fontSize="14" fontFamily="monospace" fontWeight="bold">SAFE</text>
                  <text x="140" y="115" fill="rgba(0,255,0,0.5)" fontSize="10" fontFamily="monospace">ZONE</text>

                  {/* Danger zone (20-30%) with gradient fill */}
                  <rect x="280" y="0" width="400" height="200" fill="url(#dangerZoneGradient)" />

                  {/* Critical threshold markers */}
                  <line x="280" y="0" x2="280" y2="200" stroke="#00ff00" strokeWidth="2" strokeDasharray="5,5" />
                  <line x="680" y="0" x2="680" y2="200" stroke="#ff0000" strokeWidth="3" strokeDasharray="5,5" />

                  {/* The exponential curve - animated, BREAKS THROUGH TOP */}
                  <path
                    d={(() => {
                      // Generate exponential curve points that exceed bounds
                      const points: string[] = [];
                      for (let i = 0; i <= 100; i++) {
                        const sensitivity = i / 100; // 0 to 1
                        const x = 80 + sensitivity * 600; // Map to 80-680 pixels

                        let threats;
                        if (sensitivity < 0.2) {
                          // Safe zone: minimal threats
                          threats = 0;
                        } else if (sensitivity >= 0.3) {
                          // Instant chaos: EXCEEDS BOUNDS - goes to 2.5x the scale!
                          threats = 2.5;
                        } else {
                          // Exponential growth in danger zone (0.2-0.3)
                          const normalized = (sensitivity - 0.2) / 0.1;
                          threats = Math.pow(normalized, 3) * 2.5; // Steeper exponential curve
                        }

                        const y = 200 - (threats * 180); // Invert Y axis - can go negative (above viewport)

                        if (i === 0) {
                          points.push(`M ${x} ${y}`);
                        } else {
                          points.push(`L ${x} ${y}`);
                        }
                      }
                      return points.join(' ');
                    })()}
                    fill="none"
                    stroke="#ff3333"
                    strokeWidth="5"
                    filter="url(#glowEffect)"
                    opacity="0.7"
                  />

                  {/* Thicker background for curve visibility */}
                  <path
                    d={(() => {
                      const points: string[] = [];
                      for (let i = 0; i <= 100; i++) {
                        const sensitivity = i / 100;
                        const x = 80 + sensitivity * 600;

                        let threats;
                        if (sensitivity < 0.2) {
                          threats = 0;
                        } else if (sensitivity >= 0.3) {
                          threats = 2.5;
                        } else {
                          const normalized = (sensitivity - 0.2) / 0.1;
                          threats = Math.pow(normalized, 3) * 2.5;
                        }

                        const y = 200 - (threats * 180);

                        if (i === 0) {
                          points.push(`M ${x} ${y}`);
                        } else {
                          points.push(`L ${x} ${y}`);
                        }
                      }
                      return points.join(' ');
                    })()}
                    fill="none"
                    stroke="#ff0000"
                    strokeWidth="10"
                    opacity="0.2"
                  />

                  {/* Numeric labels on curve showing exact threat counts - BIGGER */}
                  {(() => {
                    const labels: Array<{ sens: number; label: string; color: string }> = [
                      { sens: 0.0, label: '0', color: '#00ff00' },
                      { sens: 0.2, label: '0', color: '#00ff00' },
                      { sens: 0.22, label: '7', color: '#88ff00' },
                      { sens: 0.24, label: '31', color: '#ffff00' },
                      { sens: 0.26, label: '82', color: '#ffaa00' },
                      { sens: 0.28, label: '143', color: '#ff6600' },
                      { sens: 0.30, label: '150+', color: '#ff0000' }
                    ];

                    return labels.map((item, idx) => {
                      const x = 80 + item.sens * 600;
                      let threats;
                      if (item.sens < 0.2) {
                        threats = 0;
                      } else if (item.sens >= 0.3) {
                        threats = 2.5;
                      } else {
                        const normalized = (item.sens - 0.2) / 0.1;
                        threats = Math.pow(normalized, 3) * 2.5;
                      }
                      const y = 200 - (threats * 180);

                      return (
                        <g key={idx}>
                          {/* Larger marker on curve */}
                          <circle cx={x} cy={y} r="5" fill={item.color} opacity="0.6" />
                          <circle cx={x} cy={y} r="8" fill="none" stroke={item.color} strokeWidth="2" opacity="0.4" />

                          {/* Label background - BIGGER */}
                          <rect
                            x={x - 25}
                            y={y - 35}
                            width="50"
                            height="24"
                            fill="rgba(0,0,0,0.9)"
                            stroke={item.color}
                            strokeWidth="2"
                            rx="4"
                          />
                          {/* Number - BIGGER */}
                          <text
                            x={x}
                            y={y - 16}
                            fill={item.color}
                            fontSize="16"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {item.label}
                          </text>
                        </g>
                      );
                    });
                  })()}

                  {/* MOTION TRAIL - Shows path history */}
                  {(() => {
                    if (positionTrail.length < 2) return null;

                    const now = Date.now();
                    const maxAge = 30000; // 30 seconds trail

                    return (
                      <>
                        {/* Trail path */}
                        <path
                          d={positionTrail.map((point, idx) =>
                            `${idx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                          ).join(' ')}
                          fill="none"
                          stroke="#00ffff"
                          strokeWidth="3"
                          opacity="0.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Glow effect on trail */}
                        <path
                          d={positionTrail.map((point, idx) =>
                            `${idx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                          ).join(' ')}
                          fill="none"
                          stroke="#00ffff"
                          strokeWidth="1"
                          opacity="0.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter="url(#glowEffect)"
                        />

                        {/* Trail points with fade-out effect */}
                        {positionTrail.map((point, idx) => {
                          const age = now - point.timestamp;
                          const opacity = Math.max(0.1, 1 - (age / maxAge));
                          const isRecent = idx >= positionTrail.length - 5;

                          return (
                            <g key={`trail-${idx}`}>
                              {/* Small dots along the path */}
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={isRecent ? "4" : "2"}
                                fill="#00ffff"
                                opacity={opacity * 0.6}
                              />
                              {/* Glow for recent points */}
                              {isRecent && (
                                <circle
                                  cx={point.x}
                                  cy={point.y}
                                  r="6"
                                  fill="none"
                                  stroke="#00ffff"
                                  strokeWidth="1"
                                  opacity={opacity * 0.3}
                                />
                              )}
                            </g>
                          );
                        })}

                        {/* Direction indicators (arrows showing movement direction) */}
                        {positionTrail.length > 5 && (() => {
                          const recentPoints = positionTrail.slice(-10);
                          const arrows = [];

                          for (let i = 1; i < recentPoints.length; i += 2) {
                            const p1 = recentPoints[i - 1];
                            const p2 = recentPoints[i];

                            // Calculate direction
                            const dx = p2.x - p1.x;
                            const dy = p2.y - p1.y;
                            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                            arrows.push(
                              <g key={`arrow-${i}`} transform={`translate(${p2.x},${p2.y}) rotate(${angle})`}>
                                <polygon
                                  points="0,0 -6,-3 -6,3"
                                  fill="#00ffff"
                                  opacity="0.5"
                                />
                              </g>
                            );
                          }

                          return arrows;
                        })()}
                      </>
                    );
                  })()}

                  {/* YOUR POSITION - Locked in center with crosshair */}
                  {(() => {
                    const currentSens = sensitivity[0] * 10;
                    const x = 80 + currentSens * 600;

                    let threats = 0;
                    if (currentSens < 0.2) {
                      threats = 0;
                    } else if (currentSens >= 0.3) {
                      threats = 2.5;
                    } else {
                      const normalized = (currentSens - 0.2) / 0.1;
                      threats = Math.pow(normalized, 3) * 2.5;
                    }
                    const y = 200 - (threats * 180);

                    return (
                      <>
                        {/* Larger crosshair targeting reticle */}
                        <circle cx={x} cy={y} r="40" fill="none" stroke="#00ffff" strokeWidth="3" opacity="0.6">
                          <animate attributeName="r" values="40;50;40" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.6;0.3;0.6" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={x} cy={y} r="25" fill="none" stroke="#00ffff" strokeWidth="2" opacity="0.8" />

                        {/* Crosshair lines - BIGGER */}
                        <line x1={x - 55} y1={y} x2={x - 28} y2={y} stroke="#00ffff" strokeWidth="4" opacity="0.8" />
                        <line x1={x + 55} y1={y} x2={x + 28} y2={y} stroke="#00ffff" strokeWidth="4" opacity="0.8" />
                        <line x1={x} y1={y - 55} x2={x} y2={y - 28} stroke="#00ffff" strokeWidth="4" opacity="0.8" />
                        <line x1={x} y1={y + 55} x2={x} y2={y + 28} stroke="#00ffff" strokeWidth="4" opacity="0.8" />

                        {/* Central point - BIGGER pulsing */}
                        <circle cx={x} cy={y} r="12" fill="#ffff00" opacity="0.9">
                          <animate attributeName="r" values="12;18;12" dur="1s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={x} cy={y} r="6" fill="#ffffff" />

                        {/* Climb rate indicator - shows if going up */}
                        {threats > 0.1 && (
                          <>
                            <polygon
                              points={`${x},${y - 70} ${x - 10},${y - 55} ${x + 10},${y - 55}`}
                              fill="#ff0000"
                              opacity="0.8"
                            >
                              <animate attributeName="opacity" values="0.8;0.3;0.8" dur="0.6s" repeatCount="indefinite" />
                            </polygon>
                            <text x={x} y={y - 80} fill="#ff0000" fontSize="12" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                              CLIMBING
                            </text>
                          </>
                        )}

                        {/* Altitude/Threat indicator bar next to point - BIGGER */}
                        <rect x={x + 60} y={y - 60} width="12" height="120" fill="rgba(0,0,0,0.8)" stroke="#00ffff" strokeWidth="2" />
                        <rect
                          x={x + 60}
                          y={y + 60 - (threats / 2.5 * 120)}
                          width="12"
                          height={threats / 2.5 * 120}
                          fill={threats < 0.5 ? "#00ff00" : threats < 1.5 ? "#ffff00" : "#ff0000"}
                        />
                        {/* Threat level text */}
                        <text x={x + 80} y={y} fill="#00ffff" fontSize="14" fontFamily="monospace" fontWeight="bold">
                          {Math.floor((threats / 2.5) * 100)}%
                        </text>
                      </>
                    );
                  })()}

                  {/* Reference markers in scrolling background */}
                  {(() => {
                    const currentSens = sensitivity[0] * 10;
                    const markers = [];

                    // Show reference points along the path
                    for (let i = 0; i <= 10; i++) {
                      const sens = i / 10;
                      const x = 80 + sens * 600;
                      let threats = 0;

                      if (sens < 0.2) {
                        threats = 0;
                      } else if (sens >= 0.3) {
                        threats = 2.5;
                      } else {
                        const normalized = (sens - 0.2) / 0.1;
                        threats = Math.pow(normalized, 3) * 2.5;
                      }
                      const y = 200 - (threats * 180);

                      // Only show markers we've passed or are near
                      if (sens <= currentSens + 0.1) {
                        const isPassed = sens < currentSens;
                        markers.push(
                          <g key={i}>
                            <circle
                              cx={x}
                              cy={y}
                              r="3"
                              fill={isPassed ? "#666" : "#00ff00"}
                              opacity={isPassed ? 0.3 : 0.6}
                            />
                            <text
                              x={x}
                              y={y + 15}
                              fill={isPassed ? "#666" : "#00ff00"}
                              fontSize="8"
                              fontFamily="monospace"
                              textAnchor="middle"
                              opacity={isPassed ? 0.3 : 0.6}
                            >
                              {(sens * 100).toFixed(0)}%
                            </text>
                          </g>
                        );
                      }
                    }
                    return markers;
                  })()}

                  {/* Arrow marker */}
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                      <polygon points="0 0, 10 5, 0 10" fill="#ff0000" />
                    </marker>
                  </defs>

                  {/* Animation styles */}
                  <style>
                    {`
                      @keyframes drawCurve {
                        from {
                          stroke-dashoffset: 1000;
                        }
                        to {
                          stroke-dashoffset: 0;
                        }
                      }
                    `}
                  </style>
                </svg>

                {/* Legend below graph */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-6 text-[9px] font-mono">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500/30 border border-green-500"></div>
                    <span className="text-green-400">Safe Zone</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500/30 border border-red-500"></div>
                    <span className="text-red-400">Danger Zone</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span className="text-yellow-400">Your Position</span>
                  </div>
                </div>
              </div>

              {/* Dramatic warning text with exact numbers */}
              <div className="mt-4 space-y-3">
                <div className="text-center bg-red-950/30 border border-red-500/50 p-3 rounded">
                  <p className="text-xs text-red-400 font-bold tracking-wide mb-2">
                    📊 EXPONENTIAL ESCALATION ANALYSIS
                  </p>
                  <div className="space-y-1 text-left text-[10px] font-mono">
                    <div className="flex justify-between border-b border-red-500/20 pb-1">
                      <span className="text-muted-foreground">20% → 22% (+2%)</span>
                      <span className="text-orange-400 font-bold">0 → 7 conflicts (+700%)</span>
                    </div>
                    <div className="flex justify-between border-b border-red-500/20 pb-1">
                      <span className="text-muted-foreground">22% → 24% (+2%)</span>
                      <span className="text-orange-400 font-bold">7 → 31 conflicts (+343%)</span>
                    </div>
                    <div className="flex justify-between border-b border-red-500/20 pb-1">
                      <span className="text-muted-foreground">24% → 26% (+2%)</span>
                      <span className="text-red-400 font-bold">31 → 82 conflicts (+165%)</span>
                    </div>
                    <div className="flex justify-between border-b border-red-500/20 pb-1">
                      <span className="text-muted-foreground">26% → 28% (+2%)</span>
                      <span className="text-red-400 font-bold">82 → 143 conflicts (+74%)</span>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-red-300 font-bold">28% → 30% (+2%)</span>
                      <span className="text-red-500 font-bold animate-pulse">143 → 150+ TOTAL CHAOS</span>
                    </div>
                  </div>
                </div>
                <p className="text-center text-[10px] text-orange-300 italic">
                  The curve physically breaks through containment, symbolizing uncontrollable escalation beyond all safety limits
                </p>
              </div>
            </div>

            {/* Conflict Escalation Timeline */}
            {conflictHistory.length > 1 && (
              <div className="bg-background/50 border border-primary/30 p-4">
                <h3 className="text-xs text-primary tracking-wider mb-3">CONFLICT ESCALATION TIMELINE</h3>
                <div className="relative h-48 border border-primary/20">
                  <svg className="w-full h-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                    {/* Grid lines */}
                    <line x1="0" y1="45" x2="600" y2="45" stroke="rgba(255,51,51,0.1)" strokeWidth="1" />
                    <line x1="0" y1="90" x2="600" y2="90" stroke="rgba(255,51,51,0.1)" strokeWidth="1" />
                    <line x1="0" y1="135" x2="600" y2="135" stroke="rgba(255,51,51,0.1)" strokeWidth="1" />
                    
                    {/* Conflict line */}
                    {conflictHistory.length > 1 && (() => {
                      const maxConflicts = Math.max(...conflictHistory.map(h => h.conflicts), 1);
                      const points = conflictHistory.map((h, i) => {
                        const x = (i / (conflictHistory.length - 1)) * 600;
                        const y = 170 - (h.conflicts / maxConflicts) * 160;
                        return `${x},${y}`;
                      }).join(' ');
                      return <polyline points={points} fill="none" stroke="#ff3333" strokeWidth="3" />;
                    })()}
                    
                    {/* Threat line */}
                    {conflictHistory.length > 1 && (() => {
                      const maxThreats = Math.max(...conflictHistory.map(h => h.threats), 1);
                      const points = conflictHistory.map((h, i) => {
                        const x = (i / (conflictHistory.length - 1)) * 600;
                        const y = 170 - (h.threats / maxThreats) * 160;
                        return `${x},${y}`;
                      }).join(' ');
                      return <polyline points={points} fill="none" stroke="#ff9933" strokeWidth="2" strokeDasharray="5,5" />;
                    })()}
                  </svg>
                  <div className="absolute top-2 right-2 flex gap-4 text-[10px]">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-0.5 bg-red-500"></div>
                      <span className="text-muted-foreground">Conflicts</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-0.5 bg-orange-400" style={{ borderTop: '2px dashed' }}></div>
                      <span className="text-muted-foreground">Threats</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
                  <span>Start</span>
                  <span>Current Time</span>
                </div>
              </div>
            )}

            {/* Conflict Type Breakdown */}
            <div className="bg-background/50 border border-primary/30 p-4">
              <h3 className="text-xs text-primary tracking-wider mb-3">CONFLICT TYPE BREAKDOWN</h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">DIRECT ASSAULTS ({selectedCountry} → Others)</span>
                    <span className="text-orange-400">{enemyCountries.length}</span>
                  </div>
                  <div className="w-full bg-background h-6 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-600 to-orange-400 flex items-center justify-center"
                      style={{ width: `${(enemyCountries.length + chainConflicts.length + randomConflicts.length) > 0 ? (enemyCountries.length / (enemyCountries.length + chainConflicts.length + randomConflicts.length)) * 100 : 0}%` }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">
                        {((enemyCountries.length + chainConflicts.length + randomConflicts.length) > 0 ? ((enemyCountries.length / (enemyCountries.length + chainConflicts.length + randomConflicts.length)) * 100).toFixed(0) : 0)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">CHAIN REACTIONS (Cascading Conflicts)</span>
                    <span className="text-yellow-400">{chainConflicts.length}</span>
                  </div>
                  <div className="w-full bg-background h-6 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-600 to-yellow-400 flex items-center justify-center"
                      style={{ width: `${(enemyCountries.length + chainConflicts.length + randomConflicts.length) > 0 ? (chainConflicts.length / (enemyCountries.length + chainConflicts.length + randomConflicts.length)) * 100 : 0}%` }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">
                        {((enemyCountries.length + chainConflicts.length + randomConflicts.length) > 0 ? ((chainConflicts.length / (enemyCountries.length + chainConflicts.length + randomConflicts.length)) * 100).toFixed(0) : 0)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">GLOBAL WARFARE (Random Engagements)</span>
                    <span className="text-red-400">{randomConflicts.length}</span>
                  </div>
                  <div className="w-full bg-background h-6 relative overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-red-400 flex items-center justify-center"
                      style={{ width: `${(enemyCountries.length + chainConflicts.length + randomConflicts.length) > 0 ? (randomConflicts.length / (enemyCountries.length + chainConflicts.length + randomConflicts.length)) * 100 : 0}%` }}
                    >
                      <span className="text-[10px] font-bold text-white drop-shadow">
                        {((enemyCountries.length + chainConflicts.length + randomConflicts.length) > 0 ? ((randomConflicts.length / (enemyCountries.length + chainConflicts.length + randomConflicts.length)) * 100).toFixed(0) : 0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sensitivity Impact Analysis */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background/50 border border-primary/30 p-4">
                <h3 className="text-xs text-primary tracking-wider mb-3">CURRENT SENSITIVITY LEVEL</h3>
                <div className="flex items-center justify-center h-32">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="rgba(255,51,51,0.2)"
                        strokeWidth="8"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="#ff3333"
                        strokeWidth="8"
                        strokeDasharray={`${2 * Math.PI * 56}`}
                        strokeDashoffset={`${2 * Math.PI * 56 * (1 - sensitivity[0] * 10)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-3xl font-bold text-primary">{(sensitivity[0] * 1000).toFixed(0)}%</p>
                      <p className="text-[10px] text-muted-foreground">SENSITIVITY</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-background/50 border border-primary/30 p-4">
                <h3 className="text-xs text-primary tracking-wider mb-3">ESCALATION RISK</h3>
                <div className="space-y-3 mt-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Threat Detection</span>
                      <span className={sensitivity[0] >= 0.03 ? "text-red-400" : sensitivity[0] >= 0.025 ? "text-yellow-400" : "text-green-400"}>
                        {sensitivity[0] >= 0.03 ? "CRITICAL" : sensitivity[0] >= 0.025 ? "ELEVATED" : "MINIMAL"}
                      </span>
                    </div>
                    <div className="w-full bg-background h-2">
                      <div
                        className={`h-full ${sensitivity[0] >= 0.03 ? "bg-red-500" : sensitivity[0] >= 0.025 ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ width: `${sensitivity[0] * 1000}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Conflict Probability</span>
                      <span className="text-orange-400">{((enemyCountries.length / Math.max(countries.length - 1, 1)) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-background h-2">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-600 to-red-600"
                        style={{ width: `${(enemyCountries.length / Math.max(countries.length - 1, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Global Instability</span>
                      <span className="text-red-400">
                        {((randomConflicts.length / Math.max(enemyCountries.length + chainConflicts.length + randomConflicts.length, 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-background h-2">
                      <div 
                        className="h-full bg-red-600"
                        style={{ width: `${(randomConflicts.length / Math.max(enemyCountries.length + chainConflicts.length + randomConflicts.length, 1)) * 100}%` }}
                      />
                    </div>
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

            {/* Combat Summary */}
            <div className="bg-background/50 border-2 border-red-500/50 p-6">
              <div className="text-center space-y-2">
                <h3 className="text-sm text-primary tracking-wider text-glow">SITUATION ANALYSIS</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Current sensitivity settings have triggered <span className="text-red-500 font-bold">{enemyCountries.length + chainConflicts.length + randomConflicts.length}</span> active conflicts.
                  {sensitivity[0] >= 0.03 && " CRITICAL: Global warfare imminent. Total chaos achieved."}
                  {sensitivity[0] >= 0.025 && sensitivity[0] < 0.03 && " WARNING: Conflicts spreading rapidly through chain reactions."}
                  {sensitivity[0] >= 0.02 && sensitivity[0] < 0.025 && " ALERT: Regional tensions detected. Monitor situation closely."}
                  {sensitivity[0] < 0.02 && " STATUS: All systems nominal. No active conflicts detected."}
                </p>
                <div className="pt-4 border-t border-primary/20">
                  <p className="text-[10px] text-muted-foreground italic">
                    "{sensitivity[0] >= 0.025 ? "The smallest spark can ignite the greatest inferno." : "Peace is maintained by constant vigilance."}"
                  </p>
                </div>
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

      {/* Tutorial Modal */}
      <Dialog open={showTutorial} onOpenChange={(open) => {
        if (!open) {
          setShowTutorial(false);
          setTimerStarted(true);
        }
      }}>
        <DialogContent className="bg-card/95 border-2 border-primary max-w-2xl backdrop-blur-sm p-0 max-h-[80vh] flex flex-col">
          <div className="px-6 pt-6 pb-4 border-b border-primary/30">
            <DialogHeader>
              <DialogTitle className="text-primary tracking-wider text-glow text-xl">MISSION BRIEFING</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Welcome to SKYTRACK COMMAND - {selectedCountry.toUpperCase()}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="overflow-y-auto px-6 py-4 space-y-5 text-sm text-muted-foreground leading-relaxed flex-1">
            <div className="bg-primary/5 border border-primary/30 p-4 rounded">
              <h3 className="text-primary font-bold mb-2 tracking-wider">🎯 OBJECTIVE</h3>
              <p>
                You are in command of <span className="text-primary font-bold">{selectedCountry}</span>'s defense systems. 
                Your mission: <span className="text-yellow-400 font-bold">Survive for 10 minutes</span> without triggering global nuclear warfare.
              </p>
            </div>

            <div className="bg-orange-950/20 border border-orange-500/30 p-4 rounded">
              <h3 className="text-orange-400 font-bold mb-2 tracking-wider">⚠️ THREAT DETECTION</h3>
              <p>
                Use the <span className="text-orange-400 font-bold">SENSITIVITY SLIDER</span> to control your radar detection level:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li><span className="text-green-400">Below 20%</span>: Safe zone - no threats detected</li>
                <li><span className="text-yellow-400">20-25%</span>: Danger zone begins - conflicts start emerging</li>
                <li><span className="text-orange-400">25-30%</span>: Rapid escalation - chain reactions multiplying</li>
                <li><span className="text-red-400">30% and above</span>: INSTANT CHAOS - total global warfare</li>
              </ul>
            </div>

            <div className="bg-red-950/20 border border-red-500/30 p-4 rounded">
              <h3 className="text-red-400 font-bold mb-2 tracking-wider">☢️ WARNING: CHAOS THEORY IN ACTION</h3>
              <p>
                <span className="text-red-400 font-bold">Every aircraft detected is a potential trigger</span> for conflict. 
                Higher sensitivity = More threats = More conflicts = Chain reactions of retaliation.
              </p>
              <p className="mt-2">
                Watch the <span className="text-primary font-bold">COMBAT STATISTICS</span> panel (bottom-left) to monitor escalation. 
                Click it to view detailed analytics.
              </p>
            </div>

            <div className="bg-blue-950/20 border border-blue-500/30 p-4 rounded">
              <h3 className="text-blue-400 font-bold mb-2 tracking-wider">🎮 CONTROLS</h3>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Adjust the <span className="text-orange-400">sensitivity slider</span> on the right to control threat detection</li>
                <li>Click on <span className="text-green-400">aircraft icons</span> to view detailed information</li>
                <li>Watch the <span className="text-yellow-400">timer</span> at the top - survive 10 minutes to win</li>
                <li>Monitor <span className="text-red-400">missile paths</span> showing active conflicts</li>
              </ul>
            </div>

            <div className="text-center pt-2 pb-4">
              <p className="text-primary font-bold animate-pulse text-base">
                The timer will begin when you start the mission.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Good luck, Commander. The fate of {selectedCountry} is in your hands.
              </p>
            </div>
            
            <div className="text-center text-xs text-primary/60 animate-pulse pb-2">
              ↓ Scroll down to continue ↓
            </div>
          </div>

          <div className="px-6 py-4 border-t border-primary/30 flex justify-center bg-card/50">
            <Button 
              onClick={() => {
                setShowTutorial(false);
                setTimerStarted(true);
              }}
              className="px-8 py-3 text-lg font-bold tracking-wider bg-primary/20 hover:bg-primary/30 border-2 border-primary animate-pulse"
            >
              BEGIN MISSION
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attack Statistics Panel - Bottom Left */}
      <div className="absolute bottom-8 left-8 bg-card/95 border-2 border-primary px-6 py-4 z-20 animate-scale-in min-w-[280px]">
        <button
          onClick={() => setShowThreatsDashboard(true)}
          className="w-full hover:bg-primary/10 transition-colors -mx-6 -mt-4 px-6 py-2 mb-3"
        >
          <h3 className="text-xs text-primary tracking-wider text-glow text-center border-b border-primary/30 pb-2 hover:text-primary/80">
            COMBAT STATISTICS ▶
          </h3>
        </button>
        <div className="space-y-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground tracking-wide text-center">ATTACKS RECEIVED</span>
            <span className="text-sm text-red-400 font-mono font-bold animate-pulse">{enemyCountries.length}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground tracking-wide text-center">ATTACKS SENT</span>
            <span className="text-sm text-orange-400 font-mono font-bold animate-pulse">{chainConflicts.length}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground tracking-wide text-center">RANDOM CONFLICTS</span>
            <span className="text-sm text-yellow-400 font-mono font-bold animate-pulse">{randomConflicts.length}</span>
          </div>
          <div className="border-t border-primary/30 pt-2 mt-2">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-primary tracking-wide font-bold text-center">TOTAL CONFLICTS</span>
              <span className="text-base text-primary font-mono font-bold text-glow animate-pulse">
                {enemyCountries.length + chainConflicts.length + randomConflicts.length}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className="text-[10px] text-muted-foreground tracking-wide text-center">THREAT LEVEL</span>
            <span
              className="text-sm font-mono font-bold"
              style={{ color: `hsl(${120 - sensitivity[0] * 1200}, 100%, 50%)` }}
            >
              {(sensitivity[0] * 1000).toFixed(0)}%
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className="text-[10px] text-muted-foreground tracking-wide text-center">COUNTRIES AFFECTED</span>
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
            color: `hsl(${120 - sensitivity[0] * 1200}, 100%, 50%)`
          }}>
            RADAR SENSITIVITY
          </p>
          <div className="w-64">
            <Slider
              value={sensitivity}
              onValueChange={setSensitivity}
              max={0.1}
              step={0.001}
              className="cursor-pointer"
            />
          </div>
          <div className="flex justify-between items-center text-xs gap-4">
            <p className="text-muted-foreground font-mono">
              {sensitivity[0].toFixed(3)}
            </p>
            <p className="text-orange-400 font-mono text-[10px]">
              {visibleAircraft.length} THREATS
            </p>
            <button
              onClick={() => setShowThreatsDashboard(true)}
              className="text-primary font-mono text-[10px] hover:text-primary/80 hover:underline cursor-pointer transition-colors"
              disabled={enemyCountries.length + chainConflicts.length + randomConflicts.length === 0}
            >
              {enemyCountries.length + chainConflicts.length + randomConflicts.length} {(enemyCountries.length + chainConflicts.length + randomConflicts.length) === 1 ? 'CONFLICT' : 'CONFLICTS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
