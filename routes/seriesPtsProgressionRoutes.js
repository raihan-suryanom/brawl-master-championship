const express = require("express");
const router = express.Router({ mergeParams: true });
const statsService = require("../services/statsService");
const cacheManager = require("../utils/cacheManager");

// GET /api/series/:seriesId/pts-progression
router.get("/", async (req, res) => {
  try {
    const { seriesId } = req.params;
    const cacheKey = cacheManager.generateKey("series-pts-progression", seriesId);

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate pts progression
    const progression = await statsService.getSeriesPtsProgression(seriesId);

    // Cache the result
    cacheManager.set(cacheKey, progression);

    res.status(200).json(progression);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;