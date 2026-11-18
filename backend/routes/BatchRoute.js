import express from "express";
import Batch from "../models/Batch.js";
import Product from "../models/Product.js";
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
    const adminName =
      actor.username && actor.username !== "Unknown" ? actor.username : "Admin";
    await createActivityLog({
      userId: actor.userId || null,
      username: adminName,
      role: actor.role && actor.role !== "Unknown" ? actor.role : "Admin",
      action: "Mark batch for disposal",
      module: "Inventory",
      description: `Admin "${adminName}" marked the batch ${updatedBatch.batchCode} of ${updatedBatch.itemName} for disposal.`,
    });

    res.json({
      message: "Batch successfully moved to 'for disposal' status",
      batch: updatedBatch,
    });
  } catch (err) {
    res.status(500).json({ message: "Error updating batch: " + err.message });
  }
});

// Admin edits a stored batch to correct what was entered: No. of case (box),
// No. of box per case (quantityPerBox, saved on this batch only), quantity and
// expiration date. Each is saved as typed; quantity is not recalculated.
// Item, category, batch code and location stay as they are.
const EDIT_FIELD_LABELS = {
  box: "No. of case",
  quantityPerBox: "No. of box per case",
  quantity: "Quantity",
  expirationDate: "Expiration date",
};

const formatBatchValue = (field, value) => {
  if (value === undefined || value === null || value === "") return "none";
  if (field === "expirationDate") {
    return new Date(value).toISOString().slice(0, 10);
  }
  return String(value);
};

const parseWholeNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
};

router.put("/batch/:batchCode/edit", async (req, res) => {
  const { batchCode } = req.params;
  const body = req.body || {};
  const updates = {};

  if (body.box !== undefined) {
    const box = parseWholeNumber(body.box);
    if (box === null) {
      return res.status(400).json({ message: "No. of case must be a whole number of 0 or more." });
    }
    updates.box = box;
  }

  if (body.quantityPerBox !== undefined) {
    const quantityPerBox = parseWholeNumber(body.quantityPerBox);
    if (quantityPerBox === null) {
      return res.status(400).json({ message: "No. of box per case must be a whole number of 0 or more." });
    }
    updates.quantityPerBox = quantityPerBox;
  }

  if (body.quantity !== undefined) {
    const quantity = parseWholeNumber(body.quantity);
    if (quantity === null) {
      return res.status(400).json({ message: "Quantity must be a whole number of 0 or more." });
    }
    updates.quantity = quantity;
  }

  if (body.expirationDate !== undefined) {
    const expirationDate = new Date(body.expirationDate);
    if (!body.expirationDate || Number.isNaN(expirationDate.getTime())) {
      return res.status(400).json({ message: "Expiration date is not a valid date." });
    }
    updates.expirationDate = expirationDate;
  }

  try {
    const batch = await Batch.findOne({ batchCode });
    if (!batch) {
      return res.status(404).json({ message: "Batch code not found" });
    }
    if (batch.status !== "stored") {
      return res.status(409).json({
        message: `Only stored batches can be edited. This batch is ${batch.status}.`,
      });
    }

    // A batch without its own value uses the product's No. of box per case.
    let currentPerBox = batch.quantityPerBox;
    if (currentPerBox === undefined || currentPerBox === null) {
      const product = await Product.findOne({ itemCode: batch.itemCode })
        .select("quantityPerBox")
        .lean();
      currentPerBox = Number(product?.quantityPerBox) || 0;
    }
    const current = {
      box: batch.box,
      quantityPerBox: currentPerBox,
      quantity: batch.quantity,
      expirationDate: batch.expirationDate,
    };

    const changed = (field) =>
      updates[field] !== undefined &&
      formatBatchValue(field, current[field]) !==
        formatBatchValue(field, updates[field]);

    const changes = Object.keys(EDIT_FIELD_LABELS)
      .filter(changed)
      .map((field) => ({
        field,
        from: formatBatchValue(field, current[field]),
        to: formatBatchValue(field, updates[field]),
      }));

    if (changes.length === 0) {
      return res.status(400).json({ message: "No changes to save." });
    }

    for (const { field } of changes) {
      batch[field] = updates[field];
    }
    // Runs the schema checks (min values, required fields).
    await batch.save();

    // Product.totalQuantity / totalBoxes are running totals kept in step with
    // stored batches (putaway adds, picking and disposal subtract). Apply the
    // same quantity correction here so low-stock alerts stay right. Order
    // stock checks, picking and the dashboard read batches directly.
    if (changes.some(({ field }) => field === "quantity")) {
      const delta = (Number(batch.quantity) || 0) - (Number(current.quantity) || 0);
      const product = await Product.findOne({ itemCode: batch.itemCode });
      if (product) {
        product.totalQuantity = Math.max(
          0,
          (Number(product.totalQuantity) || 0) + delta,
        );
        product.totalBoxes =
          product.quantityPerBox > 0
            ? Math.floor(product.totalQuantity / product.quantityPerBox)
            : 0;
        await product.save();
      }
    }

    const actor = req.actor || {};
    const adminName =
      actor.username && actor.username !== "Unknown" ? actor.username : "Admin";
    const changeText = changes
      .map(({ field, from, to }) => `${EDIT_FIELD_LABELS[field]} ${from} → ${to}`)
      .join(", ");
    await createActivityLog({
      userId: actor.userId || null,
      username: adminName,
      role: actor.role && actor.role !== "Unknown" ? actor.role : "Admin",
      action: "Edit batch",
      module: "Inventory",
      description: `Admin "${adminName}" edited batch ${batch.batchCode} of ${batch.itemName}: ${changeText}.`,
    });

    res.json({ message: "Batch updated", batch, changes });
  } catch (err) {
    if (err.name === "ValidationError") {
      const first = Object.values(err.errors)[0];
      return res.status(400).json({ message: first?.message || err.message });
    }
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
