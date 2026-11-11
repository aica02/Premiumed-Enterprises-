import { Router } from "express";
import { compare } from "bcryptjs";
import { signLoginToken } from "../utils/auth.js";
import User from "../models/User.js";
import createActivityLog from "../utils/createActivityLogs.js";

const router = Router();

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Login route
router.post("/", async (req, res) => {
  try {
    const { username, password } = req.body;
    const trimmedUsername = String(username || "").trim();

    if (!trimmedUsername || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const user = await User.findOne({
      username: {
        $regex: new RegExp(`^${escapeRegex(trimmedUsername)}$`, "i"),
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        code: "USERNAME_NOT_FOUND",
      });
    }

    const ALLOWED_ROLES = ["Staff", "Driver"];
    if (!ALLOWED_ROLES.includes(user.role)) {
      await createActivityLog({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: "Failed login",
        module: "Mobile Authentication",
        description: `Access denied for "${user.username}" (role: ${user.role}). Only Staff and Driver may log in via the mobile app.`,
      });

      return res.status(403).json({
        success: false,
        code: "ROLE_NOT_ALLOWED",
        message:
          "Access denied. This app is only for Staff and Driver accounts.",
      });
    }

    // Only a bcrypt hash match counts; a stored plain-text password is never
    // accepted.
    const isPasswordValid =
      typeof user.password === "string" &&
      /^\$2[aby]\$/.test(user.password) &&
      (await compare(String(password), user.password));

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        code: "INCORRECT_PASSWORD",
      });
    }

    // A deactivated account gets no token (the app also checks this).
    if (user.status !== "Active") {
      await createActivityLog({
        userId: user._id,
        username: user.username,
        role: user.role,
        action: "Failed login",
        module: "Mobile Authentication",
        description: `Failed login attempt for deactivated user "${user.username}".`,
      });
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_INACTIVE",
        status: user.status,
        message:
          "Your account is deactivated. Please contact an admin for information.",
      });
    }

    const token = signLoginToken(user);

    await createActivityLog({
      userId: user._id,
      username: user.username,
      role: user.role,
      action: "Login",
      module: "Mobile Authentication",
      description: `${user.role} "${user.username}" logged in through the mobile application.`,
    });

    res.json({
      success: true,
      token,
      status: user.status,
      role: user.role,
      username: user.username,
      userId: user._id,
      name: user.name || user.username,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
});

// Change password route
router.post("/change-password", async (req, res) => {
  try {
    const { userId, currentPassword, newPassword, confirmPassword } = req.body;

    if (!userId || !currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New passwords do not match",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isPasswordValid = await compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    await user.save();

    await createActivityLog({
      //logs for changing pass
      userId: user._id,
      username: user.username,
      role: user.role,
      action: "Changed password",
      module: "Account",
      description: `${user.role} "${user.username}" changed their account password.`,
    });

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
});

// The old /forgot-password and /reset-password routes were removed: they
// returned the reset token in the response, so anyone who knew a username and
// email could take over the account. Password help goes through
// /api/usersAccessControlPage/forgot-password, which emails a new password.

// Get user profile
router.get("/profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = {
      _id: user._id,
      username: user.username,
      fullName: user.fullName || user.username,
      email: user.email || "",
      position: user.position || "Warehouse Staff",
      role: user.role,
    };

    res.json({
      success: true,
      user: userData,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Update profile
router.put("/profile/:userId", async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { name, email },
      { new: true, runValidators: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
