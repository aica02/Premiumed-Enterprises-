import express from "express";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import ClientRequest from "../models/ClientRequest.js";
import multer from "multer";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import createActivityLog from "../utils/createActivityLogs.js";
import {
  sendEmailWithRetry,
  sendAccountApprovalEmail,
} from "../utils/emailService.js";

dotenv.config();

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.post("/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = req.body?.password;

  if (!username || !password) {
    return res.status(400).json({ error: "no credentials" });
  }

  try {
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") },
    });

    if (!user) {
      await createActivityLog({
        userId: null,
        username: username,
        role: "Unknown",
        action: "Failed login",
        module: "Authentication",
        description: `Failed login attempt for unknown username "${username}".`,
      });
      return res.status(401).json({ error: "wrong username" });
    }

    if (user.status !== "Active") {
      await createActivityLog({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: "Failed login",
        module: "Authentication",
        description: `Failed login attempt for deactivated user "${user.username}".`,
      });
      return res.status(403).json({
        error:
          "Your account is deactivated. Please contact an admin for information.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await createActivityLog({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: "Failed login",
        module: "Authentication",
        description: `Failed login attempt for user "${user.username}".`,
      });
      return res.status(401).json({ error: "wrong password" });
    }

    await createActivityLog({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: "Login",
      module: "Authentication",
      description: `${user.role} "${user.username}" logged in successfully.`,
    });

    const token = "dummy-token";
    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "server error" });
  }
});

router.post("/register-request", async (req, res) => {
  try {
    const newRequest = new ClientRequest(req.body);
    await newRequest.save();
    res.status(201).json({ message: "Application submitted for review!" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/requests", async (req, res) => {
  try {
    const requests = await ClientRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/approve-client", upload.single("attachment"), async (req, res) => {
    if (!req.body || !req.body.requestId) {
      console.error("Payload Error: req.body is missing or empty.");
      return res.status(400).json({ error: "Required fields missing." });
    }

    const { requestId, username, password, profileImagePublicId } = req.body;
    const file = req.file;

    try {
      const requestData = await ClientRequest.findById(requestId);
      if (!requestData) {
        console.error("Request not found:", requestId);
        return res.status(404).json({ error: "Request not found" });
      }

      const existingUser = await User.findOne({
        username: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") },
      });
      if (existingUser) {
        console.error("Username already exists:", username);
        return res.status(400).json({
          error: "Username already exists. Please choose a different username.",
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const collection = mongoose.connection.collection("users");

      const settingsData = await Settings.findOne();
      const profileImageUrl = settingsData?.profileImage || "";

      const userData = {
        username,
        password: hashedPassword,
        role: "User",
        status: "Active",
        profileImage: "",
        profileImagePublicId: "",
        fullName: requestData.dialysisCenterName || "N/A",
        facilityType: requestData.facilityType || "Standalone Dialysis Center",
        yearEstablished: requestData.yearEstablished || "N/A",
        registrationNumber: requestData.registrationNumber || "N/A",
        machines: Number(requestData.machines) || 0,
        address: requestData.address || "N/A",
        phoneNumber: requestData.mobile || "N/A",
        landline: requestData.landline || "N/A",
        email: requestData.email || "N/A",
        ownership: requestData.ownership || "Private",
        ownerName: requestData.ownerName || "N/A",
        medicalDirector: requestData.medicalDirector || "N/A",
        nephrologist: requestData.nephrologist || "N/A",
        unitManager: requestData.unitManager || "N/A",
        purchasingContact: requestData.purchasingContact || "N/A",
        designation: requestData.designation || "N/A",
        procurementMobile: requestData.procurementMobile || "N/A",
        procurementEmail: requestData.procurementEmail || "N/A",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      console.log("Inserting user data...");
      const result = await collection.insertOne(userData);
      console.log("User inserted successfully! ID:", result.insertedId);

      const userId = result.insertedId;
      requestData.status = "APPROVED";
      await requestData.save();

      try {
        await createActivityLog({
          userId: userId,
          username: username,
          role: "User",
          action: "Approve client",
          module: "Client management",
          description: `User account "${username}" was created.`,
        });
      } catch (logErr) {
        console.error("Failed to create activity log:", logErr);
      }

      let emailResult = { success: false, error: null };
      try {
        if (process.env.SYSTEM_EMAIL && process.env.SYSTEM_PASSWORD) {
          console.log("Email credentials found, sending...");
          console.log("File attached:", file ? "Yes" : "No");
          if (file) {
            console.log("File name:", file.originalname);
            console.log("File size:", file.size);
          }

          emailResult = await sendAccountApprovalEmail(
            requestData.email,
            username,
            password,
            requestData.dialysisCenterName,
            file,
          );
          console.log(
            "Email result:",
            emailResult.success ? "SUCCESS" : "FAILED",
          );
          if (emailResult.error) {
            console.error("Email error:", emailResult.error);
          }
        } else {
          console.warn(
            "System email credentials not configured. Email not sent.",
          );
        }
      } catch (emailErr) {
        console.error("Email error:", emailErr);
        emailResult = { success: false, error: emailErr.message };
      }

      const response = {
        success: true,
        message: "Account created and client approved successfully!",
        emailSent: emailResult.success || false,
        user: {
          username: username,
          email: requestData.email,
          fullName: requestData.dialysisCenterName,
        },
      };
      res.json(response);
    } catch (err) {
      console.error("APPROVAL ERROR");
      console.error("Error name:", err.name);
      console.error("Error message:", err.message);
      console.error("Error stack:", err.stack);

      res.status(500).json({
        success: false,
        error: err.message || "Internal server error",
      });
    }
  },
);

// GET PROFILE
router.get("/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
