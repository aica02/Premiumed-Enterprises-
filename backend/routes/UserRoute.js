import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import User from "../models/User.js";
import Counter from "../models/Counter.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import createActivityLog from "../utils/createActivityLogs.js";
import { validatePassword } from "../utils/passwordValidator.js";
import cloudinaryConfig from "../config/cloudinary.js";
import {
  sendEmailWithRetry,
  sendEmployeeAccountEmail,
} from "../utils/emailService.js";

dotenv.config();

const { cloudinary, upload, uploadToCloudinary, deleteFromCloudinary } =
  cloudinaryConfig;

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getActor = (req) => ({
  userId: req.actor?.userId || null,
  username: req.actor?.username || "Unknown",
  role: req.actor?.role || "Unknown",
});

const generateRandomPassword = () => {
  const length = 8;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
};

const getNextEmployeeId = async (role) => {
  try {
    const validRoles = ["Admin", "Staff", "Driver"];
    const normalizedRole = role;

    if (!validRoles.includes(normalizedRole)) {
      throw new Error(
        `Invalid role: ${role}. Must be one of: ${validRoles.join(", ")}`,
      );
    }

    const prefix = normalizedRole.substring(0, 3).toUpperCase();
    const counterId = `${normalizedRole}_employee_count`;

    const counter = await Counter.findOneAndUpdate(
      { id: counterId },
      { $inc: { seq: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    const sequenceNumber = counter.seq || 1;
    const employeeId = `${prefix}-${String(sequenceNumber).padStart(3, "0")}`;

    return employeeId;
  } catch (error) {
    throw error;
  }
};

// GET - Fetch all users
router.get("/", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Helper function to auto-generate unique username from Full Name
const generateUsername = async (fullName) => {
  let baseUsername = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();

  if (!baseUsername) baseUsername = "employee";

  let username = baseUsername;
  let count = 1;

  while (await User.findOne({ username })) {
    username = `${baseUsername}${count}`;
    count++;
  }

  return username;
};
//POST - creation of employee account
router.post("/", upload.single("profileImage"), async (req, res) => {
  try {
    const { email, role, fullName, ...otherDetails } = req.body;
    const file = req.file;

    if (!fullName || !role || !email) {
      return res
        .status(400)
        .json({ error: "Full Name, Role, and Email are required." });
    }

    const charset = "0123456789!_";
    let generated = "";
    for (let i = 0; i < 3; i++) {
      generated += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    const namePart = fullName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 5);
    const generatedUsername = namePart + generated;

    const generatedPassword = generateRandomPassword();
    const employeeId = await getNextEmployeeId(role);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(generatedPassword, salt);

    let profileImage = null;
    let profileImagePublicId = null;

    if (file) {
      try {
        console.log("Uploading profile image to Cloudinary...");
        const result = await uploadToCloudinary(file.buffer, {
          folder: "profile_images",
          public_id: `profile_${generatedUsername}_${Date.now()}`,
          overwrite: false,
          transformation: [{ width: 500, height: 500, crop: "limit" }],
        });
        profileImage = result.secure_url;
        profileImagePublicId = result.public_id;
        console.log("Cloudinary upload OK:", profileImage);
      } catch (imgErr) {
        console.error("Cloudinary upload failed:", imgErr);
      }
    }

    const userData = {
      ...otherDetails,
      username: generatedUsername,
      password: hashedPassword,
      email: email.toLowerCase().trim(),
      role,
      fullName: fullName.trim(),
      employeeId,
      status: "Active",
      profileImage,
      profileImagePublicId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const collection = mongoose.connection.collection("users");
    const result = await collection.insertOne(userData);
    console.log("Employee inserted:", result.insertedId);

    try {
      const actor = getActor(req);
      await createActivityLog({
        userId: actor?.userId || result.insertedId,
        username: actor?.username || generatedUsername,
        role: actor?.role || "Admin",
        action: "Create user",
        module: "Employee Management",
        description: `${role} account "${generatedUsername}" was created.`,
      });
    } catch (logErr) {
      console.error("Activity log error:", logErr);
    }

    let emailResult = { success: false, error: null };
    try {
      if (process.env.SYSTEM_EMAIL && process.env.SYSTEM_PASSWORD) {
        emailResult = await sendEmployeeAccountEmail(
          userData.email,
          generatedUsername,
          generatedPassword,
          userData.fullName,
          userData.role,
          userData.employeeId,
        );
      }
    } catch (emailErr) {
      console.error("Email error:", emailErr);
      emailResult = { success: false, error: emailErr.message };
    }

    const userResponse = { ...userData };
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "Employee account created successfully!",
      emailSent: emailResult.success || false,
      user: { ...userResponse, _id: result.insertedId },
    });
  } catch (err) {
    console.error("EMPLOYEE CREATION ERROR:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to create employee profile.",
    });
  }
});
// POST - Upload image separately
router.post(
  "/upload-image/:username",
  upload.single("profileImage"),
  async (req, res) => {
    try {
      const { username } = req.params;

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const user = await User.findOne({ username });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const previousProfileImagePublicId = user.profileImagePublicId;

      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "profile_images",
        public_id: `profile_${username}_${Date.now()}`,
        overwrite: false,
        transformation: [{ width: 500, height: 500, crop: "limit" }],
      });
      if (!result?.secure_url || !result.public_id) {
        throw new Error(
          "Cloudinary did not return a profile image URL and ID.",
        );
      }

      user.profileImage = result.secure_url;
      user.profileImagePublicId = result.public_id;
      await user.save();

      if (
        previousProfileImagePublicId &&
        previousProfileImagePublicId !== user.profileImagePublicId
      ) {
        try {
          await deleteFromCloudinary(previousProfileImagePublicId);
        } catch (error) {
          console.error("Failed to delete previous profile image:", error);
        }
      }

      await createActivityLog({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: "Upload image",
        module: "Employee Management",
        description: `${user.role} "${user.username}" uploaded a profile image.`,
      });

      res.json({
        message: "Image uploaded successfully",
        imageUrl: result.secure_url,
        publicId: result.public_id,
        user: {
          _id: user._id,
          username: user.username,
          profileImage: user.profileImage,
          profileImagePublicId: user.profileImagePublicId,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
);
// PUT - Update user with Cloudinary image upload
router.put("/:id", upload.single("profileImage"), async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updates = {};
    const { fullName, email, phoneNumber, address, role } = req.body;

    if (fullName) updates.fullName = fullName;
    if (email) updates.email = email;
    if (phoneNumber) updates.phoneNumber = phoneNumber;
    if (address) updates.address = address;
    if (role) updates.role = role;

    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: "profile_images",
          public_id: `profile_${user.username}_${Date.now()}`,
          overwrite: false,
          transformation: [{ width: 500, height: 500, crop: "limit" }],
        });
        if (!result?.secure_url || !result.public_id) {
          throw new Error(
            "Cloudinary did not return a profile image URL and ID.",
          );
        }

        updates.profileImage = result.secure_url;
        updates.profileImagePublicId = result.public_id;
      } catch (cloudinaryError) {
        return res.status(500).json({
          error: "Failed to upload image to Cloudinary",
          details: cloudinaryError.message,
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: false,
        lean: false,
      },
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found after update" });
    }

    if (
      updates.profileImagePublicId &&
      user.profileImagePublicId &&
      user.profileImagePublicId !== updates.profileImagePublicId
    ) {
      try {
        await deleteFromCloudinary(user.profileImagePublicId);
      } catch (error) {
        console.error("Failed to delete previous profile image:", error);
      }
    }

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || updatedUser.username,
      role: actor.role || "Admin",
      action: "Update user",
      module: "Employee Management",
      description: `User "${updatedUser.username}" was updated.`,
    });

    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    return res.status(200).json(userResponse);
  } catch (err) {
    return res.status(400).json({
      error: "Failed to update user details.",
      details: err.message,
    });
  }
});
//PATCH - Update user status
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const user = await User.findByIdAndUpdate(id, { status }, { new: true });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || user.username,
      role: actor.role || user.role,
      action: "Update user status",
      module: "Employee Management",
      description: `User "${user.username}" status changed to ${status}.`,
    });

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: "Status update failed" });
  }
});
//DELETE - Delete user
router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.profileImagePublicId) {
      try {
        await deleteFromCloudinary(user.profileImagePublicId);
      } catch (error) {}
    }

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || user.username,
      role: actor.role || user.role,
      action: "Delete user",
      module: "Employee Management",
      description: `User "${user.username}" was deleted.`,
    });

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});
// POST - Change password
router.post("/change-password", async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;

    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields.",
      });
    }

    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Password validation failed",
        details: validation.errors,
      });
    }

    const user = await User.findOne({ username }).maxTimeMS(5000);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Current password is incorrect.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await User.findOneAndUpdate(
      { username: username },
      { $set: { password: hashedPassword } },
      { new: true, runValidators: false },
    );

    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        error: "Failed to update password.",
      });
    }

    createActivityLog({
      userId: user._id,
      username: user.username,
      role: user.role || "User",
      action: "Change password",
      module: "Security",
      description: `${user.role || "User"} "${user.username}" changed their password.`,
    }).catch((err) => console.error("Log error:", err));

    return res.status(200).json({
      success: true,
      message: "Password updated successfully!",
      strength: validation.strength,
    });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error.",
    });
  }
});
// POST - forgot password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email address is required." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ error: "No account found with this email address." });
    }

    const newPassword = generateRandomPassword();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, password: user.password },
      { $set: { password: hashedPassword } },
      { new: true, runValidators: false },
    );

    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        error: "Failed to update password.",
      });
    }
    const mailOptions = {
      sender: {
        name: "Premiumed Enterprises",
        email: process.env.SYSTEM_EMAIL,
      },
      to: [{ email: user.email }],
      subject: "Password Reset - Premiumed Enterprises",
      htmlContent: `
          <div style=" margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif;color: #333333;">
            <div style=" max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
              <div style=" background-color: #000000; padding: 25px; text-align: center;">
                <h1 style=" margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
                  PREMIUMED ENTERPRISES
                </h1>
                <div style=" width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
              </div>

              <div style="padding: 35px;">
                <h2 style=" margin-top: 0; margin-bottom: 25px; color: #222222; font-size: 22px;">
                  Password Reset Successful.
                </h2>

                <p style="font-size: 15px; line-height: 1.6;">
                  Hello <strong>${user.fullName || user.username}<strong>,
                </p>

                <p style="font-size: 15px; line-height: 1.6;">
                  We received a request to reset your password for your Premiumed Enterprises account.
                </p>

                <div style=" margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                  <h3 style=" margin-top: 0; margin-bottom: 15px; font-size: 16px;color: #222222; ">
                    Your new temporary password:
                  </h3>
                  <p style="margin: 8px 0; font-size: 15px;">
                    <strong>Password:</strong> ${newPassword}
                  </p>
                </div>

                <div style=" margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a; ">
                  <p style=" margin: 0; font-size: 14px; line-height: 1.5; ">
                    <strong>Important:</strong> For security reasons, please log in and change your password immediately.
                  </p>
                </div>

                <p style=" font-size: 15px; line-height: 1.6;">
                  If you have any questions, please contact our system administrator immediately.
                </p>

                <p style=" font-size: 13px; color: #777777;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </div>

              <div style=" padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd; ">
                <p style="margin: 0; font-size: 13px; color: #555555;">
                  <strong>Premiumed Enterprises</strong>
                </p>

                <p style=" margin: 5px 0 0; font-size: 12px; color: #888888; ">
                  &copy; ${new Date().getFullYear()} Premiumed Enterprises
                </p>
              </div>
            </div>
          </div>
      `,
    };

    const emailResult = await sendEmailWithRetry(mailOptions);

    if (!emailResult.success) {
      const rollbackResult = await User.findOneAndUpdate(
        { _id: user._id, password: hashedPassword },
        { $set: { password: user.password } },
        { new: true, runValidators: false },
      );

      if (!rollbackResult) {
        console.error(
          `Could not restore the previous password after reset email delivery failed for user ${user._id}.`,
        );
      }

      console.error(
        "Forgot password email delivery failed:",
        emailResult.error,
      );
      return res.status(502).json({
        success: false,
        error: rollbackResult
          ? "Unable to send the reset email. Your password was not changed. Please try again later."
          : "Unable to confirm the reset email or restore your previous password. Please contact support.",
      });
    }

    createActivityLog({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: "Reset password",
      module: "Security",
      description: `${user.role} "${user.username}" had their password reset.`,
    }).catch((err) => console.error("Log error:", err));

    res.json({
      success: true,
      message: "A new password has been sent to your email address.",
      email: user.email,
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({
      error:
        "Failed to process password reset request. Please try again later.",
    });
  }
});
// POST - Verify email
router.post("/verify-email", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email address is required." });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ error: "No account found with this email address." });
    }

    res.json({
      exists: true,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify email address." });
  }
});
// PUT - Update profile image only
router.put("/:id/image", async (req, res) => {
  try {
    const { id } = req.params;
    const { profileImage, profileImagePublicId } = req.body;

    if (!profileImage) {
      return res.status(400).json({ error: "Profile image URL is required" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.profileImage = profileImage;
    if (profileImagePublicId) {
      user.profileImagePublicId = profileImagePublicId;
    }

    await user.save();

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || user.username,
      role: actor.role || user.role,
      action: "Update profile image",
      module: "Employee Management",
      description: `User "${user.username}" updated their profile image.`,
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    res.json(userResponse);
  } catch (err) {
    res.status(400).json({ error: "Failed to update profile image" });
  }
});

export default router;
