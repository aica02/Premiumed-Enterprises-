import express from 'express';
import Settings from '../models/Settings.js';
import createActivityLog from '../utils/createActivityLogs.js';
import { cloudinary, uploadToCloudinary, upload, deleteFromCloudinary } from '../config/cloudinary.js';

const router = express.Router();

router.patch('/urgency', async (req, res) => {
  try {
    const { autoPrioritize, threshold, notifySupervisor } = req.body;
    const settings = await Settings.findOneAndUpdate(
      {},
      { 
        autoPrioritize, 
        urgencyThreshold: Number(threshold),
        notifySupervisor 
      },
      { new: true, upsert: true, runValidators: true }
    );

    const actor = req.actor || {};
    await createActivityLog({
      userId: actor.userId || null,
      username: actor.username || 'Unknown',
      role: actor.role || 'Unknown',
      action: 'Update threshold',
      module: 'Settings',
      description: `Updated urgency threshold to ${Number(threshold)} day(s)`,
    });

    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/all', async (req, res) => {
  try {
    const settings = await Settings.findOneAndUpdate(
      {},
      req.body,
      { new: true, upsert: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/stock-alerts', async (req, res) => {
  try {
    const {
      stockAlertsEnabled,
      reorderNotifyOwner,
      reorderNotifySupervisor,
      reorderNotifyStaff,
      ownerNumber,
    } = req.body;

    const updates = {};
    for (const [field, value] of Object.entries({
      stockAlertsEnabled,
      reorderNotifyOwner,
      reorderNotifySupervisor,
      reorderNotifyStaff,
    })) {
      if (value !== undefined) {
        if (typeof value !== 'boolean') {
          return res.status(400).json({ message: `${field} must be a boolean` });
        }
        updates[field] = value;
      }
    }

    if (ownerNumber !== undefined) {
      if (typeof ownerNumber !== 'string' || ownerNumber.length > 30) {
        return res.status(400).json({ message: 'ownerNumber must be a string of at most 30 characters' });
      }
      updates.ownerNumber = ownerNumber.trim();
    }

    if (reorderNotifyStaff !== undefined) {
      updates.notifyStaffStock = reorderNotifyStaff;
    }

    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/accountant-email', async (req, res) => {
  try {
    const { accountantEmail } = req.body;
    
    if (!accountantEmail || !accountantEmail.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const settings = await Settings.findOneAndUpdate(
      {}, 
      { accountantEmail },
      { upsert: true, new: true }
    );

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error saving accountant email:', error);
    res.status(500).json({ error: 'Failed to save accountant email' });
  }
});

router.patch('/upload-attachment', upload.single('attachment'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user = req.actor;
    const file = req.file;

    // ── 1. Load the SINGLE settings doc (create if missing) ──
    let settings = await Settings.findOne({});
    if (!settings) settings = await Settings.create({});

    // ── 2. Delete the CURRENT file from Cloudinary ──
    if (settings.profileImage) {
      const oldPublicId = getPublicIdFromUrl(settings.profileImage);
      console.log('Attempting to delete:', oldPublicId);

      if (oldPublicId) {
        let deleted = false;
        for (const rt of ['image', 'raw', 'video']) {
          try {
            const delRes = await deleteFromCloudinary(oldPublicId, { resource_type: rt });
            console.log(`Delete [${rt}]:`, delRes);
            if (delRes?.result === 'ok') {
              deleted = true;
              console.log(`✅ Deleted with resource_type: ${rt}`);
              break;
            }
          } catch (err) {
            console.log(`❌ [${rt}] failed:`, err.message);
          }
        }
        if (!deleted) console.warn('⚠️ Could not delete old file:', oldPublicId);
      }
    }

    // ── 3. Unique public_id so filename changes every upload ──
    const originalName = file.originalname.replace(/\.[^/.]+$/, '');
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const uniquePublicId = `${sanitizedName}-${Date.now()}`;

    // ── 4. Upload new file ──
    const result = await uploadToCloudinary(file.buffer, {
      folder: 'settings',
      public_id: uniquePublicId,
      overwrite: false,
      invalidate: true,
      resource_type: 'auto'
    });

    const fullPublicId = `settings/${uniquePublicId}`;

    // ── 5. Update THE SAME document by _id ──
    const updatedSettings = await Settings.findByIdAndUpdate(
      settings._id,
      {
        profileImage: result.secure_url,
        profileImagePublicId: fullPublicId
      },
      { new: true }
    );

    await createActivityLog({
      userId: user?._id || null,
      username: user?.username || 'Unknown',
      role: user?.role || 'Admin',
      action: "Upload document",
      module: "Settings",
      description: `${user?.role || 'Admin'} "${user?.username || 'Unknown'}" ${
        settings.profileImage ? 'overwrote' : 'uploaded'
      } a document.`,
    });

    res.json({
      success: true,
      message: settings.profileImage
        ? 'Document overwritten successfully'
        : 'Document uploaded successfully',
      settings: {
        profileImage: updatedSettings.profileImage,
        profileImagePublicId: updatedSettings.profileImagePublicId
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to upload document: ' + error.message
    });
  }
});

function getPublicIdFromUrl(url) {
  if (!url) return null;
  const parts = url.split('/upload/');
  if (parts.length < 2) return null;
  let path = parts[1].replace(/^v\d+\//, '');
  path = path.replace(/\.[^/.]+$/, '');
  return path;
}

export default router;