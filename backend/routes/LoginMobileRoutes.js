import { Router } from "express";
import bcrypt from "bcrypt";
import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
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
        message: "Invalid username or password",
      });
    }

    const isPasswordValid =
      (await compare(password, user.password)) ||
      (typeof user.password === "string" && user.password === password) ||
      (await bcrypt.compare(password, user.password));

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" },
    );

    await createActivityLog({
      //logs for login mobile
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

// Forgot password route
router.post("/forgot-password", async (req, res) => {
  try {
    const { username, email } = req.body;

    const user = await User.findOne({
      username: username,
      email: email,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "1h" },
    );

    res.json({
      success: true,
      message: "Password reset link sent to your email",
      resetToken: resetToken,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Reset password route
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    );

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedPassword = await hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

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
