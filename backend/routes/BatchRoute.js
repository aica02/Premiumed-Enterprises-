import express from "express";
import Batch from "../models/Batch.js";
import createActivityLog from "../utils/createActivityLogs.js";
const router = express.Router();

router.patch("/:id/complete", async (req, res) => {
  console.log("Update request received for ID:", req.params.id);
  try {
    const updatedBatch = await Batch.findByIdAndUpdate(
      req.params.id,
      { status: "stored" },
      { new: true },
    );

    if (!updatedBatch) {
      return res.status(404).json({ message: "Batch ID not found" });
    }

    res.json({ message: "Putaway confirmed", batch: updatedBatch });
  } catch (err) {
    res.status(400).json({ message: "Update failed: " + err.message });
  }
});
// NEW: Deduct inventory based on picking
router.post("/deduct", async (req, res) => {
  const { pickedItems } = req.body; // Expecting { "BATCH-001": 100, "BATCH-002": 50 }

  try {
    const session = await Batch.startSession();
    session.startTransaction();

    try {
      for (const [batchCode, qtyToDeduct] of Object.entries(pickedItems)) {
        // Find the batch and ensure it's not disposed/expired before deducting
        const batch = await Batch.findOne({ batchCode }).session(session);

        if (!batch) {
          throw new Error(`Batch ${batchCode} not found.`);
        }

        if (batch.quantity < qtyToDeduct) {
          throw new Error(
            `Insufficient stock in Batch ${batchCode}. Available: ${batch.quantity}`,
          );
        }

        // Subtract the quantity
        batch.quantity -= qtyToDeduct;

        // Optional: If quantity reaches 0, you might want to change status to 'out-of-stock'
        if (batch.quantity === 0) {
          // batch.status = "depleted";
        }

        await batch.save({ session });
      }

      await session.commitTransaction();
      session.endSession();
      res.json({ message: "Inventory successfully deducted per FEFO." });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});
router.get("/", async (req, res) => {
  try {
    const pendingBatches = await Batch.find({ status: "pending" })
      .populate({
        path: "product",
        options: { strictPopulate: false }, // This ignores the schema error
      })
      .sort({ createdAt: -1 })
      .lean();

    res.json(pendingBatches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/count", async (req, res) => {
  //to count how many unstore supplies
  try {
    const count = await Batch.countDocuments({
      status: "pending",
    });

    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const allBatches = await Batch.find({})

      .sort({ createdAt: -1 })
      .lean();

    res.json(allBatches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/disposeBatch", async (req, res) => {
  const { batchNumber } = req.body;

  try {
    const updatedBatch = await Batch.findOneAndUpdate(
      { batchCode: batchNumber },
      { status: "for disposal" },
      { new: true },
    );

    if (!updatedBatch) {
      return res.status(404).json({ message: "Batch code not found" });
    }

    const actor = req.actor || {};
    await createActivityLog({
      userId: actor.userId || null,
      username:
        actor.username && actor.username !== "Unknown" ? actor.username : "Admin",
      role: actor.role && actor.role !== "Unknown" ? actor.role : "Admin",
      action: "Mark batch for disposal",
      module: "Inventory",
      description: `Batch ${updatedBatch.batchCode} for ${updatedBatch.itemName} was marked for disposal. Quantity: ${updatedBatch.quantity}.`,
    });

    res.json({
      message: "Batch successfully moved to 'for disposal' status",
      batch: updatedBatch,
    });
  } catch (err) {
    res.status(500).json({ message: "Error updating batch: " + err.message });
  }
});

router.get("/disposeCount", async (req, res) => {
  //to count how many supplies are not dispose
  try {
    const count = await Batch.countDocuments({
      status: "for disposal",
    });

    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
