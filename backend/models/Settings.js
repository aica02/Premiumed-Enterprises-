import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema({
  autoPrioritize: { type: Boolean, default: true },
  urgencyThreshold: { type: Number, default: 0 },
  notifySupervisor: { type: Boolean, default: true },
  stockAlertsEnabled: { type: Boolean, default: true },
  notifyStaffStock: { type: Boolean, default: true },
  reorderNotifyOwner: { type: Boolean, default: true },
  reorderNotifySupervisor: { type: Boolean, default: true },
  reorderNotifyStaff: { type: Boolean, default: true },
  offlineMode: { type: Boolean, default: true },
  lastSync: { type: Date, default: Date.now },
  accountantEmail: { type: String, default: "" },
  profileImage: { type: String, default: "" },
  profileImagePublicId: { type: String, default: "" },
  ownerNumber: { type: String, default: "" },
}, { timestamps: true });

// Compile schema into a model
const Settings = mongoose.model("Settings", SettingsSchema);
export default Settings;