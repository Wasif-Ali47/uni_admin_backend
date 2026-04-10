const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String    },
    email: {
        type: String,
        unique: true
    },
    profession: {
        type: String
    },
    password: {
        type: String
    },
    image: {
        type: String,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users"
    },
    /** 6-digit OTP for email verification (cleared after verify). Same pattern as ethical-hacking-user-service. */
    otp: {
        type: String,
    },
    /** false until OTP verified; omit on legacy users so login still works. */
    emailVerified: {
        type: Boolean,
    },
    googleId: {
        type: String,
    },
    /** OTP for password reset (cleared after successful reset). Same as AssistantAppBacken user-service. */
    resetOTP: {
        type: String,
    },
    /** When false, this user's generations are hidden from trending and cannot be liked by others. */
    creationsPublic: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

module.exports = User;
