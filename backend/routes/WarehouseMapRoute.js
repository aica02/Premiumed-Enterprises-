import express from "express";
import WarehouseMapLayout from "../models/WarehouseMapLayout.js";
import Batch from "../models/Batch.js";

const router = express.Router();

router.get("/layout", async (req, res) => {
  try {
    const layout = await WarehouseMapLayout.findOne().lean();
    res.json({ locations: layout?.locations || [] });
  } catch (error) {
    console.error("Failed to load warehouse map additions:", error);
    res.status(500).json({ message: "Failed to load warehouse map layout." });
  }
});

router.post("/layout/locations", async (req, res) => {
  const { id, type, top, left, width, height } = req.body || {};
  const values = [top, left, width, height];
  const hasValidGeometry =
    values.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) &&
    top >= 0 &&
    left >= 0 &&
    width > 0 &&
    height > 0 &&
    top + height <= 100 &&
    left + width <= 100;

  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    id.length > 64 ||
    !["rack", "pallet"].includes(type) ||
    !hasValidGeometry
  ) {
    return res.status(400).json({ message: "Invalid warehouse location." });
  }

  try {
    let layout = await WarehouseMapLayout.findOne();
    if (!layout) {
      layout = new WarehouseMapLayout();
    }

    const normalizedId = id.trim();
    if (
      layout.locations.some(
        (location) => location.id.toLowerCase() === normalizedId.toLowerCase(),
      )
    ) {
      return res
        .status(409)
        .json({ message: "That location name already exists." });
    }

    const location = { id: normalizedId, type, top, left, width, height };
    layout.locations.push(location);
    await layout.save();
    res.status(201).json({ location });
  } catch (error) {
    console.error("Failed to add warehouse map location:", error);
    res.status(500).json({ message: "Failed to save warehouse map location." });
  }
});

router.patch("/layout/locations", async (req, res) => {
  const { id, top, left, width, height } = req.body || {};
  const values = [top, left, width, height];
  const hasValidGeometry =
    values.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) &&
    top >= 0 &&
    left >= 0 &&
    width > 0 &&
    height > 0 &&
    top + height <= 100 &&
    left + width <= 100;

  if (typeof id !== "string" || id.trim().length === 0 || !hasValidGeometry) {
    return res.status(400).json({ message: "Invalid warehouse location." });
  }

  try {
    const layout = await WarehouseMapLayout.findOne();
    const location = layout?.locations.find((entry) => entry.id === id.trim());
    if (!location) {
      return res.status(404).json({ message: "Added location not found." });
    }

    location.top = top;
    location.left = left;
    location.width = width;
    location.height = height;
    await layout.save();
    res.json({ location });
  } catch (error) {
    console.error("Failed to update warehouse map location:", error);
    res
      .status(500)
      .json({ message: "Failed to update warehouse map location." });
  }
});

router.delete("/layout/locations", async (req, res) => {
  const { id } = req.body || {};
  if (typeof id !== "string" || id.trim().length === 0) {
    return res.status(400).json({ message: "A location name is required." });
  }

  try {
    const locationId = id.trim();
    const layout = await WarehouseMapLayout.findOne();
    const locationIndex = layout?.locations.findIndex(
      (location) => location.id === locationId,
    );

    if (locationIndex === undefined || locationIndex < 0) {
      return res.status(404).json({ message: "Added location not found." });
    }

    const occupiedBatches = await Batch.find({
      storageLocation: locationId,
      status: { $in: ["stored", "for disposal"] },
      quantity: { $gt: 0 },
    })
      .select("itemName batchCode quantity")
      .lean();

    if (occupiedBatches.length > 0) {
      const itemNames = [
        ...new Set(occupiedBatches.map((batch) => batch.itemName)),
      ];
      return res.status(409).json({
        message: `Cannot remove ${locationId}: it still contains ${occupiedBatches.length} active batches of ${itemNames.join(", ")}.`,
      });
    }

    const [location] = layout.locations.splice(locationIndex, 1);
    await layout.save();
    res.json({ location });
  } catch (error) {
    console.error("Failed to remove warehouse map location:", error);
    res
      .status(500)
      .json({ message: "Failed to remove warehouse map location." });
  }
});

export default router;
