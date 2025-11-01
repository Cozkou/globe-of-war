/**
 * Configuration settings for the OpenSky API integration
 * 
 * This module centralizes all configuration values including API credentials,
 * rate limits, caching settings, and server configuration.
 */

/**
 * Configuration interface for the application
 */
export interface AppConfig {
  /** Server configuration */
  server: {
    /** Port number for the Express server */
    port: number;
    /** Host address for the server */
    host: string;
  };
  
  /** OpenSky API configuration */
  opensky: {
    /** Optional username for authenticated requests (higher rate limits) */
    username?: string;
    /** Optional password for authenticated requests */
    password?: string;
    /** Base URL for OpenSky API */
    baseUrl: string;
    /** Request timeout in milliseconds */
    timeout: number;
  };
  
  /** Caching configuration */
  cache: {
    /** Enable/disable caching of API responses */
    enabled: boolean;
    /** Cache duration in milliseconds */
    ttl: number;
    /** Maximum number of cached entries */
    maxSize: number;
  };
  
  /** Rate limiting configuration */
  rateLimit: {
    /** Enable/disable rate limiting */
    enabled: boolean;
    /** Maximum number of requests per window */
    maxRequests: number;
    /** Rate limit window in milliseconds */
    windowMs: number;
  };
}

/**
 * Default configuration values
 * 
 * These can be overridden by environment variables:
 * - PORT: Server port (default: 3001)
 * - HOST: Server host (default: 'localhost')
 * - OPENSKY_USERNAME: OpenSky API username (optional)
 * - OPENSKY_PASSWORD: OpenSky API password (optional)
 * - CACHE_ENABLED: Enable caching (default: 'true')
 * - CACHE_TTL: Cache TTL in seconds (default: '10')
 */
export function loadConfig(): AppConfig {
  return {
    server: {
      port: parseInt(process.env.PORT || '3001', 10),
      host: process.env.HOST || 'localhost',
    },
    opensky: {
      username: process.env.OPENSKY_USERNAME,
      password: process.env.OPENSKY_PASSWORD,
      baseUrl: 'https://opensky-network.org/api',
      timeout: 10000, // 10 seconds
    },
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.CACHE_TTL || '10', 10) * 1000, // Convert to milliseconds
      maxSize: 100,
    },
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
      maxRequests: 10, // Requests per window
      windowMs: 60000, // 1 minute
    },
  };
}

