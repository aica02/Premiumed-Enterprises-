import mongoose from "mongoose";

// Expiry alerts point at a product batch; payment and application alerts
// point at an order or a client instead, so the batch fields are only
// required for the expiry types.
const EXPIRY_TYPES = ["expired", "near-expiry"];
const requiredForExpiry = function () {
  return EXPIRY_TYPES.includes(this.type);
};

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  type: {
    type: String,
    enum: [
      ...EXPIRY_TYPES,
      "payment-overdue",
      "order-with-overdue",
      "client-application",
    ],
    required: true,
  },
  itemCode: { type: String, required: requiredForExpiry, ref: "Product" },
  batchCode: { type: String, required: requiredForExpiry, ref: "Batch" },
  expirationDate: { type: Date },
  orderId: { type: String },
  clientName: { type: String },
  clientUsername: { type: String },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("NotificationAdmin", notificationSchema);
