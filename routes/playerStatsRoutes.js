const express = require("express");
const router = express.Router();
const statsService = require("../services/statsService");
const cacheManager = require("../utils/cacheManager");

// GET /api/players/:playerId/stats?seriesId=xxx OR ?fromSeriesId=xxx&toSeriesId=yyy
router.get("/:playerId/stats", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { seriesId, fromSeriesId, toSeriesId } = req.query;

    // Determine cache key based on query params
    let cacheKey;
    if (seriesId) {
      cacheKey = cacheManager.generateKey("player-stats", playerId, seriesId);
    } else if (fromSeriesId && toSeriesId) {
      cacheKey = cacheManager.generateKey("player-stats", playerId, `${fromSeriesId}-${toSeriesId}`);
    } else {
      cacheKey = cacheManager.generateKey("player-stats", playerId, "all");
    }

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate stats
    let stats;
    if (fromSeriesId && toSeriesId) {
      stats = await statsService.getPlayerStatsRange(playerId, fromSeriesId, toSeriesId);
    } else {
      stats = await statsService.getPlayerStats(playerId, seriesId || null);
    }

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

// GET /api/players/:playerId/combinations?seriesId=xxx&size=2 OR ?fromSeriesId=xxx&toSeriesId=yyy&size=2
// size: 2 or 3 (default: 2)
router.get("/:playerId/combinations", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { seriesId, fromSeriesId, toSeriesId, size } = req.query;
    const combinationSize = parseInt(size) || 2;

    // Validate size
    if (![2, 3].includes(combinationSize)) {
      return res.status(400).json({ 
        message: "Size must be 2 or 3" 
      });
    }

    // Determine cache key
    let cacheKey;
    if (seriesId) {
      cacheKey = cacheManager.generateKey("player-combinations", playerId, seriesId, combinationSize);
    } else if (fromSeriesId && toSeriesId) {
      cacheKey = cacheManager.generateKey("player-combinations", playerId, `${fromSeriesId}-${toSeriesId}`, combinationSize);
    } else {
      cacheKey = cacheManager.generateKey("player-combinations", playerId, "all", combinationSize);
    }

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate combinations
    let combinations;
    if (fromSeriesId && toSeriesId) {
      combinations = await statsService.getPlayerCombinationsRange(
        playerId,
        fromSeriesId,
        toSeriesId,
        combinationSize
      );
    } else {
      combinations = await statsService.getPlayerCombinations(
        playerId,
        seriesId || null,
        combinationSize
      );
    }

    // Cache the result
    cacheManager.set(cacheKey, combinations);

    res.status(200).json(combinations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/players/:playerId/position-history?fromSeriesId=xxx&toSeriesId=yyy
router.get("/:playerId/position-history", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { fromSeriesId, toSeriesId } = req.query;

    // Determine cache key
    let cacheKey;
    if (fromSeriesId && toSeriesId) {
      cacheKey = cacheManager.generateKey("player-position-history", playerId, `${fromSeriesId}-${toSeriesId}`);
    } else {
      cacheKey = cacheManager.generateKey("player-position-history", playerId, "all");
    }

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Calculate position history
    let positionHistory;
    if (fromSeriesId && toSeriesId) {
      positionHistory = await statsService.getPlayerPositionHistoryRange(playerId, fromSeriesId, toSeriesId);
    } else {
      positionHistory = await statsService.getPlayerPositionHistory(playerId);
    }

    // Cache the result
    cacheManager.set(cacheKey, positionHistory);

    res.status(200).json(positionHistory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/players/:playerId/full-profile - Bundled endpoint for player detail page
router.get("/:playerId/full-profile", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { fromSeriesId, toSeriesId } = req.query;

    // Determine cache key
    let cacheKey;
    if (fromSeriesId && toSeriesId) {
      cacheKey = cacheManager.generateKey("player-full-profile", playerId, `${fromSeriesId}-${toSeriesId}`);
    } else {
      cacheKey = cacheManager.generateKey("player-full-profile", playerId, "all");
    }

    // Check cache first
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Fetch all data in parallel
    let statsPromise, combo2Promise, combo3Promise, posHistoryPromise;

    if (fromSeriesId && toSeriesId) {
      [statsPromise, combo2Promise, combo3Promise, posHistoryPromise] = [
        statsService.getPlayerStatsRange(playerId, fromSeriesId, toSeriesId),
        statsService.getPlayerCombinationsRange(playerId, fromSeriesId, toSeriesId, 2),
        statsService.getPlayerCombinationsRange(playerId, fromSeriesId, toSeriesId, 3),
        statsService.getPlayerPositionHistoryRange(playerId, fromSeriesId, toSeriesId),
      ];
    } else {
      [statsPromise, combo2Promise, combo3Promise, posHistoryPromise] = [
        statsService.getPlayerStats(playerId),
        statsService.getPlayerCombinations(playerId, null, 2),
        statsService.getPlayerCombinations(playerId, null, 3),
        statsService.getPlayerPositionHistory(playerId),
      ];
    }

    const [stats, combinations2, combinations3, positionHistory] = await Promise.all([
      statsPromise,
      combo2Promise,
      combo3Promise,
      posHistoryPromise,
    ]);

    const result = {
      stats,
      combinations2,
      combinations3,
      positionHistory,
    };

    // Cache the result
    cacheManager.set(cacheKey, result);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;