import mongoose from "mongoose";

const clientRequestSchema = new mongoose.Schema({
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
    
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING"
    },
  },
  { timestamps: true }
);

export default mongoose.model("ClientRequest", clientRequestSchema);