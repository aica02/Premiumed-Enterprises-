import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema({
  // AUTHENTICATION & CORE
  employeeId: { 
    type: String, 
    unique: true, 
    sparse: true, 
    trim: true 
  },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  role: { 
    type: String, 
    enum: ["Admin", "Staff", "User", "Driver"], 
    required: true 
  },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  profileImage: { type: String, default: "" },
  profileImagePublicId:{type: String, default: null},

  // FACILITY INFORMATION
  fullName: { type: String, required: true },
  facilityType: { type: String },
  yearEstablished: { type: String },
  registrationNumber: { type: String },
  machines: { type: Number, default: 0 },
  address: { type: String },
  phoneNumber: { type: String },
  landline: { type: String },
  email: { type: String },

  // OWNERSHIP & PERSONNEL
  ownership: { type: String },
  ownerName: { type: String },
  medicalDirector: { type: String },
  nephrologist: { type: String },
  unitManager: { type: String },

  // PROCUREMENT INFORMATION
  purchasingContact: { type: String },
  designation: { type: String },
  procurementMobile: { type: String },
  procurementEmail: { type: String },
  lastLogin: {
    type: Date
  }
}, { timestamps: true });

UserSchema.pre("validate", function(next) {
  if (this.role !== "User" && !this.employeeId) {
    this.invalidate("employeeId", "Employee ID is required for Staff, Drivers, and Admins.");
  }
});

UserSchema.pre("save", async function(next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }

  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(this.password, salt);
    this.password = hash;
    return next();
  } catch (err) {
    console.error("Password Hashing Error:", err);
    return next(err);
  }
});

export default mongoose.model("User", UserSchema);