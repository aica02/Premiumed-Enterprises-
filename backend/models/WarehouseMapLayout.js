import mongoose from "mongoose";

const warehouseLocationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["rack", "pallet", "table"] },
    top: { type: Number, required: true, min: 0, max: 100 },
    left: { type: Number, required: true, min: 0, max: 100 },
    width: { type: Number, required: true, min: 0, max: 100 },
    height: { type: Number, required: true, min: 0, max: 100 },
    className: { type: String, trim: true },
  },
  { _id: false },
);

const warehouseMapLayoutSchema = new mongoose.Schema(
  {
    locations: { type: [warehouseLocationSchema], default: [] },
    defaultsSeeded: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const WarehouseMapLayout = mongoose.model(
  "WarehouseMapLayout",
  warehouseMapLayoutSchema,
);

export default WarehouseMapLayout;
