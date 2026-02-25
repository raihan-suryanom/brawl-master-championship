const NodeCache = require("node-cache");

class CacheManager {
  constructor() {
    // Initialize node-cache with default settings
    this.cache = new NodeCache({
      stdTTL: 60000, // Default TTL: 10 minutes
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false, // Don't clone objects (better performance)
      maxKeys: 1000, // Max 1000 keys (prevent memory issues)
    });

    // Log cache stats periodically in development
    if (process.env.NODE_ENV !== "production") {
      setInterval(() => {
        const stats = this.cache.getStats();
        console.log("[Cache Stats]", {
          keys: stats.keys,
          hits: stats.hits,
          misses: stats.misses,
          ksize: stats.ksize,
        });
      }, 60000); // Every minute
    }
  }

  // Generate cache key
  generateKey(prefix, ...args) {
    return `${prefix}:${args.join(":")}`;
  }

  // Set cache with optional TTL (in milliseconds, will be converted to seconds)
  set(key, value, ttl = null) {
    if (ttl) {
      // Convert milliseconds to seconds for node-cache
      this.cache.set(key, value, Math.floor(ttl / 1000));
    } else {
      // Use default TTL (600 seconds = 10 minutes)
      this.cache.set(key, value);
    }
    return true;
  }

  // Get cache, return null if expired or not found
  get(key) {
    const value = this.cache.get(key);
    return value === undefined ? null : value;
  }

  // Delete specific cache key
  delete(key) {
    return this.cache.del(key) > 0;
  }

  // Delete all cache keys matching a pattern
  deletePattern(pattern) {
    const regex = new RegExp(pattern);
    const keys = this.cache.keys();
    const keysToDelete = keys.filter((key) => regex.test(key));
    
    if (keysToDelete.length > 0) {
      this.cache.del(keysToDelete);
    }
    
    return keysToDelete.length;
  }

  // Clear all cache
  clear() {
    this.cache.flushAll();
    return true;
  }

  // Get cache stats
  getStats() {
    const stats = this.cache.getStats();
    return {
      keys: stats.keys, // Number of keys
      hits: stats.hits, // Cache hits
      misses: stats.misses, // Cache misses
      ksize: stats.ksize, // Key size
      vsize: stats.vsize, // Value size
      hitRate: stats.hits > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + "%" : "0%",
    };
  }

  // Get TTL for a specific key
  getTtl(key) {
    return this.cache.getTtl(key);
  }

  // Check if key exists
  has(key) {
    return this.cache.has(key);
  }
}

// Singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;