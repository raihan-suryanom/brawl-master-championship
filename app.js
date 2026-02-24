require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const playerRoutes = require("./routes/playerRoutes");
const seriesRoutes = require("./routes/seriesRoutes");
const gameRoutes = require("./routes/gameRoutes");
const seriesStatsRoutes = require("./routes/seriesStatsRoutes");
const seriesPtsProgressionRoutes = require("./routes/seriesPtsProgressionRoutes");
const playerStatsRoutes = require("./routes/playerStatsRoutes");

const app = express();

app.use(express.json());

// Routes
app.use("/api/players", playerRoutes);
app.use("/api/players", playerStatsRoutes);
app.use("/api/series", seriesRoutes);
app.use("/api/series/:seriesId/games", gameRoutes);
app.use("/api/series/:seriesId/stats", seriesStatsRoutes);
app.use("/api/series/:seriesId/pts-progression", seriesPtsProgressionRoutes);

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
