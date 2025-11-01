/**
 * Simple in-memory cache middleware for API responses
 * 
 * This middleware caches responses from the OpenSky API to reduce
 * the number of requests and avoid hitting rate limits. The cache
 * uses a time-based expiration (TTL) and has a maximum size limit.
 */

import type { AppConfig } from '../config/config.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Simple in-memory cache implementation
 */
class SimpleCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  /**
   * Get a value from the cache
   * 
   * @param key - Cache key
   * @returns Cached value or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.data;
  }
  
  /**
   * Set a value in the cache
   * 
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds
   */
  set(key: string, value: T, ttl: number): void {
    // If cache is full, remove oldest entry (simple FIFO)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl,
    });
  }
  
  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Remove expired entries from the cache
   */
  clean(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Get the current cache size
   */
  size(): number {
    return this.cache.size;
  }
}

// Global cache instance
let globalCache: SimpleCache<any> | null = null;

/**
 * Initialize the cache with configuration
 * 
 * @param config - Application configuration
 */
export function initializeCache(config: AppConfig): void {
  if (config.cache.enabled) {
    globalCache = new SimpleCache(config.cache.maxSize);
    
    // Clean expired entries every minute
    setInterval(() => {
      if (globalCache) {
        globalCache.clean();
      }
    }, 60000);
  }
}

/**
 * Get cached data or execute a function and cache the result
 * 
 * @param key - Cache key
 * @param fn - Function to execute if cache miss
 * @param ttl - Time to live in milliseconds
 * @returns Cached or newly computed value
 */
export async function getOrSet<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number
): Promise<T> {
  if (!globalCache) {
    // Cache disabled, just execute the function
    return fn();
  }
  
  // Try to get from cache
  const cached = globalCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  
  // Cache miss, execute function and cache result
  const result = await fn();
  globalCache.set(key, result, ttl);
  
  return result;
}

/**
 * Clear the cache (useful for testing or manual cache invalidation)
 */
export function clearCache(): void {
  if (globalCache) {
    globalCache.clear();
  }
}

