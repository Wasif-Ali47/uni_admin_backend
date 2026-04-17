const mongoose = require("mongoose");
const User = require("../models/usersModel");
const { ensureFirebaseAdmin } = require("../utils/firebaseAdminInit");

function buildDeviceInfo(deviceInfo) {
  if (!deviceInfo || typeof deviceInfo !== "object") {
    return { os: "", appVersion: "" };
  }
  return {
    os: typeof deviceInfo.os === "string" ? deviceInfo.os : "",
    appVersion: typeof deviceInfo.appVersion === "string" ? deviceInfo.appVersion : "",
  };
}

async function registerToken(req, res) {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const deviceType = typeof req.body?.deviceType === "string" ? req.body.deviceType.trim() : "unknown";
    const deviceInfo = buildDeviceInfo(req.body?.deviceInfo);
    const fromAuth = req.authUser?._id ? req.authUser._id.toString() : null;
    const fromBody = req.body?.userId;
    const targetUserId = fromAuth || (typeof fromBody === "string" ? fromBody.trim() : "");

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }
    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId is required (or pass authenticated token)",
      });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        message: "Banned users cannot register device tokens",
      });
    }

    const existingIndex = (user.deviceTokens || []).findIndex((d) => d.token === token);
    if (existingIndex >= 0) {
      user.deviceTokens[existingIndex].deviceType = deviceType || user.deviceTokens[existingIndex].deviceType;
      user.deviceTokens[existingIndex].deviceInfo = {
        ...user.deviceTokens[existingIndex].deviceInfo,
        ...deviceInfo,
      };
      user.deviceTokens[existingIndex].registeredAt = new Date();
    } else {
      user.deviceTokens.push({
        token,
        deviceType,
        deviceInfo,
        registeredAt: new Date(),
      });
    }

    await user.save();
    return res.json({
      success: true,
      message: "Device token registered successfully",
      userId: user._id.toString(),
      token,
    });
  } catch (error) {
    console.error("[notification:registerToken] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to register device token",
      error: error.message,
    });
  }
}

async function sendNotification(req, res) {
  try {
    const firebaseAdmin = ensureFirebaseAdmin();
    if (!firebaseAdmin) {
      return res.status(503).json({
        success: false,
        message: "Push notifications not configured. Missing Firebase setup.",
      });
    }

    const user = req.authUser;
    if (!user || !user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const data = req.body?.data && typeof req.body.data === "object" ? req.body.data : {};
    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "title and body are required",
      });
    }

    const freshUser = await User.findById(user._id).select("deviceTokens");
    const tokens = (freshUser?.deviceTokens || []).map((d) => d.token).filter(Boolean);
    if (!tokens.length) {
      return res.status(404).json({
        success: false,
        message: "No device tokens found for user",
      });
    }

    const response = await firebaseAdmin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.entries(data).reduce((acc, [k, v]) => {
        acc[String(k)] = String(v);
        return acc;
      }, {}),
    });

    return res.json({
      success: true,
      message: "Notification sent successfully",
      successCount: response.successCount || 0,
      failureCount: response.failureCount || 0,
    });
  } catch (error) {
    console.error("[notification:sendNotification] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send notification",
      error: error.message,
    });
  }
}

async function getTokens(req, res) {
  try {
    const user = req.authUser;
    if (!user || !user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const freshUser = await User.findById(user._id).select("deviceTokens");
    if (!freshUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      tokens: freshUser.deviceTokens || [],
    });
  } catch (error) {
    console.error("[notification:getTokens] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get tokens",
      error: error.message,
    });
  }
}

async function removeToken(req, res) {
  try {
    const user = req.authUser;
    if (!user || !user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = req.params?.token;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token is required in path",
      });
    }

    const freshUser = await User.findById(user._id);
    if (!freshUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    freshUser.deviceTokens = (freshUser.deviceTokens || []).filter((d) => d.token !== token);
    await freshUser.save();

    return res.json({
      success: true,
      message: "Token removed successfully",
    });
  } catch (error) {
    console.error("[notification:removeToken] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove token",
      error: error.message,
    });
  }
}

module.exports = {
  registerToken,
  sendNotification,
  getTokens,
  removeToken,
};
