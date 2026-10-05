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

export default router;
