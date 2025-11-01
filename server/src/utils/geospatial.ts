/**
 * Geospatial utility functions for aircraft tracking
 * 
 * Provides helper functions for calculating distances, bearings,
 * and other geographic calculations useful for aircraft proximity
 * and border distance analysis.
 */

/**
 * Calculate the great-circle distance between two points on Earth
 * using the Haversine formula.
 * 
 * @param lat1 - Latitude of first point in decimal degrees
 * @param lon1 - Longitude of first point in decimal degrees
 * @param lat2 - Latitude of second point in decimal degrees
 * @param lon2 - Longitude of second point in decimal degrees
 * @returns Distance in kilometers
 * 
 * @example
 * const distance = calculateDistance(51.5074, -0.1278, 48.8566, 2.3522);
 * // Returns approximately 343.8 km (distance between London and Paris)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Calculate the initial bearing (azimuth) from one point to another.
 * 
 * @param lat1 - Latitude of starting point in decimal degrees
 * @param lon1 - Longitude of starting point in decimal degrees
 * @param lat2 - Latitude of destination point in decimal degrees
 * @param lon2 - Longitude of destination point in decimal degrees
 * @returns Bearing in degrees (0-360, where 0 is north)
 * 
 * @example
 * const bearing = calculateBearing(51.5074, -0.1278, 48.8566, 2.3522);
 * // Returns the bearing from London to Paris
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = toRadians(lon2 - lon1);
  
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x);
  bearing = toDegrees(bearing);
  bearing = (bearing + 360) % 360;
  
  return bearing;
}

/**
 * Check if a point is within a bounding box.
 * 
 * @param latitude - Latitude of the point to check
 * @param longitude - Longitude of the point to check
 * @param bbox - Bounding box to check against
 * @returns True if the point is within the bounding box
 * 
 * @example
 * const isInside = isWithinBoundingBox(
 *   51.5074, -0.1278,
 *   { minLatitude: 51.0, maxLatitude: 52.0, minLongitude: -1.0, maxLongitude: 0.0 }
 * );
 */
export function isWithinBoundingBox(
  latitude: number,
  longitude: number,
  bbox: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
): boolean {
  return (
    latitude >= bbox.minLatitude &&
    latitude <= bbox.maxLatitude &&
    longitude >= bbox.minLongitude &&
    longitude <= bbox.maxLongitude
  );
}

/**
 * Convert degrees to radians.
 * 
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 * 
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculate the distance from a point to the nearest edge of a bounding box.
 * 
 * @param latitude - Latitude of the point
 * @param longitude - Longitude of the point
 * @param bbox - Bounding box
 * @returns Distance in kilometers to the nearest edge (0 if inside)
 * 
 * @example
 * const distance = distanceToBoundingBox(
 *   50.0, -0.5,
 *   { minLatitude: 51.0, maxLatitude: 52.0, minLongitude: -1.0, maxLongitude: 0.0 }
 * );
 */
export function distanceToBoundingBox(
  latitude: number,
  longitude: number,
  bbox: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
): number {
  if (isWithinBoundingBox(latitude, longitude, bbox)) {
    return 0;
  }
  
  // Find the nearest point on the bounding box
  let nearestLat = latitude;
  let nearestLon = longitude;
  
  if (latitude < bbox.minLatitude) {
    nearestLat = bbox.minLatitude;
  } else if (latitude > bbox.maxLatitude) {
    nearestLat = bbox.maxLatitude;
  }
  
  if (longitude < bbox.minLongitude) {
    nearestLon = bbox.minLongitude;
  } else if (longitude > bbox.maxLongitude) {
    nearestLon = bbox.maxLongitude;
  }
  
  return calculateDistance(latitude, longitude, nearestLat, nearestLon);
}

