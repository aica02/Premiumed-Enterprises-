import express from "express";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import ClientRequest from "../models/ClientRequest.js";
import multer from "multer";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import createActivityLog from "../utils/createActivityLogs.js";
import {
  sendEmailWithRetry,
  sendAccountApprovalEmail,
} from "../utils/emailService.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../config/cloudinary.js";

dotenv.config();

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
const registrationUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Only PDF, JPG, and PNG files are allowed"));
    }
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

    if (user.role !== "Admin" && user.role !== "User") {
      await createActivityLog({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: "Failed login",
        module: "Authentication",
        description: `Access denied for "${user.username}" (role: ${user.role}). Only Admins and Client Users may log in.`,
      });
      return res.status(403).json({
        error: "Access denied. Only Admin and Client Users are allowed to log in.",
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

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" },
    );
    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "server error" });
  }
});
router.post(
  "/register-request",
  (req, res, next) => {
    registrationUpload.fields([
      { name: "dtiDocument", maxCount: 1 },
      { name: "otherDocument", maxCount: 1 },
    ])(req, res, (error) => {
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      next();
    });
  },
  async (req, res) => {
    const uploadedAssets = [];
    try {
      const files = req.files || {};
      const dtiFile = files.dtiDocument?.[0];
      const otherFile = files.otherDocument?.[0];
      let dtiDocument;
      let otherDocument;

      if (dtiFile) {
        const result = await uploadToCloudinary(dtiFile.buffer, {
          folder: "client-registration-documents",
        });
        uploadedAssets.push(result);
        dtiDocument = {
          url: result.secure_url,
          fileName: dtiFile.originalname,
        };
      }

      if (otherFile) {
        const result = await uploadToCloudinary(otherFile.buffer, {
          folder: "client-registration-documents",
        });
        uploadedAssets.push(result);
        otherDocument = {
          documentType: req.body.otherDocumentType || "Other",
          url: result.secure_url,
          fileName: otherFile.originalname,
        };
      }

      const newRequest = new ClientRequest({
        ...req.body,
        dtiDocument,
        otherDocument,
      });
      await newRequest.save();
      res.status(201).json({ message: "Application submitted for review!" });
    } catch (err) {
      await Promise.all(
        uploadedAssets.map(async (asset) => {
          try {
            await deleteFromCloudinary(asset.public_id, {
              resource_type: asset.resource_type,
            });
          } catch (cleanupError) {
            console.error("Failed to clean up registration document:", cleanupError);
          }
        }),
      );
      console.error("Registration request error:", err);
      res.status(err.name === "ValidationError" ? 400 : 500).json({
        error: err.message || "Failed to submit application.",
      });
    }
  },
);

router.get("/requests", async (req, res) => {
  try {
    const requests = await ClientRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/approve-client",
  upload.single("attachment"),
  async (req, res) => {
    if (!req.body || !req.body.requestId) {
      console.error("Payload Error: req.body is missing or empty.");
      return res.status(400).json({ error: "Required fields missing." });
    }

    const {
      requestId,
      username,
      password,
      profileImagePublicId,
    } = req.body;
    const file = req.file;

    try {
      // 1. Required field validation
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: "Username and password are required.",
        });
      }

      // 2. Find the client request
      const requestData = await ClientRequest.findById(requestId);
      if (!requestData) {
        console.error("Request not found:", requestId);
        return res
          .status(404)
          .json({ success: false, error: "Request not found." });
      }

      // 3. Prevent re-approval
      if (requestData.status === "APPROVED") {
        return res.status(409).json({
          success: false,
          error: "This request has already been approved.",
        });
      }

      // 4. Username uniqueness check (case-insensitive)
      const existingUsername = await User.findOne({
        username: {
          $regex: new RegExp(`^${escapeRegex(username)}$`, "i"),
        },
      });
      if (existingUsername) {
        console.error("Username already exists:", username);
        return res.status(409).json({
          success: false,
          error:
            "Username already exists. Please choose a different username.",
        });
      }

      // 5. Email uniqueness check (case-insensitive)
      const normalizedEmail = (requestData.email || "").toLowerCase().trim();
      if (normalizedEmail) {
        const existingEmail = await User.findOne({
          email: {
            $regex: new RegExp(
              `^${escapeRegex(normalizedEmail)}$`,
              "i"
            ),
          },
        });
        if (existingEmail) {
          console.error("Email already exists:", normalizedEmail);
          return res.status(409).json({
            success: false,
            error:
              "A user with this email already exists. Cannot approve this request.",
          });
        }
      }

      // 6. Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const collection = mongoose.connection.collection("users");

      const settingsData = await Settings.findOne();
      const profileImageUrl = settingsData?.profileImage || "";

      // 7. Build user document
      const userData = {
        username,
        password: hashedPassword,
        role: "User",
        status: "Active",
        profileImage: profileImageUrl,
        profileImagePublicId: profileImagePublicId || "",
        fullName: requestData.dialysisCenterName || "N/A",
        facilityType:
          requestData.facilityType || "Standalone Dialysis Center",
        yearEstablished: requestData.yearEstablished || "N/A",
        registrationNumber: requestData.registrationNumber || "N/A",
        machines: Number(requestData.machines) || 0,
        address: requestData.address || "N/A",
        phoneNumber: requestData.mobile || "N/A",
        landline: requestData.landline || "N/A",
        email: normalizedEmail || "N/A",
        ownership: requestData.ownership || "Private",
        ownerName: requestData.ownerName || "N/A",
        medicalDirector: requestData.medicalDirector || "N/A",
        nephrologist: requestData.nephrologist || "N/A",
        unitManager: requestData.unitManager || "N/A",
        purchasingContact: requestData.purchasingContact || "N/A",
        designation: requestData.designation || "N/A",
        procurementMobile: requestData.procurementMobile || "N/A",
        procurementEmail: requestData.procurementEmail || "N/A",
        dtiDocument: requestData.dtiDocument?.url
          ? requestData.dtiDocument
          : undefined,
        otherDocument: requestData.otherDocument?.url
          ? requestData.otherDocument
          : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 8. Insert (catch race-condition duplicates)
      console.log("Inserting user data...");
      let result;
      try {
        result = await collection.insertOne(userData);
        console.log("User inserted successfully! ID:", result.insertedId);
      } catch (insertErr) {
        if (insertErr.code === 11000) {
          return res.status(409).json({
            success: false,
            error: "Username or email already exists.",
          });
        }
        throw insertErr;
      }

      const userId = result.insertedId;

      // 9. Mark request as approved
      requestData.status = "APPROVED";
      await requestData.save();

      // 10. Activity log
      try {
        await createActivityLog({
          userId,
          username,
          role: "User",
          action: "Approve client",
          module: "Client management",
          description: `User account "${username}" was created.`,
        });
      } catch (logErr) {
        console.error("Failed to create activity log:", logErr);
      }

      // 11. Send approval email
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
            file
          );
          console.log(
            "Email result:",
            emailResult.success ? "SUCCESS" : "FAILED"
          );
          if (emailResult.error) {
            console.error("Email error:", emailResult.error);
          }
        } else {
          console.warn(
            "System email credentials not configured. Email not sent."
          );
        }
      } catch (emailErr) {
        console.error("Email error:", emailErr);
        emailResult = { success: false, error: emailErr.message };
      }

      // 12. Respond
      res.json({
        success: true,
        message: "Account created and client approved successfully!",
        emailSent: emailResult.success || false,
        user: {
          username,
          email: requestData.email,
          fullName: requestData.dialysisCenterName,
        },
      });
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
  }
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
