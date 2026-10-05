import mongoose from "mongoose";

const Supplier = new mongoose.Schema({
  id: { 
    type: String, 
    required: true, 
    unique: true 
  }, 
  name: { type: String, required: true },
  role: { type: String },
  contact: { type: String, required: true },
  phone: { type: String },
  email: { type: String },
  address: { type: String },
  location: { type: String },
  status: { type: String, default: "Active" },
  tinNumber: { type: String },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('Supplier', Supplier);