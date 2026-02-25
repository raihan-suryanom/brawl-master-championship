const express = require("express");
const router = express.Router();
const Series = require("../models/Series");
const cacheManager = require("../utils/cacheManager");

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

// POST /api/series
router.post("/", async (req, res) => {
  try {
    const series = new Series(req.body);
    const savedSeries = await series.save();
    
    // AGGRESSIVE CACHE INVALIDATION
    console.log('[Cache] Invalidating after series POST...');
    
    // New series affects position history
    cacheManager.deletePattern('^player-position-history:');
    cacheManager.deletePattern('^player-full-profile:');
    
    console.log('[Cache] Invalidation complete');
    
    res.status(201).json(savedSeries);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;