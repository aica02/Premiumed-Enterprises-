// backend/routes/profile.js
import express from "express";
import User from "../models/User.js";
import cloudinaryConfig from '../config/cloudinary.js';
const router = express.Router();

const { cloudinary, upload, uploadToCloudinary, deleteFromCloudinary } = cloudinaryConfig;


// GET USER PROFILE
router.get("/get/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username }).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ 
      message: "Failed to get profile", 
      error: error.message 
    });
  }
});

// UPDATE USER PROFILE (combined with image upload)
router.put(
  "/update/:username",
  upload.single("profileImage"),
  async (req, res) => {
    try {
      const { username } = req.params;
      const updateData = { ...req.body };

      const user = await User.findOne({ username });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (updateData.email) {
        const existingUser = await User.findOne({ 
          email: updateData.email,
          username: { $ne: username }
        });
        // if (existingUser) {
        //   return res.status(400).json({ 
        //     message: "Email already in use" 
        //   });
        // }
      }

      if (req.file) {
        try {
          if (user.profileImagePublicId) {
            try {
              await deleteFromCloudinary(user.profileImagePublicId);
            } catch (deleteError) {
              console.error("Error deleting old image:", deleteError);
            }
          }

          const result = await uploadToCloudinary(req.file.buffer, {
            folder: "profile",
            public_id: `profile_${username}`,
            transformation: [
              { width: 500, height: 500, crop: "limit" },
              { quality: "auto" }
            ]
          });

          updateData.profileImage = result.secure_url;
          updateData.profileImagePublicId = result.public_id;
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          return res.status(500).json({ 
            message: "Failed to upload profile image", 
            error: uploadError.message 
          });
        }
      }

      delete updateData.password;

      const updatedUser = await User.findOneAndUpdate(
        { username },
        { $set: updateData },
        { new: true, runValidators: true }
      ).select("-password");

      res.status(200).json({
        message: "Profile updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Update Profile Error:", error);
      
      if (error.name === "ValidationError") {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: Object.values(error.errors).map(e => e.message)
        });
      }

      res.status(500).json({ 
        message: "Failed to update profile", 
        error: error.message 
      });
    }
  }
);

export default router;