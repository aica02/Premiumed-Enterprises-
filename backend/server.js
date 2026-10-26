import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import xss from "xss";
import cors from "cors";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

import itemsRouter from "./routes/Items.js";
import putawayRoutes from "./routes/BatchRoute.js";
import userRoutes from "./routes/UserRoute.js";
import authRoutes from "./routes/LoginRoute.js";
import productsRoutes from "./routes/ProductsRoute.js";
import orderRoutes from "./routes/OrderRoute.js";
import clientRoutes from "./routes/ClientRoute.js";
import supplierRoutes from "./routes/supplierRoute.js";
import dashboardRoutes from "./routes/DashboardRoute.js";
import settingsRoutes from "./routes/SettingsRoute.js";
import adminNotificationRoutes from "./routes/adminNotificationRoute.js";
import cartRoutes from "./routes/CartRoute.js";
import LoginMobileRoutes from "./routes/LoginMobileRoutes.js";
import profileEditRoutes from "./routes/auth.js";
import activityLogRoutes from "./routes/ActivityLogRoute.js";
import warehouseMapRoutes from "./routes/WarehouseMapRoute.js";
import exportActivityLogs from "./utils/exportActivityLogs.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const pickFirst = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
};

const getNestedValue = (obj, path) => {
  if (!obj || typeof obj !== "object") return null;
  let current = obj;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return null;
    }
    current = current[key];
  }
  return current;
};

// --- Middleware ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://localhost:5173",
  "http://127.0.0.1:5173",
  "https://127.0.0.1:5173",
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return /^https:\/\/.*\.vercel\.app$/i.test(origin);
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-user-id",
      "X-User-Id",
      "x-username",
      "X-Username",
      "x-role",
      "X-Role",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const authToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (authToken) {
    try {
      const decoded = jwt.verify(
        authToken,
        process.env.JWT_SECRET || "your-secret-key",
      );
      req.user = {
        userId: decoded.userId || decoded._id || decoded.id,
        username: decoded.username,
        role: decoded.role,
      };
    } catch (error) {
      console.warn("Invalid auth token:", error.message);
    }
  }

  const body = req.body || {};
  const query = req.query || {};
  const headers = req.headers || {};

  const candidateUserId = pickFirst(
    req.user?.userId,
    headers["x-user-id"],
    headers["X-User-Id"],
    body.userId,
    body._id,
    body.user?.id,
    body.user?._id,
    query.userId,
    query.user?.id,
  );

  const candidateUsername = pickFirst(
    req.user?.username,
    headers["x-username"],
    headers["X-Username"],
    body.username,
    body.user?.username,
    query.username,
  );

  const candidateRole = pickFirst(
    req.user?.role,
    headers["x-role"],
    headers["X-Role"],
  );

  req.actor = {
    userId: candidateUserId,
    username: candidateUsername,
    role: candidateRole,
  };

  next();
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Routes that should skip XSS sanitization ---
const skipXSSRoutes = [
  '/api/usersAccessControlPage/change-password',
  '/api/usersAccessControlPage/forgot-password',
  '/api/auth/login'
];

// --- Custom XSS Sanitizer ---
app.use((req, res, next) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return next();
  }

  // Check if current route should skip XSS sanitization
  const shouldSkip = skipXSSRoutes.some(route => req.path.includes(route));
  
  if (shouldSkip) {
    return next();
  }

  const sanitizeXSS = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === "string") {
        // Skip sanitization for image URLs
        if (key === "itemImage" && obj[key].startsWith("http")) {
          continue;
        }
        obj[key] = xss(obj[key]);
      }
    }
  };

  if (req.body) sanitizeXSS(req.body);
  if (req.query) sanitizeXSS(req.query);
  next();
});

// --- Custom MongoDB Sanitizer ---
const sanitizeMongo = (obj) => {
  for (const key in obj) {
    if (key.startsWith("$") || key.includes(".")) {
      delete obj[key];
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeMongo(obj[key]);
    }
  }
};

app.use((req, res, next) => {
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return next();
  }

  // Check if current route should skip MongoDB sanitization
  const shouldSkip = skipXSSRoutes.some(route => req.path.includes(route));
  
  if (shouldSkip) {
    return next();
  }

  if (req.body) sanitizeMongo(req.body);
  if (req.query) sanitizeMongo(req.query);
  if (req.params) sanitizeMongo(req.params);
  next();
});

// --- DB Connection ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

// --- Routes ---
app.use("/api/inventoryPage", itemsRouter);
app.use("/api/putaway", putawayRoutes);
app.use("/api/usersAccessControlPage", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/notifications", adminNotificationRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/login", LoginMobileRoutes);
app.use("/api/profile", profileEditRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api/activitylogs", activityLogRoutes);
app.use("/api/warehouse-map", warehouseMapRoutes);

// Schedule daily archival of activity logs older than retention (365 days)
const scheduleDailyActivityExport = () => {
  const run = async () => {
    try {
      // explicit retentionDays=365 to ensure one-year archival
      const result = await exportActivityLogs({ retentionDays: 365 });
      if (result) console.log("Daily archival job completed.");
    } catch (err) {
      console.error("Failed daily archival job:", err);
    }
  };

  // Run once at startup then every 24 hours
  run();
  const DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(run, DAY_MS);
};

scheduleDailyActivityExport();

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});