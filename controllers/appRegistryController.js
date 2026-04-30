const AppRegistry = require("../models/appRegistryModel");

async function listApps(req, res) {
  try {
    const apps = await AppRegistry.find({}).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, apps });
  } catch (error) {
    console.error("[appRegistry:listApps] error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch apps", error: error.message });
  }
}

async function createApp(req, res) {
  try {
    const { name, slug, baseUrl, serviceKey, color, description } = req.body;
    if (!name || !slug || !baseUrl || !serviceKey) {
      return res.status(400).json({ success: false, message: "name, slug, baseUrl, and serviceKey are required" });
    }
    const app = await AppRegistry.create({ name, slug, baseUrl, serviceKey, color, description });
    return res.status(201).json({ success: true, app });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "An app with this slug already exists" });
    }
    console.error("[appRegistry:createApp] error:", error);
    return res.status(500).json({ success: false, message: "Failed to create app", error: error.message });
  }
}

async function updateApp(req, res) {
  try {
    const { id } = req.params;
    const allowed = ["name", "baseUrl", "serviceKey", "isActive", "color", "description"];
    const payload = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    const app = await AppRegistry.findByIdAndUpdate(id, payload, { new: true });
    if (!app) return res.status(404).json({ success: false, message: "App not found" });
    return res.json({ success: true, app });
  } catch (error) {
    console.error("[appRegistry:updateApp] error:", error);
    return res.status(500).json({ success: false, message: "Failed to update app", error: error.message });
  }
}

async function deleteApp(req, res) {
  try {
    const { id } = req.params;
    const app = await AppRegistry.findByIdAndDelete(id);
    if (!app) return res.status(404).json({ success: false, message: "App not found" });
    return res.json({ success: true, message: "App deleted" });
  } catch (error) {
    console.error("[appRegistry:deleteApp] error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete app", error: error.message });
  }
}

async function proxyAppRequest(app, path, options = {}) {
  const url = `${app.baseUrl.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Service-Key": app.serviceKey,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw Object.assign(new Error(`Upstream ${response.status}: ${text}`), { status: response.status });
  }
  return response.json();
}

async function getAppUsers(req, res) {
  try {
    const app = await AppRegistry.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!app) return res.status(404).json({ success: false, message: "App not found or inactive" });

    const data = await proxyAppRequest(app, "/api/admin/users");
    return res.json({ ...data, appSlug: app.slug, appName: app.name });
  } catch (error) {
    console.error("[appRegistry:getAppUsers] error:", error);
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({ success: false, message: error.message });
  }
}

async function getAppUsage(req, res) {
  try {
    const app = await AppRegistry.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!app) return res.status(404).json({ success: false, message: "App not found or inactive" });

    const data = await proxyAppRequest(app, "/api/admin/usage");
    return res.json({ ...data, appSlug: app.slug, appName: app.name });
  } catch (error) {
    console.error("[appRegistry:getAppUsage] error:", error);
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({ success: false, message: error.message });
  }
}

async function banAppUser(req, res) {
  try {
    const app = await AppRegistry.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!app) return res.status(404).json({ success: false, message: "App not found or inactive" });

    const data = await proxyAppRequest(app, `/api/admin/users/${req.params.userId}/ban`, {
      method: "PATCH",
      body: req.body,
    });
    return res.json(data);
  } catch (error) {
    console.error("[appRegistry:banAppUser] error:", error);
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return res.status(status).json({ success: false, message: error.message });
  }
}

async function getAllAppsOverview(req, res) {
  try {
    const apps = await AppRegistry.find({ isActive: true }).lean();
    const results = await Promise.allSettled(
      apps.map(async (app) => {
        const data = await proxyAppRequest(app, "/api/admin/usage");
        return { appSlug: app.slug, appName: app.name, color: app.color, ...data };
      })
    );

    const appsData = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        appSlug: apps[i].slug,
        appName: apps[i].name,
        color: apps[i].color,
        success: false,
        error: r.reason?.message || "Failed to fetch",
      };
    });

    return res.json({ success: true, apps: appsData });
  } catch (error) {
    console.error("[appRegistry:getAllAppsOverview] error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listApps,
  createApp,
  updateApp,
  deleteApp,
  getAppUsers,
  getAppUsage,
  banAppUser,
  getAllAppsOverview,
};
