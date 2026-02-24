const mongoose = require("mongoose");

const PlayerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Player name is required"],
      trim: true,
      unique: true,
    },
    picture: {
      type: String,
      required: [true, "Player picture is required"],
      trim: true,
      unique: true,
    },
    color: {
      type: String,
      required: [true, "Player color is required"],
      unique: true,
      trim: true,
      validate: {
        validator: function (val) {
          return /^#[0-9A-F]{6}$/i.test(val);
        },
        message: "Color must be a valid hex color (e.g., #FF5733)",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Player", PlayerSchema);
