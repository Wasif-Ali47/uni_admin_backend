const express = require("express");
const { verifyAdmin } = require("../middlewares/adminAuthMiddleware");
const {
  listApps,
  createApp,
  updateApp,
  deleteApp,
  getAppUsers,
  getAppUsage,
  banAppUser,
  getAllAppsOverview,
} = require("../controllers/appRegistryController");

const router = express.Router();

router.use(verifyAdmin);

router.get("/", listApps);
router.post("/", createApp);
router.put("/:id", updateApp);
router.delete("/:id", deleteApp);

router.get("/overview/all", getAllAppsOverview);
router.get("/:slug/users", getAppUsers);
router.get("/:slug/usage", getAppUsage);
router.patch("/:slug/users/:userId/ban", banAppUser);

module.exports = router;
