const express = require("express");
const router = express.Router();
const Series = require("../models/Series");
const cacheManager = require("../utils/cacheManager");
const { validateAdminPassword } = require("../middleware/adminAuth");

// GET /api/series
router.get("/", async (req, res) => {
  try {
    const series = await Series.find().populate("participants", "name picture color");
    res.status(200).json(series);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/series/:id
router.get("/:id", async (req, res) => {
  try {
    const series = await Series.findById(req.params.id).populate(
      "participants",
      "name picture color"
    );
    if (!series) return res.status(404).json({ message: "Series not found" });
    res.status(200).json(series);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/series (PROTECTED)
router.post("/", validateAdminPassword, async (req, res) => {
  try {
    const series = new Series(req.body);
    const savedSeries = await series.save();
    
    // AGGRESSIVE CACHE INVALIDATION
    console.log('[Cache] Invalidating after series POST...');
    
    // New series affects position history and performance trends
    cacheManager.deletePattern('^player-position-history:');
    cacheManager.deletePattern('^player-full-profile:');
    cacheManager.deletePattern('^player-performance-trends:');
    cacheManager.deletePattern('^player-clutch-stats:');
    
    console.log('[Cache] Invalidation complete');
    
    res.status(201).json(savedSeries);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;