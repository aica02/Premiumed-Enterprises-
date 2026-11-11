import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import xss from "xss";
import cors from "cors";
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
import { startPaymentAlertJob } from "./utils/paymentService.js";
import {
  assertJwtSecret,
  authenticate,
  requireApiAccess,
} from "./utils/auth.js";

dotenv.config();

// Refuse to start without a real token secret: a missing or default secret
// would let anyone forge an Admin login.
try {
  assertJwtSecret();
} catch (error) {
  console.error(`FATAL: ${error.message}`);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// --- Middleware ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://localhost:5173",
  "http://127.0.0.1:5173",
  "https://127.0.0.1:5173",
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean);

// Vite moves to the next free port (5174, 5175...) when 5173 is already in use,
// so any local dev port in that range is accepted too.
const isLocalDevOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (isLocalDevOrigin(origin)) return true;
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

// Who is calling: set from the verified login token only (req.user and
// req.actor). X-Username / X-Role headers and body names are not trusted.
app.use(authenticate);

// Express 5 re-parses req.query on every read, so changes made by the
// sanitizers below were thrown away. Parse it once and keep that object.
app.use((req, res, next) => {
  const query = req.query;
  Object.defineProperty(req, "query", {
    value: query,
    writable: true,
    configurable: true,
    enumerable: true,
  });
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

  // Every JSON route gets the MongoDB sanitizer, including the password
  // routes: they only skip the XSS filter, which would change passwords.
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
// Login required for every /api route except the public ones; roles and
// own-account checks per route are in utils/auth.js.
app.use("/api", requireApiAccess);
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

// Pay-after-delivery alerts: overdue payments and unreviewed slips (hourly).
startPaymentAlertJob();

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});