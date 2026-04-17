const fs = require("fs");
const path = require("path");

let cachedAdmin = null;

function parseServiceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    return null;
  }
  try {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (error) {
    console.error("[firebase] Invalid FIREBASE_SERVICE_ACCOUNT JSON:", error.message);
    return null;
  }
}

function readServiceAccountFromFile() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ? process.env.FIREBASE_SERVICE_ACCOUNT_PATH.trim()
    : "";

  const candidates = [];
  if (configuredPath) {
    candidates.push(path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath));
  }
  candidates.push(path.resolve(process.cwd(), "firebase-service-account.json"));

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const content = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content);
      return parsed;
    } catch (error) {
      console.error(`[firebase] Failed to parse service account file (${filePath}):`, error.message);
    }
  }

  return null;
}

function ensureFirebaseAdmin() {
  if (cachedAdmin) {
    return cachedAdmin;
  }

  let admin;
  try {
    admin = require("firebase-admin");
  } catch (_) {
    return null;
  }

  const serviceAccount = parseServiceAccount() || readServiceAccountFromFile();
  if (!serviceAccount) {
    return null;
  }

  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  cachedAdmin = admin;
  return cachedAdmin;
}

module.exports = {
  ensureFirebaseAdmin,
};
