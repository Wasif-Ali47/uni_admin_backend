const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      unique: true,
    },
    profession: {
      type: String,
    },
    password: {
      type: String,
    },
    image: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    otp: {
      type: String,
    },
    emailVerified: {
      type: Boolean,
    },
    googleId: {
      type: String,
    },
    resetOTP: {
      type: String,
    },
    creationsPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
