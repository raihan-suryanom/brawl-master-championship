require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const playerRoutes = require("./routes/playerRoutes");
const seriesRoutes = require("./routes/seriesRoutes");
const gameRoutes = require("./routes/gameRoutes");
const seriesStatsRoutes = require("./routes/seriesStatsRoutes");
const seriesPtsProgressionRoutes = require("./routes/seriesPtsProgressionRoutes");
const playerStatsRoutes = require("./routes/playerStatsRoutes");
const aggregateStatsRoutes = require("./routes/aggregateStatsRoutes");

const app = express();

// CORS middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/players", playerRoutes);
app.use("/api/players", playerStatsRoutes);
app.use("/api/series", seriesRoutes);
app.use("/api/series/:seriesId/games", gameRoutes);
app.use("/api/series/:seriesId/stats", seriesStatsRoutes);
app.use("/api/series/:seriesId/pts-progression", seriesPtsProgressionRoutes);
app.use("/api/aggregate-stats", aggregateStatsRoutes);

// Cache management route (admin only - no auth for now)
app.post("/api/admin/clear-cache", (req, res) => {
  try {
    const cacheManager = require("./utils/cacheManager");
    const keys = cacheManager.cache.keys();
    const count = keys.length;
    
    cacheManager.cache.flushAll();
    
    console.log(`[Cache] Manually cleared all cache (${count} keys)`);
    
    res.status(200).json({ 
      success: true, 
      message: `Cache cleared successfully (${count} keys removed)`,
      clearedKeys: count
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Clear specific cache types
app.post("/api/admin/clear-cache/:type", (req, res) => {
  try {
    const cacheManager = require("./utils/cacheManager");
    const { type } = req.params;
    
    let pattern;
    let description;
    
    switch (type) {
      case "series":
        pattern = "^series-";
        description = "Series cache";
        break;
      case "games":
        pattern = "^series-.*-games";
        description = "Games cache";
        break;
      case "stats":
        pattern = "^(series-stats|player-stats|aggregate-combinations):";
        description = "Stats cache";
        break;
      case "players":
        pattern = "^player-";
        description = "Players cache";
        break;
      case "progression":
        pattern = "^(series-pts-progression|player-game-progression):";
        description = "Progression cache";
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid cache type. Valid types: series, games, stats, players, progression"
        });
    }
    
    const keysBefore = cacheManager.cache.keys().length;
    cacheManager.deletePattern(pattern);
    const keysAfter = cacheManager.cache.keys().length;
    const cleared = keysBefore - keysAfter;
    
    console.log(`[Cache] Manually cleared ${description} (${cleared} keys)`);
    
    res.status(200).json({
      success: true,
      message: `${description} cleared successfully (${cleared} keys removed)`,
      clearedKeys: cleared
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(process.env.PORT || 3000, () => {
      console.log(`Server running on port ${process.env.PORT || 3000}`);
    });
  })
  .catch((error) => console.error("MongoDB connection error:", error));

module.exports = app;