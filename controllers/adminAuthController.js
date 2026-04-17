const { signAdminToken } = require("../middlewares/adminAuthMiddleware");

async function adminLogin(req, res) {
  try {
    const { email, password } = req.body || {};

    const adminEmail = process.env.ADMIN_EMAIL || "admin@gmail.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin@gmail.com";

    if (!email || !password || email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin credentials",
      });
    }

    const token = signAdminToken("prompt-generator-admin");
    return res.json({
      success: true,
      message: "Admin login successful",
      token,
    });
  } catch (error) {
    console.error("[adminLogin] error:", error);
    return res.status(500).json({
      success: false,
      message: "Admin login failed",
      error: error.message,
    });
  }
}

module.exports = {
  adminLogin,
};
