import mongoose from "mongoose";

const alertLogSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    alertType: {
      type: String,
      enum: ["expired", "near_expiry", "low_stock"],
      required: true,
    },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

alertLogSchema.index({ batchId: 1, alertType: 1, sentAt: -1 });

export default mongoose.model("AlertLog", alertLogSchema);