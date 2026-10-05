import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  type: { type: String, enum: ["expired", "near-expiry"], required: true },
  itemCode: { type: String, required: true, ref: "Product" },
  batchCode: { type: String, required: true, ref: "Batch" },
  expirationDate: { type: Date },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("NotificationAdmin", notificationSchema);