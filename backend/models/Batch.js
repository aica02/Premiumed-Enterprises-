import mongoose from "mongoose";
import WarehouseMapLayout from "./WarehouseMapLayout.js";
import { ensureWarehouseMapDefaults } from "../utils/warehouseMapDefaults.js";

const batchSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true },
    itemCode: { type: String, required: true, ref: "Product" },
    supplierName: { type: String, required: true },
    batchCode: { type: String, unique: true, sparse: true },
    expirationDate: { type: Date, required: true },
    disposedDate: { type: Date },
    box: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0 },
    unitType: { type: String, trim: true },
    storageLocation: {
      type: String,
      required: true,
      validate: {
        validator: async (locationId) => {
          await ensureWarehouseMapDefaults();
          return Boolean(
            await WarehouseMapLayout.exists({
              "locations.id": locationId,
            }),
          );
        },
        message: "Storage location must be a configured warehouse location.",
      },
    },
    status: {
      type: String,
      enum: ["pending", "stored", "for disposal", "disposed", "depleted"],
      default: "pending",
    },
  },
  { timestamps: true },
);

batchSchema.pre("save", async function (next) {
  // If batchCode already exists, skip generation
  if (this.batchCode) {
    return;
  }

  try {
    // Get the product to access itemCode
    const Product = mongoose.model("Product");
    const product = await Product.findOne({ itemCode: this.itemCode });

    if (!product) {
      // If product not found, generate a temporary batch code
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const random = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      this.batchCode = `BATCH-${dateStr}-${random}`;
      console.log(
        "Product not found, generated temporary batch code:",
        this.batchCode,
      );
      return next();
    }

    // Generate batch code from product itemCode
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    const codeParts = this.itemCode.split("-");
    let itemIdentifier;

    if (codeParts.length >= 3) {
      const categoryPart = codeParts[1]; // "CARD"
      const seriesPart = codeParts[2]; // "001"
      itemIdentifier = `${categoryPart}${seriesPart}`;
    } else {
      // Fallback for custom item codes
      itemIdentifier = this.itemCode.slice(-6);
    }

    const lastBatch = await mongoose
      .model("Batch")
      .findOne({ itemCode: this.itemCode })
      .sort({ createdAt: -1 })
      .lean();

    let nextBatchNum = 1;

    if (lastBatch && lastBatch.batchCode) {
      // Extract the last 2 digits from the batch code
      const match = lastBatch.batchCode.match(/(\d{2})$/);
      if (match) {
        nextBatchNum = parseInt(match[1]) + 1;
      }
    }

    const batchSeries = nextBatchNum.toString().padStart(2, "0");

    this.batchCode = `${dateStr}${itemIdentifier}${batchSeries}`;
    console.log("Generated batch code:", this.batchCode);
  } catch (error) {
    console.error("Error generating batch code:", error);
    // Fallback: generate a simple batch code
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    this.batchCode = `BATCH-${dateStr}-${random}`;
  }
});
export default mongoose.model("Batch", batchSchema);
