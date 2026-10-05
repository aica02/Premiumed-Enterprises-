import express from "express";
import Batch from "../models/Batch.js";
import NotificationAdmin from "../models/NotificationAdmin.js";

const router = express.Router();

async function generateNotifications() {
  const today = new Date();
  const nearExpiryThreshold = 7; // days

  const batches = await Batch.find({ status: { $ne: "disposed" } });

  for (let batch of batches) {
    const diff = (batch.expirationDate - today) / (1000 * 60 * 60 * 24); // difference in days
    let type = null;

    if (diff < 0) type = "expired";
    else if (diff <= nearExpiryThreshold) type = "near-expiry";

    if (type) {
      const exists = await NotificationAdmin.findOne({
        batchCode: batch.batchCode,
        type,
      });
      if (!exists) {
        await NotificationAdmin.create({
          message: `Batch ${batch.batchCode} (${batch.itemName}) is ${type}`,
          type,
          itemCode: batch.itemCode,
          batchCode: batch.batchCode,
          expirationDate: batch.expirationDate,
        });
      }
    }
  }
}

// API: trigger generation manually
router.get("/generate", async (req, res) => {
  try {
    await generateNotifications();
    res.json({ message: "Notifications generated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get admin notifications
router.get("/", async (req, res) => {
  try {
    // Ensure notifications exist for current batches before returning
    try {
      await generateNotifications();
    } catch (genErr) {
      console.error("Notification generation failed:", genErr);
    }

    const notifications = await NotificationAdmin.find()
      .sort({ createdAt: -1 })
      .lean();
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
// Mark all as read
router.patch("/read-all", async (req, res) => {
  try {
    await NotificationAdmin.updateMany({ isRead: false }, { isRead: true });

    res.json({
      message: "All notifications marked as read",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

// Mark a specific notification as read
router.patch("/:id/read", async (req, res) => {
  try {
    const notification = await NotificationAdmin.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

export default router;
