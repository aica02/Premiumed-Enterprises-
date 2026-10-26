import mongoose from "mongoose";

const warehouseLocationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["rack", "pallet"] },
    top: { type: Number, required: true, min: 0, max: 100 },
    left: { type: Number, required: true, min: 0, max: 100 },
    width: { type: Number, required: true, min: 0, max: 100 },
    height: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

const warehouseMapLayoutSchema = new mongoose.Schema(
  {
    locations: { type: [warehouseLocationSchema], default: [] },
  },
  { timestamps: true },
);

const WarehouseMapLayout = mongoose.model(
  "WarehouseMapLayout",
  warehouseMapLayoutSchema,
);

export default WarehouseMapLayout;
