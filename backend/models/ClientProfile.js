import mongoose from "mongoose";

const clientProfile = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    profileImage: {
      type: String,
      default: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
    },
    // FACILITY INFORMATION
    dialysisCenterName: { type: String, required: true, trim: true },
    facilityType: { 
      type: String, 
      enum: ["Standalone Dialysis Center", "Hospital Based", "Government Facility"],
      default: "Standalone Dialysis Center" 
    },
    yearEstablished: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    machines: { type: Number, default: 0 },
    address: { type: String, trim: true },
    mobile: { type: String, trim: true },
    landline: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },

    // OWNERSHIP
    ownership: { 
      type: String, 
      enum: ["Private", "Partnership", "Government"],
      default: "Private" 
    },
    ownerName: { type: String, trim: true },
    medicalDirector: { type: String, trim: true },
    nephrologist: { type: String, trim: true },
    unitManager: { type: String, trim: true },

    // PROCUREMENT & ACCOUNTS INFORMATION
    purchasingContact: { type: String, trim: true },
    designation: { type: String, trim: true },
    procurementMobile: { type: String, trim: true },
    procurementEmail: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("ClientProfile", clientProfile);