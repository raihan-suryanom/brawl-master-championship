const express = require("express");
const router = express.Router();
const statsService = require("../services/statsService");
const cacheManager = require("../utils/cacheManager");

// GET /api/players/:playerId/stats?seriesId=xxx (seriesId optional)
router.get("/:playerId/stats", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { seriesId } = req.query;

    const cacheKey = seriesId
      ? cacheManager.generateKey("player-stats", playerId, seriesId)
      : cacheManager.generateKey("player-stats", playerId, "all");

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate stats
    const stats = await statsService.getPlayerStats(playerId, seriesId || null);

    // Cache the result
    cacheManager.set(cacheKey, stats);

    res.status(200).json(stats);
  } catch (error) {
    if (error.message === "Player not found") {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
});

// GET /api/players/:playerId/combinations?seriesId=xxx&size=2
// size: 2 or 3 (default: 2)
router.get("/:playerId/combinations", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { seriesId, size } = req.query;
    const combinationSize = parseInt(size) || 2;

    // Validate size
    if (![2, 3].includes(combinationSize)) {
      return res.status(400).json({ 
        message: "Size must be 2 or 3" 
      });
    }

    const cacheKey = seriesId
      ? cacheManager.generateKey("player-combinations", playerId, seriesId, combinationSize)
      : cacheManager.generateKey("player-combinations", playerId, "all", combinationSize);

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate combinations
    const combinations = await statsService.getPlayerCombinations(
      playerId,
      seriesId || null,
      combinationSize
    );

    // Cache the result
    cacheManager.set(cacheKey, combinations);

    res.status(200).json(combinations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
