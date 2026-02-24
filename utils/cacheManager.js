class CacheManager {
  constructor() {
    this.cache = new Map();
  }

  // Generate cache key
  generateKey(prefix, ...args) {
    return `${prefix}:${args.join(":")}`;
  }

  // Set cache with optional TTL
  set(key, value, ttl = null) {
    const item = {
      value,
      timestamp: Date.now(),
      ttl,
    };
    this.cache.set(key, item);
  }

  // Get cache, return null if expired or not found
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if expired
    if (item.ttl && Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  // Delete specific cache key
  delete(key) {
    this.cache.delete(key);
  }

  // Delete all cache keys matching a pattern
  deletePattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  // Clear all cache
  clear() {
    this.cache.clear();
  }

  // Get cache stats
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
