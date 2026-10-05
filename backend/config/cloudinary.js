
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, and PNG files are allowed'), false);
    }
  }
});

const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: options.folder || 'uploads',
      public_id: options.public_id,
      overwrite: options.overwrite !== undefined ? options.overwrite : true,
      invalidate: options.invalidate !== undefined ? options.invalidate : true,
      resource_type: options.resource_type || 'auto',
      transformation: options.transformation || [],
    };

    Object.keys(uploadOptions).forEach(key => {
      if (uploadOptions[key] === undefined) {
        delete uploadOptions[key];
      }
    });

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('Cloudinary upload success:', result.secure_url);
          resolve(result);
        }
      }
    );
    
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

const deleteFromCloudinary = async (publicId, options = {}) => {
  try {
    if (!publicId) {
      throw new Error('Public ID is required');
    }

    const resourceType = options.resource_type || 'image';
    
    console.log(`Deleting from Cloudinary: ${publicId} (type: ${resourceType})`);

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: options.invalidate !== undefined ? options.invalidate : true,
      ...options
    });

    if (result.result === 'ok') {
      console.log(`Successfully deleted: ${publicId}`);
      return result;
    } else if (result.result === 'not found') {
      console.log(`File not found: ${publicId}`);
      return result;
    } else {
      console.warn(`Delete result: ${result.result}`, result);
      return result;
    }
  } catch (error) {
    console.error(`Error deleting from Cloudinary: ${publicId}`, error);
    throw error;
  }
};

const getResourceTypeFromUrl = (url) => {
  if (!url) return 'image';
  
  // Check the file extension
  const extension = url.split('.').pop()?.toLowerCase();
  if (extension) {
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(extension)) {
      return 'image';
    }
    if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(extension)) {
      return 'video';
    }
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(extension)) {
      return 'raw';
    }
  }
  
  return 'image'; 
};

export { 
  cloudinary, 
  upload, 
  uploadToCloudinary,
  deleteFromCloudinary
};

export default { 
  cloudinary, 
  upload, 
  uploadToCloudinary,
  deleteFromCloudinary
};