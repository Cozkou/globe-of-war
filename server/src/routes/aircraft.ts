/**
 * Aircraft API Routes
 * 
 * Defines the REST API endpoints for aircraft data.
 * Main endpoint: GET /api/aircraft
 */

import { Router, type Request, type Response } from 'express';
import { fetchAllAircraftStates } from '../services/opensky-client.js';
import { getOrSet } from '../middleware/cache.js';
import type { AppConfig } from '../config/config.js';
import type { BoundingBox } from '../types/aircraft.js';

/**
 * Creates and configures the aircraft router
 * 
 * @param config - Application configuration
 * @returns Configured Express router
 */
export function createAircraftRouter(config: AppConfig): Router {
  const router = Router();
  
  /**
   * GET /api/aircraft
   * 
   * Fetches live aircraft state data from OpenSky Network API.
   * 
   * Query Parameters (all optional):
   * - lamin: Minimum latitude for bounding box filter
   * - lamax: Maximum latitude for bounding box filter
   * - lomin: Minimum longitude for bounding box filter
   * - lomax: Maximum longitude for bounding box filter
   * 
   * Response:
   * - 200: Success - Returns array of aircraft objects
   * - 500: Server error - Error fetching data from OpenSky API
   * 
   * Example Request:
   * GET /api/aircraft
   * GET /api/aircraft?lamin=50&lamax=60&lomin=-10&lomax=2
   * 
   * Example Response:
   * [
   *   {
   *     "icao24": "abc123",
   *     "callsign": "UAL123",
   *     "originCountry": "United States",
   *     "latitude": 51.5074,
   *     "longitude": -0.1278,
   *     "barometricAltitude": 10000,
   *     ...
   *   }
   * ]
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      // Parse optional bounding box query parameters
      const bbox = parseBoundingBox(req.query);
      
      // Create cache key based on bounding box parameters
      const cacheKey = bbox
        ? `aircraft:${bbox.minLatitude},${bbox.maxLatitude},${bbox.minLongitude},${bbox.maxLongitude}`
        : 'aircraft:all';
      
      // Fetch aircraft data (with caching if enabled)
      const aircraft = await getOrSet(
        cacheKey,
        async () => {
          return await fetchAllAircraftStates({
            bbox: bbox || undefined,
            username: config.opensky.username,
            password: config.opensky.password,
          });
        },
        config.cache.ttl
      );
      
      // Return successful response with aircraft data
      res.status(200).json({
        success: true,
        count: aircraft.length,
        data: aircraft,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Handle errors gracefully
      console.error('Error fetching aircraft data:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      res.status(500).json({
        success: false,
        error: 'Failed to fetch aircraft data from OpenSky API',
        message: errorMessage,
        timestamp: Date.now(),
      });
    }
  });
  
  /**
   * GET /api/aircraft/health
   * 
   * Health check endpoint to verify the aircraft API is functioning.
   * 
   * Response:
   * - 200: Service is healthy
   */
  router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      service: 'aircraft-api',
      timestamp: Date.now(),
    });
  });
  
  return router;
}

/**
 * Parses bounding box parameters from query string
 * 
 * @param query - Express request query object
 * @returns BoundingBox object or null if parameters are invalid/missing
 */
function parseBoundingBox(query: any): BoundingBox | null {
  const lamin = parseFloat(query.lamin);
  const lamax = parseFloat(query.lamax);
  const lomin = parseFloat(query.lomin);
  const lomax = parseFloat(query.lomax);
  
  // Check if all parameters are provided and valid
  if (
    isNaN(lamin) ||
    isNaN(lamax) ||
    isNaN(lomin) ||
    isNaN(lomax)
  ) {
    return null;
  }
  
  // Validate latitude range (-90 to 90)
  if (lamin < -90 || lamax > 90 || lamin > lamax) {
    return null;
  }
  
  // Validate longitude range (-180 to 180)
  if (lomin < -180 || lomax > 180 || lomin > lomax) {
    return null;
  }
  
  return {
    minLatitude: lamin,
    maxLatitude: lamax,
    minLongitude: lomin,
    maxLongitude: lomax,
  };
}

