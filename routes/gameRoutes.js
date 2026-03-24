const express = require("express");
const router = express.Router({ mergeParams: true });
const mongoose = require("mongoose");
const Game = require("../models/Game");
const Series = require("../models/Series");
const cacheManager = require("../utils/cacheManager");
const { validateAdminPassword } = require("../middleware/adminAuth");

// GET /api/series/:seriesId/games?maxGameNumber=7
router.get("/", async (req, res) => {
  try {
    const { maxGameNumber } = req.query;
    const seriesObjectId = mongoose.Types.ObjectId.createFromHexString(req.params.seriesId);
    let games = await Game.find({ seriesId: seriesObjectId })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color")
      .sort({ gameNumber: 1 });
    
    // Filter by maxGameNumber if provided
    if (maxGameNumber && parseInt(maxGameNumber) > 0) {
      games = games.filter(g => g.gameNumber <= parseInt(maxGameNumber));
    }
    
    res.status(200).json(games);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/series/:seriesId/games/:id
router.get("/:id", async (req, res) => {
  try {
    const seriesObjectId = mongoose.Types.ObjectId.createFromHexString(req.params.seriesId);
    const game = await Game.findOne({
      _id: req.params.id,
      seriesId: seriesObjectId,
    })
      .populate("teamBlue", "name picture color")
      .populate("teamRed", "name picture color");
    if (!game) return res.status(404).json({ message: "Game not found" });
    res.status(200).json(game);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/series/:seriesId/games (PROTECTED)
router.post("/", validateAdminPassword, async (req, res) => {
  try {
    // Validate series exists
    const series = await Series.findById(req.params.seriesId);
    if (!series) return res.status(404).json({ message: "Series not found" });

    // Validate max 10 games per series
    const seriesObjectId = mongoose.Types.ObjectId.createFromHexString(req.params.seriesId);
    const gameCount = await Game.countDocuments({
      seriesId: seriesObjectId,
    });
    if (gameCount >= 10)
      return res
        .status(400)
        .json({ message: "Series already has 10 games" });

    // Validate all players in teamBlue & teamRed are participants of the series
    const participantIds = series.participants.map((id) => id.toString());
    const allPlayers = [...req.body.teamBlue, ...req.body.teamRed];
    const allValid = allPlayers.every((id) => participantIds.includes(id));
    if (!allValid)
      return res.status(400).json({
        message: "All players must be participants of the series",
      });

    const game = new Game({ ...req.body, seriesId: req.params.seriesId });
    const savedGame = await game.save();

    // AGGRESSIVE CACHE INVALIDATION - Clear all related caches
    console.log('[Cache] Invalidating after game POST...');
    
    // Clear all series-related caches
    cacheManager.deletePattern('^series-stats:');
    cacheManager.deletePattern('^series-pts-progression:');
    cacheManager.deletePattern('^series-difficulty:');
    
    // Clear all player-related caches
    cacheManager.deletePattern('^player-stats:');
    cacheManager.deletePattern('^player-combinations:');
    cacheManager.deletePattern('^player-position-history:');
    cacheManager.deletePattern('^player-game-progression:');
    cacheManager.deletePattern('^player-performance-trends:');
    cacheManager.deletePattern('^player-clutch-stats:');
    cacheManager.deletePattern('^player-comeback-analysis:');
    
    // Clear aggregate caches
    cacheManager.deletePattern('^aggregate-combinations:');
    cacheManager.deletePattern('^aggregate-series-difficulty:');
    
    console.log('[Cache] Invalidation complete');

    res.status(201).json(savedGame);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;