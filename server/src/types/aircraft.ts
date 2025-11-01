/**
 * TypeScript type definitions for aircraft data from OpenSky API
 * 
 * These types represent the structure of aircraft state data returned by
 * the OpenSky Network REST API endpoint `/states/all`.
 */

/**
 * Raw aircraft state array from OpenSky API
 * 
 * The OpenSky API returns an array of 17 elements per aircraft:
 * [0] icao24 - Unique ICAO 24-bit address
 * [1] callsign - Aircraft callsign
 * [2] origin_country - Country of origin
 * [3] time_position - Unix timestamp (seconds) for last position update
 * [4] last_contact - Unix timestamp (seconds) for last update
 * [5] longitude - Longitude in decimal degrees
 * [6] latitude - Latitude in decimal degrees
 * [7] baro_altitude - Barometric altitude in meters
 * [8] on_ground - Boolean indicating if aircraft is on ground
 * [9] velocity - Velocity over ground in m/s
 * [10] true_track - True track in decimal degrees clockwise from north (0-360)
 * [11] vertical_rate - Vertical rate in m/s (positive = climbing)
 * [12] sensors - Sensor IDs
 * [13] geo_altitude - Geometric altitude in meters
 * [14] squawk - Transponder code
 * [15] spi - Special purpose indicator
 * [16] position_source - Source of position (0=ADS-B, 1=ASTERIX, 2=MLAT)
 */
export type RawAircraftState = [
  string | null,      // icao24
  string | null,      // callsign
  string | null,      // origin_country
  number | null,      // time_position
  number | null,      // last_contact
  number | null,      // longitude
  number | null,      // latitude
  number | null,      // baro_altitude
  boolean | null,     // on_ground
  number | null,      // velocity
  number | null,      // true_track
  number | null,      // vertical_rate
  number[] | null,    // sensors
  number | null,      // geo_altitude
  string | null,      // squawk
  boolean | null,     // spi
  number | null       // position_source
];

/**
 * Parsed and typed aircraft data structure
 * 
 * This represents a cleaned, validated aircraft object with all
 * relevant fields extracted and properly typed.
 */
export interface Aircraft {
  /** Unique ICAO 24-bit address (hex string) */
  icao24: string;
  
  /** Aircraft callsign (e.g., "UAL123") */
  callsign: string | null;
  
  /** Country of origin (ISO country code) */
  originCountry: string | null;
  
  /** Latitude in decimal degrees (-90 to 90) */
  latitude: number | null;
  
  /** Longitude in decimal degrees (-180 to 180) */
  longitude: number | null;
  
  /** Barometric altitude in meters */
  barometricAltitude: number | null;
  
  /** Geometric altitude in meters */
  geometricAltitude: number | null;
  
  /** Velocity over ground in meters per second */
  velocity: number | null;
  
  /** True track in decimal degrees (0-360, clockwise from north) */
  heading: number | null;
  
  /** Vertical rate in meters per second (positive = climbing, negative = descending) */
  verticalRate: number | null;
  
  /** Whether the aircraft is currently on the ground */
  onGround: boolean | null;
  
  /** Unix timestamp (seconds) of last position update */
  timePosition: number | null;
  
  /** Unix timestamp (seconds) of last contact/update */
  lastContact: number | null;
  
  /** Transponder squawk code */
  squawk: string | null;
  
  /** Special purpose indicator */
  spi: boolean | null;
  
  /** Position source (0=ADS-B, 1=ASTERIX, 2=MLAT) */
  positionSource: number | null;
}

/**
 * OpenSky API response structure
 */
export interface OpenSkyResponse {
  /** Unix timestamp when the response was generated */
  time: number;
  
  /** Array of aircraft state arrays */
  states: RawAircraftState[] | null;
}

/**
 * Bounding box for filtering aircraft by geographic region
 * 
 * Used to query OpenSky API for aircraft within a specific
 * geographic area defined by latitude and longitude bounds.
 */
export interface BoundingBox {
  /** Minimum latitude in decimal degrees */
  minLatitude: number;
  
  /** Maximum latitude in decimal degrees */
  maxLatitude: number;
  
  /** Minimum longitude in decimal degrees */
  minLongitude: number;
  
  /** Maximum longitude in decimal degrees */
  maxLongitude: number;
}

/**
 * Configuration options for OpenSky API requests
 */
export interface OpenSkyRequestOptions {
  /** Optional bounding box to filter aircraft by geographic region */
  bbox?: BoundingBox;
  
  /** Username for authenticated requests (optional, provides higher rate limits) */
  username?: string;
  
  /** Password for authenticated requests (optional) */
  password?: string;
}

