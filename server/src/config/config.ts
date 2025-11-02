/**
 * Configuration settings for the OpenSky API integration
 * 
 * This module centralizes all configuration values including API credentials,
 * rate limits, caching settings, and server configuration.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Create require function for ESM compatibility
const require = createRequire(import.meta.url);

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
    /** Optional username for Basic Auth (legacy method) */
    username?: string;
    /** Optional password for Basic Auth (legacy method) */
    password?: string;
    /** OAuth2 client ID for authenticated requests (new method) */
    clientId?: string;
    /** OAuth2 client secret for authenticated requests (new method) */
    clientSecret?: string;
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
 * Load credentials from credentials.json file
 * Supports both OAuth2 (clientId/clientSecret) and Basic Auth (username/password)
 * Falls back to environment variables if file doesn't exist
 */
function loadCredentials(): { 
  username?: string; 
  password?: string;
  clientId?: string;
  clientSecret?: string;
} {
  console.log('🔑 [Credentials] Starting credential loading...');
  console.log(`   [Credentials] CWD: ${process.cwd()}`);
  
  try {
    // Try multiple possible locations for credentials.json
    // 1. Project root (when running from project root) - MOST COMMON
    let credentialsPath = path.join(process.cwd(), 'credentials.json');
    
    console.log(`🔍 [Credentials] Initial check at: ${credentialsPath}`);
    console.log(`   [Credentials] Exists: ${fs.existsSync(credentialsPath)}`);
    
    // 2. If not found, try using import.meta.url if available (ESM)
    if (!fs.existsSync(credentialsPath) && typeof import.meta !== 'undefined' && import.meta.url) {
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        console.log(`   [Credentials] ESM __dirname: ${__dirname}`);
        // If we're in server/src/config, go up 3 levels to project root
        if (__dirname.includes('server')) {
          credentialsPath = path.resolve(__dirname, '..', '..', '..', 'credentials.json');
          console.log(`   [Credentials] Trying ESM path: ${credentialsPath}`);
        }
      } catch (e: any) {
        console.log(`   [Credentials] ESM path resolution failed: ${e?.message || e}`);
      }
    }
    
    // 3. If still not found and we're in server/ directory, try parent directory
    if (!fs.existsSync(credentialsPath) && process.cwd().endsWith('server')) {
      credentialsPath = path.join(process.cwd(), '..', 'credentials.json');
      console.log(`   [Credentials] Trying parent directory: ${credentialsPath}`);
    }
    
    // 4. Get __dirname from import.meta.url (ESM way)
    if (!fs.existsSync(credentialsPath)) {
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        if (__dirname.includes('server')) {
          credentialsPath = path.resolve(__dirname, '..', '..', 'credentials.json');
          console.log(`   [Credentials] Trying ESM __dirname path: ${credentialsPath}`);
        }
      } catch (e: any) {
        // Ignore if __dirname resolution fails
      }
    }
    
    console.log(`🔍 [Credentials] Final path: ${credentialsPath}`);
    console.log(`   [Credentials] Final exists: ${fs.existsSync(credentialsPath)}`);
    
    if (fs.existsSync(credentialsPath)) {
      console.log(`✅ Found credentials.json at: ${credentialsPath}`);
      const fileContent = fs.readFileSync(credentialsPath, 'utf-8');
      console.log(`📄 File content preview: ${fileContent.substring(0, 50)}...`);
      
      const credentials = JSON.parse(fileContent);
      const opensky = credentials.opensky || {};
      
      console.log(`📋 Parsed opensky object keys: ${Object.keys(opensky).join(', ')}`);
      
      // Support OAuth2 (new method) - preferred
      if (opensky.clientId && opensky.clientSecret) {
        console.log('✅ OAuth2 credentials loaded from credentials.json');
        console.log(`   Client ID: ${opensky.clientId.substring(0, 20)}...`);
        return {
          clientId: opensky.clientId,
          clientSecret: opensky.clientSecret,
        };
      }
      
      // Fall back to Basic Auth (legacy method)
      if (opensky.username && opensky.password) {
        console.log('✅ Basic Auth credentials loaded from credentials.json');
        return {
          username: opensky.username,
          password: opensky.password,
        };
      }
      
      console.warn('⚠️  credentials.json found but no valid credentials detected');
      console.warn(`   Available keys in opensky: ${Object.keys(opensky).join(', ')}`);
    } else {
      console.warn(`⚠️  credentials.json not found at: ${credentialsPath}`);
      console.warn('   Using anonymous access (rate limited)');
    }
  } catch (error) {
    // If file doesn't exist or can't be read, fall back to environment variables
    console.warn('Could not load credentials.json, falling back to environment variables');
    console.error('Error loading credentials:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
  }
  
  // Fall back to environment variables
  const envCreds = {
    username: process.env.OPENSKY_USERNAME,
    password: process.env.OPENSKY_PASSWORD,
    clientId: process.env.OPENSKY_CLIENT_ID,
    clientSecret: process.env.OPENSKY_CLIENT_SECRET,
  };
  
  console.log(`   [Credentials] Env vars - clientId: ${envCreds.clientId ? 'SET' : 'NOT SET'}, clientSecret: ${envCreds.clientSecret ? 'SET' : 'NOT SET'}`);
  
  return envCreds;
}

/**
 * Default configuration values
 * 
 * Credentials are loaded from credentials.json (if it exists) or environment variables:
 * - credentials.json: { "opensky": { "clientId": "...", "clientSecret": "..." } } (OAuth2 - preferred)
 * - credentials.json: { "opensky": { "username": "...", "password": "..." } } (Basic Auth - legacy)
 * - Environment variables: OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET (OAuth2)
 * - Environment variables: OPENSKY_USERNAME, OPENSKY_PASSWORD (Basic Auth)
 * 
 * Other config can be overridden by environment variables:
 * - PORT: Server port (default: 3001)
 * - HOST: Server host (default: 'localhost')
 * - CACHE_ENABLED: Enable caching (default: 'true')
 * - CACHE_TTL: Cache TTL in seconds (default: '15' for anonymous rate limit safety)
 */
export function loadConfig(): AppConfig {
  const credentials = loadCredentials();
  
  // Log credential status for debugging
  if (credentials.clientId && credentials.clientSecret) {
    console.log('✅ Config: OAuth2 credentials available');
  } else if (credentials.username && credentials.password) {
    console.log('✅ Config: Basic Auth credentials available');
  } else {
    console.warn('⚠️  Config: No credentials found - using anonymous access (rate limited!)');
  }
  
  return {
    server: {
      port: parseInt(process.env.PORT || '3001', 10),
      host: process.env.HOST || 'localhost',
    },
    opensky: {
      username: credentials.username,
      password: credentials.password,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      baseUrl: 'https://opensky-network.org/api',
      timeout: 10000, // 10 seconds
    },
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.CACHE_TTL || '15', 10) * 1000, // 15 seconds default (safe for 10-sec rate limit)
      maxSize: 100,
    },
    rateLimit: {
      enabled: false, // Disabled - we rely on caching instead
      maxRequests: 10, // Requests per window
      windowMs: 60000, // 1 minute
    },
  };
}

