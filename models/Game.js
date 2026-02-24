const mongoose = require("mongoose");

const GameSchema = new mongoose.Schema(
  {
    seriesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Series",
      required: [true, "Series reference is required"],
    },
    gameNumber: {
      type: Number,
      required: [true, "Game number is required"],
      min: [1, "Game number must be at least 1"],
      max: [10, "Game number must be at most 10"],
    },
    teamBlue: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Player",
        },
      ],
      validate: [
        {
          validator: function (val) {
            return val.length >= 3;
          },
          message: "teamBlue must have at least 3 players",
        },
        {
          validator: function (val) {
            return val.length <= 4;
          },
          message: "teamBlue must have at most 4 players",
        },
      ],
    },
    teamRed: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Player",
        },
      ],
      validate: [
        {
          validator: function (val) {
            return val.length >= 3;
          },
          message: "teamRed must have at least 3 players",
        },
        {
          validator: function (val) {
            return val.length <= 4;
          },
          message: "teamRed must have at most 4 players",
        },
      ],
    },
    winner: {
      type: String,
      enum: {
        values: ["teamBlue", "teamRed"],
        message: "Winner must be either teamBlue or teamRed",
      },
      required: [true, "Winner is required"],
    },
  },
  { timestamps: true }
);

// Validate teamBlue & teamRed have the same number of players
GameSchema.pre("save", function (next) {
  if (this.teamBlue.length !== this.teamRed.length) {
    return next(
      new Error("teamBlue and teamRed must have the same number of players")
    );
  }
  next();
});

module.exports = mongoose.model("Game", GameSchema);
