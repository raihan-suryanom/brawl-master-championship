const express = require("express");
const router = express.Router();
const Player = require("../models/Player");

// GET /api/players
router.get("/", async (req, res) => {
  try {
    const players = await Player.find();
    res.status(200).json(players);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/players/:id
router.get("/:id", async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: "Player not found" });
    res.status(200).json(player);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/players
router.post("/", async (req, res) => {
  try {
    const player = new Player(req.body);
    const savedPlayer = await player.save();
    res.status(201).json(savedPlayer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
