import express from "express";
import ActivityLog from "../models/ActivityLog.js";
import ArchivedActivityLog from "../models/ArchivedActivityLog.js";

const router = express.Router();

const displayRole = (role) => (role === "User" ? "Client" : role);

const normalizeLog = (log, source = "Active") => ({
  ...log,
  role: displayRole(log.role),
  source,
});

router.get("/", async (req, res) => {
  try {
    const includeArchived =
      String(req.query.includeArchived || "false").toLowerCase() === "true";

    const activeLogs = await ActivityLog.find().sort({ createdAt: -1 }).lean();
    let logs = activeLogs.map((log) => normalizeLog(log, "Active"));

    if (includeArchived) {
      const archivedLogs = await ArchivedActivityLog.find()
        .sort({ createdAt: -1 })
        .lean();
      logs = [
        ...logs,
        ...archivedLogs.map((log) => normalizeLog(log, "Archived")),
      ];
    }

    logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(logs);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/report-printed", async (req, res) => {
  const { reportName, module } = req.body || {};

  if (
    typeof reportName !== "string" ||
    !reportName.trim() ||
    reportName.length > 120 ||
    typeof module !== "string" ||
    !module.trim() ||
    module.length > 80
  ) {
    return res.status(400).json({ error: "Valid report name and module are required." });
  }

  try {
    await ActivityLog.create({
      userId: req.actor?.userId || undefined,
      username:
        req.actor?.username && req.actor.username !== "Unknown"
          ? req.actor.username
          : "Admin",
      role:
        req.actor?.role && req.actor.role !== "Unknown"
          ? req.actor.role
          : "Admin",
      action: "Print report",
      module: module.trim(),
      description: `${reportName.trim()} report was generated.`,
    });

    res.status(201).json({ message: "Report print activity logged." });
  } catch (err) {
    console.error("Failed to log report printing:", err);
    res.status(500).json({ error: "Failed to log report printing." });
  }
});

export default router;
