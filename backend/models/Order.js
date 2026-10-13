import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
      index: true,
    },
    originalOrderId: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    items: [
      {
        productId: { type: String, required: true },
        itemCode: { type: String, trim: true },
        name: { type: String, required: true, trim: true },
        category: { type: String, trim: true },
        unitType: { type: String, trim: true, default: "" },
        quantity: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 },
        image: { type: String, default: "" },

        // NEW:
        orderMode: { type: String, enum: ["box", "piece"], default: "piece" },
        boxes: { type: Number, default: 0, min: 0 },
        quantityPerBox: { type: Number, default: 0, min: 0 },
      },
    ],
    role: {
      type: String,
      default: "User",
      immutable: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "TO SHIP",
        "RETURNED",
        "DELIVERED",
        "PARTIAL",
        "CANCELLED",
      ],
      default: "PENDING",
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    shippingAddress: {
      type: String,
      default: "",
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "COMPLETED"],
      default: "PENDING",
    },
    paymentSlip: {
      type: String,
      default: "",
    },
    paymentRejectedAt: {
      type: Date,
    },

    rejectToken: {
      type: String,
      default: null,
    },
    rejectTokenExpiry: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
    requestedDeliveryDate: {
      type: String,
      default: "",
    },
    newDate: {
      type: String,
      default: "",
    },
    dateNote: {
      type: String,
      default: "",
    },
    dateChangeHistory: [
      {
        oldDate: String,
        newDate: String,
        reason: String,
        changedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deliveredDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
