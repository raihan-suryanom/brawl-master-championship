const express = require("express");
const router = express.Router({ mergeParams: true });
const statsService = require("../services/statsService");
const cacheManager = require("../utils/cacheManager");

// GET /api/series/:seriesId/stats?maxGameNumber=7
router.get("/", async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { maxGameNumber } = req.query;
    
    // Include maxGameNumber in cache key if provided
    const cacheKey = maxGameNumber 
      ? cacheManager.generateKey("series-stats", seriesId, `max-${maxGameNumber}`)
      : cacheManager.generateKey("series-stats", seriesId);

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate stats with optional game range filter
    const stats = await statsService.getSeriesStats(
      seriesId, 
      maxGameNumber ? parseInt(maxGameNumber) : null
    );

    // Cache the result (no TTL, will be invalidated on new game)
    cacheManager.set(cacheKey, stats);

    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;