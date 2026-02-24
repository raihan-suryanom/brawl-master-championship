const mongoose = require("mongoose");

const SeriesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Series name is required"],
      trim: true,
      unique: true,
    },
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Player",
        },
      ],
      validate: [
        {
          validator: function (val) {
            return val.length >= 6;
          },
          message: "Participants must be at least 6 players",
        },
        {
          validator: function (val) {
            return val.length % 2 === 0;
          },
          message: "Participants must be an even number",
        },
      ],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Series", SeriesSchema);
