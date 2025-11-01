/**
 * OpenSky Network API Client
 * 
 * This module handles all interactions with the OpenSky Network REST API.
 * It provides functions to fetch live aircraft state data, parse responses,
 * and handle errors gracefully.
 * 
 * API Documentation: https://openskynetwork.github.io/opensky-api/
 */

import type {
  Aircraft,
  RawAircraftState,
  OpenSkyResponse,
  OpenSkyRequestOptions,
  BoundingBox,
} from '../types/aircraft.js';

/**
 * Base URL for OpenSky Network REST API
 */
const OPENSKY_API_BASE_URL = 'https://opensky-network.org/api';

/**
 * Fetches all aircraft states from OpenSky API
 * 
 * This function sends a GET request to the `/states/all` endpoint which
 * returns the current state vectors of all aircraft being tracked by
 * OpenSky Network.
 * 
 * @param options - Optional configuration for the API request
 * @returns Promise resolving to an array of parsed Aircraft objects
 * @throws Error if the API request fails or response is invalid
 * 
 * @example
 * // Fetch all aircraft
 * const aircraft = await fetchAllAircraftStates();
 * 
 * @example
 * // Fetch aircraft within a specific region (UK)
 * const aircraft = await fetchAllAircraftStates({
 *   bbox: {
 *     minLatitude: 50.0,
 *     maxLatitude: 60.0,
 *     minLongitude: -10.0,
 *     maxLongitude: 2.0
 *   }
 * });
 */
export async function fetchAllAircraftStates(
  options: OpenSkyRequestOptions = {}
): Promise<Aircraft[]> {
  try {
    // Build the API URL
    const url = buildApiUrl('/states/all', options);
    
    // Prepare authentication headers if credentials are provided
    const headers: HeadersInit = {};
    if (options.username && options.password) {
      // Create Basic Auth credentials using Node.js Buffer
      const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }
    
    // Fetch data from OpenSky API
    const response = await fetch(url, {
      method: 'GET',
      headers,
      // OpenSky recommends a timeout of 10 seconds
      signal: AbortSignal.timeout(10000),
    });
    
    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `OpenSky API request failed with status ${response.status}: ${errorText}`
      );
    }
    
    // Parse JSON response
    const data: OpenSkyResponse = await response.json();
    
    // Validate response structure
    if (!data || typeof data.time !== 'number') {
      throw new Error('Invalid response format from OpenSky API');
    }
    
    // Parse and return aircraft states
    if (!data.states || data.states.length === 0) {
      return [];
    }
    
    return parseAircraftStates(data.states);
  } catch (error) {
    // Handle different types of errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('OpenSky API request timed out after 10 seconds');
      }
      throw error;
    }
    throw new Error(`Unexpected error fetching aircraft data: ${error}`);
  }
}

/**
 * Builds the full API URL with optional query parameters
 * 
 * @param endpoint - API endpoint path (e.g., '/states/all')
 * @param options - Request options including optional bounding box
 * @returns Complete URL string with query parameters
 */
function buildApiUrl(endpoint: string, options: OpenSkyRequestOptions): string {
  const url = new URL(`${OPENSKY_API_BASE_URL}${endpoint}`);
  
  // Add bounding box parameters if provided
  if (options.bbox) {
    url.searchParams.append('lamin', options.bbox.minLatitude.toString());
    url.searchParams.append('lamax', options.bbox.maxLatitude.toString());
    url.searchParams.append('lomin', options.bbox.minLongitude.toString());
    url.searchParams.append('lomax', options.bbox.maxLongitude.toString());
  }
  
  return url.toString();
}

/**
 * Parses raw aircraft state arrays into typed Aircraft objects
 * 
 * The OpenSky API returns aircraft data as arrays of 17 elements.
 * This function extracts and validates the relevant fields, handling
 * null values appropriately.
 * 
 * @param rawStates - Array of raw aircraft state arrays from OpenSky API
 * @returns Array of parsed and typed Aircraft objects
 */
function parseAircraftStates(rawStates: RawAircraftState[]): Aircraft[] {
  return rawStates
    .map((state) => {
      try {
        return parseAircraftState(state);
      } catch (error) {
        // Log parsing errors but continue processing other aircraft
        console.error('Error parsing aircraft state:', error);
        return null;
      }
    })
    .filter((aircraft): aircraft is Aircraft => aircraft !== null);
}

/**
 * Parses a single raw aircraft state array into an Aircraft object
 * 
 * @param state - Raw aircraft state array from OpenSky API
 * @returns Parsed Aircraft object
 * @throws Error if required fields (icao24) are missing
 */
function parseAircraftState(state: RawAircraftState): Aircraft {
  // Validate that we have at least the ICAO24 identifier
  if (!state[0] || typeof state[0] !== 'string') {
    throw new Error('Missing or invalid ICAO24 identifier');
  }
  
  return {
    icao24: state[0].trim().toUpperCase(),
    callsign: state[1] ? state[1].trim() || null : null,
    originCountry: state[2] ? state[2].trim() || null : null,
    latitude: typeof state[6] === 'number' ? state[6] : null,
    longitude: typeof state[5] === 'number' ? state[5] : null,
    barometricAltitude: typeof state[7] === 'number' ? state[7] : null,
    geometricAltitude: typeof state[13] === 'number' ? state[13] : null,
    velocity: typeof state[9] === 'number' ? state[9] : null,
    heading: typeof state[10] === 'number' ? state[10] : null,
    verticalRate: typeof state[11] === 'number' ? state[11] : null,
    onGround: typeof state[8] === 'boolean' ? state[8] : null,
    timePosition: typeof state[3] === 'number' ? state[3] : null,
    lastContact: typeof state[4] === 'number' ? state[4] : null,
    squawk: state[14] ? state[14].toString().trim() || null : null,
    spi: typeof state[15] === 'boolean' ? state[15] : null,
    positionSource: typeof state[16] === 'number' ? state[16] : null,
  };
}

/**
 * Validates aircraft data to ensure it contains valid coordinates
 * 
 * @param aircraft - Aircraft object to validate
 * @returns True if the aircraft has valid latitude and longitude
 */
export function isValidAircraftPosition(aircraft: Aircraft): boolean {
  return (
    aircraft.latitude !== null &&
    aircraft.longitude !== null &&
    aircraft.latitude >= -90 &&
    aircraft.latitude <= 90 &&
    aircraft.longitude >= -180 &&
    aircraft.longitude <= 180
  );
}

