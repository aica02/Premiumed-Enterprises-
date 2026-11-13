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

        // Brand change: set when the client accepted another brand for this
        // line. Holds the product the client first ordered.
        originalItemCode: { type: String, trim: true, default: "" },
        originalName: { type: String, trim: true, default: "" },
        // An open or answered brand-change offer for this line. No price is
        // stored here: the client never sees the new brand's price.
        brandChange: {
          status: {
            type: String,
            enum: ["", "PROPOSED", "ACCEPTED", "DECLINED"],
            default: "",
          },
          toItemCode: { type: String, trim: true, default: "" },
          toName: { type: String, trim: true, default: "" },
          toUnitType: { type: String, trim: true, default: "" },
          toQuantityPerBox: { type: Number, default: 0, min: 0 },
          // Pieces of this line that the new brand replaces.
          replaceQuantity: { type: Number, default: 0, min: 0 },
          // What the client gets of the new brand, in pieces, and how it was
          // ordered (boxes of the new brand, or pieces).
          newQuantity: { type: Number, default: 0, min: 0 },
          newOrderMode: { type: String, enum: ["box", "piece"], default: "piece" },
          newBoxes: { type: Number, default: 0, min: 0 },
          reason: { type: String, trim: true, default: "" },
          proposedBy: { type: String, trim: true, default: "" },
          proposedAt: { type: Date, default: null },
          answeredAt: { type: Date, default: null },
        },
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
    "PAYMENT REVIEW",   // ← NEW
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
  enum: ["PENDING", "REJECTED", "AWAITING REVIEW", "COMPLETED"], // ← add both
  default: "PENDING",
},
    paymentSlip: {
      type: String,
      default: "",
    },
    paymentRejectedAt: {
      type: Date,
    },
    paymentAcceptedAt: { type: Date },   // ← NEW
paymentAcceptedBy: { type: String }, // ← NEW

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
    // True while a proposed delivery date waits for the client. A RETURNED
    // order can also be waiting on a brand change, so status alone does not
    // say which.
    awaitingDateApproval: { type: Boolean, default: false },
    brandChangeHistory: [
      {
        fromItemCode: String,
        fromName: String,
        toItemCode: String,
        toName: String,
        replaceQuantity: Number,
        newQuantity: Number,
        newOrderMode: String,
        newBoxes: Number,
        reason: String,
        status: String, // PROPOSED, ACCEPTED or DECLINED
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],
    deliveredDate: {
      type: Date,
      default: null,
    },
    // Set by the cancel routes; was silently dropped before it was declared.
    cancelledDate: { type: Date, default: null },
    // Set when the order moves to TO SHIP; was silently dropped before.
    shippedDate: { type: Date, default: null },
    // When picking deducted this order's stock. Claimed atomically before any
    // deduction, so a replayed "complete" request cannot deduct twice.
    inventoryDeductedAt: { type: Date, default: null },

    // Pay-after-delivery: the driver's photo of the signed delivery receipt
    // (a Cloudinary URL) and who delivered the order.
    deliveryReceipt: { type: String, default: "" },
    deliveredBy: { type: String, default: "" },
    // Payment is due 30 days after delivery.
    paymentDueDate: { type: Date, default: null },
    // Alert bookkeeping for the hourly payment job.
    lastDueReminderAt: { type: Date, default: null }, // client reminder at day 7, 14, 21 (before due)
    overdueSmsSentAt: { type: Date, default: null }, // admin SMS, sent once at day 30
    lastOverdueEmailAt: { type: Date, default: null }, // client email, repeats every 7 days
    slipSubmittedAt: { type: Date, default: null }, // when the slip under review was uploaded
    slipReminderSentAt: { type: Date, default: null }, // accountant reminder, sent once
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
