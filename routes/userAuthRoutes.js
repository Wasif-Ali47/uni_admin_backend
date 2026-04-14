const express = require("express");
const {
  handleUserLogin,
  handleUserSignUp,
  handleVerifyOTP,
  handleGoogleLogin,
  handleGetProfile,
  handleUpdateProfile,
  handleForgotPassword,
  handleResetPassword,
} = require("../controllers/userAuthControllers");
const { checkUserExistsByEmail, authenticate } = require("../middlewares/authMiddleware");
const upload = require("../uploads");
const uploadProfile = require("../uploadsProfile");

const router = express.Router();

router.post("/signup", upload.single("image"), checkUserExistsByEmail, handleUserSignUp);
router.post("/verify-otp", handleVerifyOTP);
router.post("/login", upload.single("image"), handleUserLogin);
router.post("/google-login", handleGoogleLogin);

router.get("/profile/:id", authenticate, handleGetProfile);
router.put("/profile/:id", authenticate, uploadProfile.single("profileImage"), handleUpdateProfile);

router.post("/forgot-password", handleForgotPassword);
router.post("/reset-password", handleResetPassword);

module.exports = router;
