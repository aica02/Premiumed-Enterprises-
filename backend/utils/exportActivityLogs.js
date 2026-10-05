import path from "path";
import { fileURLToPath } from "url";
import ActivityLog from "../models/ActivityLog.js";
import ArchivedActivityLog from "../models/ArchivedActivityLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Export activity logs for archival, keep DB logs,
 * and move older records into the archive collection.
 * @param {Object} options
 * @param {number} options.retentionDays - how many days before logs move to archive (default 365)
 */
const exportActivityLogs = async (options = {}) => {
  const { retentionDays = 365 } = options;
  try {
    // Fetch all current logs
    const logs = await ActivityLog.find().lean();
    if (!logs || logs.length === 0) {
      console.log("No activity logs to export.");
    } else {
      console.log(
        `Found ${logs.length} activity logs available for daily processing.`,
      );
    }

    // Retention: move DB records older than retentionDays into ArchivedActivityLog
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    try {
      const oldLogs = await ActivityLog.find({
        createdAt: { $lt: cutoff },
      }).lean();
      if (oldLogs && oldLogs.length > 0) {
        await ArchivedActivityLog.insertMany(oldLogs);
        await ActivityLog.deleteMany({
          _id: { $in: oldLogs.map((l) => l._id) },
        });
        console.log(
          `Archived ${oldLogs.length} activity logs to ArchivedActivityLog collection.`,
        );
      } else {
        console.log("No DB activity logs older than retention to archive.");
      }
    } catch (archiveErr) {
      console.error("Failed to archive old DB logs:", archiveErr);
    }

    return true;
  } catch (err) {
    console.error("Error exporting activity logs:", err);
    throw err;
  }
};

export default exportActivityLogs;
