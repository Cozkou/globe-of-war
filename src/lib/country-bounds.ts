/**
 * Utility functions for calculating country bounding boxes
 * and building API URLs for aircraft data
 */

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/**
 * Calculate bounding box from GeoJSON geometry
 */
export function calculateBoundingBox(geometry: {
  type: string;
  coordinates: number[][][] | number[][][][];
}): BoundingBox {
  let allCoords: number[][] = [];

  if (geometry.type === 'Polygon') {
    // Polygon coordinates are an array of rings, first ring is exterior
    const rings = geometry.coordinates as number[][][];
    rings.forEach(ring => {
      allCoords.push(...ring);
    });
  } else if (geometry.type === 'MultiPolygon') {
    // MultiPolygon coordinates are an array of polygons
    const polygons = geometry.coordinates as number[][][][];
    polygons.forEach(polygon => {
      polygon.forEach(ring => {
        allCoords.push(...ring);
      });
    });
  }

  if (allCoords.length === 0) {
    throw new Error('No coordinates found in geometry');
  }

  // Extract all latitudes and longitudes
  const latitudes = allCoords.map(coord => coord[1]);
  const longitudes = allCoords.map(coord => coord[0]);

  // Calculate min/max
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  // Add a small buffer (1 degree) to ensure we capture nearby aircraft
  const buffer = 1.0;

  return {
    minLatitude: Math.max(-90, minLatitude - buffer),
    maxLatitude: Math.min(90, maxLatitude + buffer),
    minLongitude: Math.max(-180, minLongitude - buffer),
    maxLongitude: Math.min(180, maxLongitude + buffer),
  };
}

/**
 * Build API URL for fetching aircraft data with bounding box
 */
export function buildAircraftApiUrl(bbox: BoundingBox): string {
  const params = new URLSearchParams({
    lamin: bbox.minLatitude.toString(),
    lamax: bbox.maxLatitude.toString(),
    lomin: bbox.minLongitude.toString(),
    lomax: bbox.maxLongitude.toString(),
  });

  return `/api/aircraft?${params.toString()}`;
}

