const mongoose = require("mongoose");

const appRegistrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9-]+$/,
    },
    baseUrl: {
      type: String,
      required: true,
      trim: true,
    },
    serviceKey: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: { type: Boolean, default: true },
    color: { type: String, default: "#3e7b6f", trim: true },
    description: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppRegistry", appRegistrySchema);
