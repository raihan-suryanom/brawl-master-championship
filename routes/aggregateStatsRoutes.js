const express = require("express");
const router = express.Router();
const statsService = require("../services/statsService");
const cacheManager = require("../utils/cacheManager");

// GET /api/aggregate-stats/best-combinations?size=2&fromSeriesId=xxx&toSeriesId=yyy
router.get("/best-combinations", async (req, res) => {
  try {
    const { size, fromSeriesId, toSeriesId } = req.query;
    
    if (!size || (size !== "2" && size !== "3")) {
      return res.status(400).json({ message: "Invalid size. Must be 2 or 3" });
    }

    // Determine cache key
    let cacheKey;
    if (fromSeriesId && toSeriesId) {
      cacheKey = cacheManager.generateKey("aggregate-combinations", size, `${fromSeriesId}-${toSeriesId}`);
    } else {
      cacheKey = cacheManager.generateKey("aggregate-combinations", size, "all");
    }

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate aggregate best combinations
    let combinations;
    if (fromSeriesId && toSeriesId) {
      combinations = await statsService.getAggregateBestCombinationsRange(
        parseInt(size),
        fromSeriesId,
        toSeriesId
      );
    } else {
      combinations = await statsService.getAggregateBestCombinations(parseInt(size));
    }

    // Cache the result
    cacheManager.set(cacheKey, combinations);

    res.status(200).json(combinations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/aggregate-stats/series-difficulty
router.get("/series-difficulty", async (req, res) => {
  try {
    // Cache key
    const cacheKey = cacheManager.generateKey("aggregate-series-difficulty", "all");

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Get all series difficulty ratings
    const difficulties = await statsService.getAllSeriesDifficulty();

    // Cache the result
    cacheManager.set(cacheKey, difficulties);

    res.status(200).json(difficulties);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;