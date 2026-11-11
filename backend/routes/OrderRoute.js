import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Batch from "../models/Batch.js";
import Notification from "../models/NotificationClient.js";
import Counter from "../models/Counter.js";
import User from "../models/User.js";
import createActivityLog from "../utils/createActivityLogs.js";
import Settings from "../models/Settings.js";
import {
  canClientSee,
  isStaffRequest,
  normalizeUsername,
  resolveClientUsername,
  RESERVED_SUPPLY_MESSAGE,
} from "../utils/productAccess.js";
import {
  sendEmailWithRetry,
  sendOrderReceipt,
  sendDepositSlipToAccountant,
  sendOrderStatusUpdate,
} from "../utils/emailService.js";
import {
  checkBatchById,
  checkProductStock,
} from "../utils/inventoryAlertService.js";
import {
  computePaymentDueDate,
  findOverdueOrdersForClient,
  notifyOrderPlacedWhileOverdue,
} from "../utils/paymentService.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

// DR (delivery receipt) photos from the driver app. Kept in memory and sent
// to Cloudinary, because the server's /uploads folder is wiped on redeploy.
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (["image/jpeg", "image/jpg", "image/png"].includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("The DR photo must be a JPG or PNG image."));
    }
  },
});

// Ordering while overdue is allowed; this only adds the client and admin
// notifications, and never fails the checkout.
const flagOrderPlacedWhileOverdue = (details) => {
  notifyOrderPlacedWhileOverdue(details).catch((err) =>
    console.error("[PaymentAlert] Order-with-overdue notice failed:", err),
  );
};

// A DR photo must be a link returned by the delivery-receipt upload (a
// Cloudinary image), not arbitrary text.
const isValidReceiptUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return (
      url.protocol === "https:" &&
      (url.hostname === "res.cloudinary.com" ||
        url.hostname.endsWith(".cloudinary.com"))
    );
  } catch {
    return false;
  }
};

const router = express.Router();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  // Files in /uploads are served publicly, so the stored name never keeps
  // the uploader's file name or extension (an .html "slip" would run as a
  // page on the API's domain).
  filename: function (req, file, cb) {
    const ext = SLIP_TYPES[file.mimetype] || "";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

// Payment slips: photos or PDF scans only, up to 10 MB.
const SLIP_TYPES = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (SLIP_TYPES[file.mimetype]) {
      callback(null, true);
    } else {
      callback(new Error("The payment slip must be a JPG, PNG or PDF file."));
    }
  },
});

const getActor = (req) => ({
  userId: req.actor?.userId || null,
  username: req.actor?.username || "Unknown",
  role: req.actor?.role || "Unknown",
});

// Returns an error message if any item is reserved for a client other than
// the one the order is filed under, or null if every item may be ordered.
// A verified client login must also be allowed, so a client cannot order
// under another center's name. Staff logins ordering on a client's behalf
// are checked only against that client.
const findReservedOrderItem = async (req, username, items) => {
  const orderingAs = [normalizeUsername(username)];
  if (req.user?.username && !isStaffRequest(req)) {
    orderingAs.push(resolveClientUsername(req));
  }
  for (const item of items) {
    const product = await findProductForOrderItem(item.itemCode);
    if (product && !orderingAs.every((u) => canClientSee(product, u))) {
      return `${product.name}: ${RESERVED_SUPPLY_MESSAGE}`;
    }
  }
  return null;
};

const findProductForOrderItem = async (itemCode) => {
  if (!itemCode || typeof itemCode === "object") return null;
  const code = String(itemCode);

  const productByCode = await Product.findOne({ itemCode: code });
  if (productByCode) return productByCode;

  if (mongoose.isValidObjectId(code)) {
    return Product.findById(code);
  }

  return null;
};

const MAX_ORDER_QUANTITY = 1000000;
const roundMoney = (value) => Math.round(value * 100) / 100;

// Builds the order lines from the supply records, not from the browser.
// Price, name, category, unit and image come from the product; only the
// quantity and piece/box choice come from the client. Quantities are in
// pieces, as the cart sends them. Returns { items } or { error }.
const priceOrderItems = async (rawItems) => {
  const items = [];
  for (const raw of rawItems) {
    const product =
      (await findProductForOrderItem(raw?.itemCode)) ||
      (await findProductForOrderItem(raw?.productId));
    const label = String(raw?.name || raw?.itemCode || "An item");

    if (!product) {
      return { error: `${label} is no longer available. Please remove it from your cart.` };
    }

    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) {
      return {
        error: `${product.name} is not available for ordering right now. Please remove it from your cart.`,
      };
    }

    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ORDER_QUANTITY) {
      return { error: `${product.name}: the quantity must be a whole number above 0.` };
    }

    const quantityPerBox = Number(product.quantityPerBox) || 0;
    const orderMode = raw?.orderMode === "box" && quantityPerBox > 0 ? "box" : "piece";
    const boxes =
      orderMode === "box" ? Math.round((quantity / quantityPerBox) * 100) / 100 : 0;

    items.push({
      productId: String(product._id),
      itemCode: product.itemCode || String(product._id),
      name: product.name,
      category: product.category || "Medical Supply",
      unitType:
        normalizeUnitType(product.unitType) ||
        normalizeUnitType(raw?.unitType) ||
        "Piece",
      quantity,
      price,
      image: product.itemImage || "",
      orderMode,
      boxes,
      quantityPerBox,
      // Only used by the split checkout: how many pieces ship now.
      deliveredQty: raw?.deliveredQty,
    });
  }
  return { items };
};

const orderLineTotal = (list) =>
  roundMoney(list.reduce((sum, item) => sum + item.price * item.quantity, 0));

const normalizeUnitType = (unitType) => {
  const value = String(unitType || "").trim();
  return ["", "-", "n/a", "na"].includes(value.toLowerCase()) ? "" : value;
};

const addUnitTypesToOrders = async (orders) => {
  const orderData = orders.map((order) => order.toObject());
  const itemIdentifiers = [
    ...new Set(
      orderData
        .flatMap((order) =>
          order.items.flatMap((item) => [item.itemCode, item.productId]),
        )
        .filter(Boolean)
        .map(String),
    ),
  ];
  const productIds = itemIdentifiers.filter((id) =>
    mongoose.isValidObjectId(id),
  );

  if (itemIdentifiers.length === 0) return orderData;

  const products = await Product.find({
    $or: [{ itemCode: { $in: itemIdentifiers } }, { _id: { $in: productIds } }],
  })
    .select("itemCode unitType")
    .lean();

  const unitTypesByIdentifier = new Map();
  products.forEach((product) => {
    const unitType = normalizeUnitType(product.unitType);
    if (product.itemCode) {
      unitTypesByIdentifier.set(String(product.itemCode), unitType);
    }
    unitTypesByIdentifier.set(String(product._id), unitType);
  });

  const batches = await Batch.find({ itemCode: { $in: itemIdentifiers } })
    .select("itemCode unitType")
    .sort({ createdAt: -1 })
    .lean();
  const batchUnitTypesByItemCode = new Map();
  batches.forEach((batch) => {
    const unitType = normalizeUnitType(batch.unitType);
    const itemCode = String(batch.itemCode);
    if (unitType && !batchUnitTypesByItemCode.has(itemCode)) {
      batchUnitTypesByItemCode.set(itemCode, unitType);
    }
  });

  return orderData.map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      unitType:
        normalizeUnitType(item.unitType) ||
        unitTypesByIdentifier.get(String(item.itemCode)) ||
        unitTypesByIdentifier.get(String(item.productId)) ||
        batchUnitTypesByItemCode.get(String(item.itemCode)) ||
        "N/A",
    })),
  }));
};

// GET /reset-counters was removed: it deleted every counter (order and
// employee ID sequences) for anyone who opened the link, after which new
// employee IDs collided with existing ones.

// The name shown as "Delivered By": the driver's full name from their
// account, falling back to the username when no account is found.
const getDriverDisplayName = async (actor) => {
  const username =
    actor?.username && actor.username !== "Unknown" ? actor.username : "";
  const lookup = actor?.userId
    ? { _id: actor.userId }
    : username
      ? { username }
      : null;
  if (!lookup) return "";

  try {
    const driver = await User.findOne(lookup).select("fullName").lean();
    return driver?.fullName?.trim() || username;
  } catch (err) {
    console.error("Failed to look up driver name:", err);
    return username;
  }
};

const getClientNotificationNameFilter = async (username) => {
  const rawUsername = String(username || "").trim();
  if (!rawUsername) return null;

  const client = await User.findOne({ username: rawUsername })
    .select("fullName")
    .lean();
  const names = [rawUsername, client?.fullName].filter(Boolean);
  const namePatterns = names.map((name) => {
    const flexibleName = name
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "")
      .split("")
      .join("\\s*");
    return new RegExp(`^\\s*${flexibleName}\\s*$`, "i");
  });

  return { name: { $in: namePatterns } };
};

router.get("/notifications/:name", async (req, res) => {
  try {
    const nameFilter = await getClientNotificationNameFilter(req.params.name);
    if (!nameFilter) {
      return res.status(400).json({ message: "Client username is required" });
    }

    const notifications = await Notification.find({
      ...nameFilter,
    })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/notifications/read/:name", async (req, res) => {
  try {
    const nameFilter = await getClientNotificationNameFilter(req.params.name);
    if (!nameFilter) {
      return res.status(400).json({ message: "Client username is required" });
    }

    await Notification.updateMany(
      { ...nameFilter, isRead: false },
      { $set: { isRead: true } },
    );
    res.json({ message: "Notifications marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/notifications/read/:name/:id", async (req, res) => {
  try {
    const nameFilter = await getClientNotificationNameFilter(req.params.name);
    if (!nameFilter) {
      return res.status(400).json({ message: "Client username is required" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...nameFilter },
      { $set: { isRead: true } },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Notification marked as read", notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const getNextOrderId = async (userIdentifier) => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = now.getFullYear();
  const dateStr = `${mm}${dd}${yyyy}`;

  const cleanUser = String(userIdentifier)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  const counterId = `order_seq_${cleanUser}_${dateStr}`;
  const randomString = (length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  const counter = await Counter.findOneAndUpdate(
    { id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );

  const incrementedPart = String(counter.seq).padStart(2, "0");

  const newOrderId = `Order${incrementedPart}-${dateStr}-${randomString(4)}`;

  return newOrderId;
};

// Decides which client an order belongs to. The verified login token is the
// only source: admin and client sessions share browser storage, so the
// username the browser sends can belong to a different account than the
// one that filled the cart (an order once went out under the admin
// "Angelo Manlapig"). A browser username that disagrees with the token is
// refused instead of guessed, and only client (role "User") accounts may
// order. The order name always comes from the client's own account.
const resolveCheckoutClient = async (req) => {
  if (!req.user?.username || !mongoose.isValidObjectId(req.user.userId)) {
    return {
      status: 401,
      error: "Your session has expired. Please log in again to place your order.",
    };
  }

  const tokenUsername = normalizeUsername(req.user.username);
  const sentUsernames = [req.headers["x-username"], req.body?.username]
    .map(normalizeUsername)
    .filter(Boolean);
  if (sentUsernames.some((sent) => sent !== tokenUsername)) {
    return {
      status: 409,
      error:
        "This browser is now signed in to a different account. Please reload the page and log in again with the account you want to order from.",
    };
  }

  const client = await User.findOne({ _id: req.user.userId })
    .select("username fullName role status")
    .lean();
  if (
    !client ||
    normalizeUsername(client.username) !== tokenUsername ||
    client.role !== "User" ||
    req.user.role !== "User"
  ) {
    return {
      status: 403,
      error:
        "Only client accounts can place orders. Please log in with your client account.",
    };
  }
  if (client.status !== "Active") {
    return {
      status: 403,
      error: "Your account is deactivated. Please contact an admin for information.",
    };
  }

  return { username: client.username, name: client.fullName?.trim() || "" };
};

//checkout
router.post("/", async (req, res) => {
  const {
    name: submittedName,
    items,
    notes,
    requestedDeliveryDate,
  } = req.body;
  const shippingAddress =
    typeof req.body?.shippingAddress === "string" ? req.body.shippingAddress : "";

  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "No items to order." });
    }

    const checkoutClient = await resolveCheckoutClient(req);
    if (checkoutClient.error) {
      return res
        .status(checkoutClient.status)
        .json({ success: false, message: checkoutClient.error });
    }
    const { username } = checkoutClient;
    const name = checkoutClient.name || submittedName;

    // Check every item before anything is saved, so a rejected order leaves
    // no order, counter increment or notification behind.
    const reservedMessage = await findReservedOrderItem(req, username, items);
    if (reservedMessage) {
      return res.status(403).json({ success: false, message: reservedMessage });
    }

    // Prices and totals are computed here from the supply records. The
    // browser's price, subtotal and total are ignored: a client could set
    // them to anything.
    const priced = await priceOrderItems(items);
    if (priced.error) {
      return res.status(400).json({ success: false, message: priced.error });
    }
    const transformedItems = priced.items.map(({ deliveredQty, ...item }) => item);

    const newOrderId = await getNextOrderId(username);

    const calculatedSubtotal = orderLineTotal(transformedItems);
    const calculatedTotal = calculatedSubtotal;

    const order = new Order({
      orderId: newOrderId,
      name,
      username: username,
      items: transformedItems,
      role: "User",
      status: "PENDING",
      subtotal: calculatedSubtotal,
      total: calculatedTotal,
      shippingAddress,
      paymentStatus: "PENDING",
      requestedDeliveryDate,
      notes,
    });

    const newOrder = await order.save();

    await Notification.create({
      name: name,
      orderId: newOrder.orderId,
      message: `Your Order #${newOrder.orderId} has been placed successfully.`,
    });

    flagOrderPlacedWhileOverdue({
      username,
      name,
      orderId: newOrder.orderId,
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order: newOrder,
    });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(400).json({
      success: false,
      message: "Database Error: " + err.message,
    });
  }
});

//remove supply sa cart pag checkout
router.delete("/remove-items", async (req, res) => {
  try {
    const { username, itemCodes } = req.body;

    if (
      !username ||
      !itemCodes ||
      !Array.isArray(itemCodes) ||
      itemCodes.length === 0
    ) {
      return res.status(400).json({
        message: "Username and itemCodes array are required",
      });
    }

    const cart = await Cart.findOne({ username });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    cart.items = cart.items.filter(
      (item) => !itemCodes.includes(item.itemCode),
    );

    cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    await cart.save();

    res.status(200).json({
      message: "Items removed from cart successfully",
      cart: cart,
    });
  } catch (error) {
    console.error("Error removing items from cart:", error);
    res.status(500).json({
      message: "Failed to remove items from cart",
      error: error.message,
    });
  }
});

router.patch("/:orderId/approve", async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      { status: "APPROVED" },
      { new: true },
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    await Notification.create({
      name: order.name,
      orderId: order.orderId,
      message: `Your Order #${order.orderId} is now APPROVED and ready for picking.`,
    });

    res.json({ message: "Order approved for picking", order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/pick-item", async (req, res) => {
  const { orderId, itemCode, scannedQty } = req.body;
  try {
    const product = await Product.findOne({ itemCode });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const batches = await Batch.find({
      itemCode: product.itemCode,
      quantity: { $gt: 0 },
      status: "stored",
      expirationDate: { $gt: new Date() },
    }).sort({ expirationDate: 1 });

    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < scannedQty) {
      return res
        .status(400)
        .json({ message: "Insufficient unexpired stock in batches" });
    }

    let remaining = scannedQty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      batch.quantity -= take;
      remaining -= take;
      await batch.save();
    }

    await Product.findByIdAndUpdate(product._id, {
      $inc: { totalQuantity: -scannedQty },
    });

    //  NEW: trigger SMS/alert check after picking
    checkProductStock(product.itemCode).catch((err) =>
      console.error("[Hook] pick-item checkProductStock failed:", err),
    );

    res.json({ message: "Item picked successfully via FEFO (Unexpired Only)" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const removeUploadedFile = (file) => {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch (cleanupError) {
    console.error("Error cleaning up file:", cleanupError);
  }
};

router.post(
  "/upload-slip",
  (req, res, next) => {
    upload.single("orderSlip")(req, res, (error) => {
      if (error) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? "The payment slip must be 10 MB or smaller."
            : error.message;
        return res.status(400).json({ success: false, message });
      }
      next();
    });
  },
  async (req, res) => {
  try {
    const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : "";

    if (!orderId || !req.file) {
      removeUploadedFile(req.file);
      return res
        .status(400)
        .json({ message: "Order ID and slip file are required" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      removeUploadedFile(req.file);
      return res.status(404).json({ message: "Order not found" });
    }

    // A client may only send a slip for their own order.
    if (
      req.user?.role === "User" &&
      String(order.username || "").trim() !== String(req.user.username).trim()
    ) {
      removeUploadedFile(req.file);
      return res
        .status(403)
        .json({ message: "You can only send a payment slip for your own order." });
    }

    if (order.paymentStatus === "COMPLETED") {
      removeUploadedFile(req.file);
      return res
        .status(400)
        .json({ message: "Payment for this order has already been accepted." });
    }

// Pay-after-delivery: a slip only changes the payment status. The order
// keeps its delivery status (TO SHIP or DELIVERED), so the driver still
// sees it and a delivered order stays delivered.
const slipPath = `/uploads/${req.file.filename}`;
order.paymentSlip = slipPath;
order.paymentStatus = "AWAITING REVIEW";
order.paymentRejectedAt = undefined;
order.paymentAcceptedAt = undefined;
order.paymentAcceptedBy = undefined;
order.slipSubmittedAt = new Date();
order.slipReminderSentAt = null;
await order.save();
    const settings = await Settings.findOne();
    const accountantEmail = settings?.accountantEmail;

    let emailSent = false;
    let emailError = null;

    if (accountantEmail) {
      try {
        const fileBuffer = fs.readFileSync(req.file.path);

        const slipClient = order.username
          ? await User.findOne({ username: order.username })
              .select("procurementMobile phoneNumber")
              .lean()
          : null;
        const emailResult = await sendDepositSlipToAccountant(
          {
            ...order.toObject(),
            procurementMobile:
              slipClient?.procurementMobile || slipClient?.phoneNumber || "",
          },
          fileBuffer,
          req.file.originalname,
          accountantEmail,
        );

        if (emailResult.success) {
          emailSent = true;
          console.log(
            `Payment slip email sent to accountant: ${accountantEmail}`,
          );
          order.notes = order.notes
  ? `${order.notes} | Payment slip submitted — awaiting accountant review.`
  : "Payment slip submitted — awaiting accountant review.";
          await order.save();
        } else {
          emailError = emailResult.error;
          console.error("Failed to send email to accountant:", emailError);
        }
      } catch (emailError) {
        console.error("Error sending email to accountant:", emailError);
        emailError = emailError.message;
      }
    } else {
      console.warn("Accountant email not configured in settings");
    }

    const actor = getActor(req);
    const clientName =
      actor.username && actor.username !== "Unknown"
        ? actor.username
        : order.username || order.name;
    await createActivityLog({
      userId: actor.userId,
      username: clientName,
      role: actor.role !== "Unknown" ? actor.role : "Client",
      action: "Submit payment slip",
      module: "Order",
      description: `Client "${clientName}" submitted a payment slip for order ${order.orderId}.${emailSent ? " Email sent to accountant." : " No email sent."}`,
    });

    // try {
    //   fs.unlinkSync(req.file.path);
    // } catch (cleanupError) {
    //   console.error("Error cleaning up file:", cleanupError);
    // }

    res.json({
      success: true,
      message: `Slip uploaded successfully.${emailSent ? " Payment slip sent to accountant." : ""}`,
      order,
      emailSent,
      emailError: emailError,
    });
  } catch (error) {
    console.error("Slip upload error:", error);

    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload slip",
    });
  }
  },
);

// Uploads the driver's DR photo and returns its link. It does not mark the
// order delivered; the app sends the link with the DELIVERED status next.
router.post(
  "/:orderId/delivery-receipt",
  (req, res, next) => {
    receiptUpload.single("receipt")(req, res, (error) => {
      if (error) {
        return res.status(400).json({ message: error.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No DR photo was received." });
      }

      const order = await Order.findOne({ orderId: req.params.orderId })
        .select("orderId status")
        .lean();
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (order.status !== "TO SHIP") {
        return res.status(400).json({
          message: `Only TO SHIP orders take a DR photo. Order ${order.orderId} is ${order.status}.`,
        });
      }

      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "delivery-receipts",
        resource_type: "image",
        public_id: `dr-${String(order.orderId).replace(/[^a-zA-Z0-9-]/g, "-")}-${Date.now()}`,
      });

      res.json({ success: true, url: result.secure_url });
    } catch (error) {
      console.error("DR photo upload error:", error);
      res.status(500).json({
        message: "The DR photo could not be uploaded. Please try again.",
      });
    }
  },
);

const getClientEmail = async (username) => {
  try {
    if (!username) {
      console.warn("No username provided to getClientEmail");
      return null;
    }

    const user = await User.findOne({ username });

    if (user) {
      return user?.email || null;
    } else {
      console.warn(`No user found for username: ${username}`);
      return null;
    }
  } catch (error) {
    console.error("Error fetching client email:", error);
    return null;
  }
};

// Approve in admin with email notifications
router.patch("/:orderId/status", async (req, res) => {
  const { status } = req.body;

  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const validStatuses = [
      "PENDING",
      "APPROVED",
      "TO SHIP",
      "RETURNED",
      "DELIVERED",
      "PARTIAL",
      "CANCELLED",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Which status each role may set. Admin may set any. A client may only
    // answer a proposed new delivery date on their own RETURNED order.
    const role = req.user?.role;
    if (role === "User") {
      const ownsOrder =
        String(order.username || "").trim() === String(req.user.username).trim();
      if (!ownsOrder) {
        return res
          .status(403)
          .json({ message: "You can only update your own orders." });
      }
      if (order.status !== "RETURNED" || !["PENDING", "CANCELLED"].includes(status)) {
        return res.status(403).json({
          message: "You can only approve or decline a new delivery date.",
        });
      }
    } else if (role !== "Admin") {
      const allowedByRole = {
        Staff: ["APPROVED", "TO SHIP"],
        Driver: ["DELIVERED"],
      };
      if (!(allowedByRole[role] || []).includes(status)) {
        return res.status(403).json({
          message: `Your account cannot set orders to ${status}.`,
        });
      }
    }

    // Delivered and cancelled orders are final. Re-opening them skipped the
    // stock and payment rules (DELIVERED repeats are handled below).
    if (
      (order.status === "CANCELLED" ||
        (order.status === "DELIVERED" && status !== "DELIVERED")) &&
      order.status !== status
    ) {
      return res.status(400).json({
        message: `Order ${order.orderId} is ${order.status} and can no longer be changed.`,
      });
    }

    const actor = getActor(req);

    // Handle RETURNED -> PENDING (Client approves new delivery date)
    if (order.status === "RETURNED" && status === "PENDING") {
      order.status = "PENDING";

      const approvalNote = `Client approved the new delivery date on ${new Date().toISOString().split("T")[0]}`;
      order.notes = order.notes
        ? `${order.notes} | ${approvalNote}`
        : approvalNote;

      await order.save();

      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Approve order date",
        module: "Order",
        description: `Order ${order.orderId} delivery date was approved by ${actor.username || order.name}.`,
      });

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Client has APPROVED the new delivery date for Order #${order.orderId}. New Date: ${order.newDate || order.requestedDeliveryDate}`,
      });

      return res.json({
        success: true,
        message: "Client approved the new delivery date",
        order,
      });
    }

    // Handle RETURNED -> CANCELLED
    if (order.status === "RETURNED" && status === "CANCELLED") {
      order.status = "CANCELLED";
      order.cancelledDate = new Date();

      await order.save();

      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Cancel order",
        module: "Order",
        description: `Order ${order.orderId} was cancelled by ${actor.username || order.name}.`,
      });

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Order #${order.orderId} has been cancelled by the client.`,
      });

      return res.json({
        success: true,
        message: "Order cancelled by client",
        order,
      });
    }

    // Handle PENDING -> APPROVED with stock check
    if (order.status === "PENDING" && status === "APPROVED") {
      let insufficientItems = [];
      let canFullyDeliver = true;

      for (const item of order.items) {
        const product = await findProductForOrderItem(item.itemCode);
        const itemCode = product?.itemCode || item.itemCode;
        const batches = await Batch.find({
          itemCode,
          quantity: { $gt: 0 },
          status: "stored",
          expirationDate: { $gt: new Date() },
        }).sort({ expirationDate: 1 });

        const totalAvailable = batches.reduce(
          (sum, batch) => sum + Number(batch.quantity || 0),
          0,
        );

        if (totalAvailable < item.quantity) {
          insufficientItems.push({
            productName: product?.name || item.name || "Unknown Product",
            itemCode,
            requested: Number(item.quantity),
            available: totalAvailable,
            shortfall: Number(item.quantity) - totalAvailable,
            batches: batches.map((b) => ({
              batchId: b._id,
              batchNumber: b.batchNumber,
              available: b.quantity,
              expirationDate: b.expirationDate,
            })),
          });
          canFullyDeliver = false;
        }
      }

      if (!canFullyDeliver) {
        return res.status(409).json({
          success: false,
          type: "INSUFFICIENT_STOCK",
          message: "Insufficient stock. Partial delivery is recommended.",
          insufficientItems,
          order,
        });
      }

      order.status = "APPROVED";
      await order.save();

      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Approve order",
        module: "Order",
        description: `Order ${order.orderId} was approved by ${actor.username}.`,
      });

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Order #${order.orderId} has been APPROVED for processing.`,
      });

      try {
        const clientEmail = await getClientEmail(order.username);
        if (clientEmail) {
          await sendOrderStatusUpdate(order, clientEmail, "APPROVED");
        }
      } catch (emailError) {
        console.error("Failed to send approval email:", emailError);
      }

      return res.json({
        success: true,
        message: "Order approved successfully",
        order,
      });
    }

    // Handle DELIVERED — the driver must attach the DR (delivery receipt)
    // photo, and payment becomes due 30 days after delivery.
    if (status === "DELIVERED") {
      const { deliveryReceipt } = req.body;

      // A retried request (for example a delivery that synced after the
      // driver reconnected) succeeds without changing anything.
      if (order.status === "DELIVERED") {
        return res.json({
          success: true,
          message: "Order was already marked as delivered",
          order,
        });
      }

      if (order.status !== "TO SHIP") {
        return res.status(400).json({
          message: `Only TO SHIP orders can be marked as delivered. Order ${order.orderId} is ${order.status}.`,
        });
      }

      if (!isValidReceiptUrl(deliveryReceipt)) {
        return res.status(400).json({
          message:
            "A delivery receipt (DR) photo is required to mark this order as delivered.",
        });
      }

      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Deliver order",
        module: "Delivery",
        description: `Order ${order.orderId} was marked as delivered with a DR photo.`,
      });

      const deliveredAt = new Date();
      order.status = "DELIVERED";
      order.deliveredDate = deliveredAt;
      order.deliveryReceipt = String(deliveryReceipt);
      order.deliveredBy = await getDriverDisplayName(actor);
      order.paymentDueDate = computePaymentDueDate(deliveredAt);
      await order.save();

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message:
          order.paymentStatus === "COMPLETED"
            ? `Order #${order.orderId} status is now DELIVERED.`
            : `Order #${order.orderId} status is now DELIVERED. Payment is due by ${order.paymentDueDate.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" })}.`,
      });

      // SEND EMAIL FOR DELIVERED
      try {
        const clientEmail = await getClientEmail(order.username);
        if (clientEmail) {
          await sendOrderStatusUpdate(order, clientEmail, "DELIVERED");
          console.log(`Delivery email sent to ${clientEmail}`);
        }
      } catch (emailError) {
        console.error("Failed to send delivery email:", emailError);
      }

      return res.json({
        success: true,
        message: "Status updated successfully",
        order,
      });
    }

    // Handle TO SHIP (existing logic with accountant email)
// Handle TO SHIP (only via accept or explicit admin override)
if (status === "TO SHIP") {
  if (!["PAYMENT REVIEW", "APPROVED", "PARTIAL"].includes(order.status)) {
    return res.status(400).json({
      message: `Cannot move order to TO SHIP from status ${order.status}.`,
    });
  }

  // Pay-after-delivery: shipping no longer depends on payment, so this
  // leaves the payment status as it is.
  order.status = "TO SHIP";
  order.shippedDate = new Date();
  await order.save();

  await createActivityLog({
    userId: actor.userId,
    username: actor.username,
    role: actor.role,
    action: "Ship order",
    module: "Order",
    description: `Order ${order.orderId} moved to TO SHIP by ${actor.username}.`,
  });

  await Notification.create({
    name: order.name,
    orderId: order.orderId,
    message: `Order #${order.orderId} is now TO SHIP.`,
  });

  return res.json({
    success: true,
    message: "Order moved to shipping",
    order,
  });
}

    // Handle RETURNED
    if (status === "RETURNED") {
      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Return order",
        module: "Order",
        description: `Order ${order.orderId} was marked as returned.`,
      });

      order.status = "RETURNED";
      await order.save();

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Order #${order.orderId} status is now RETURNED.`,
      });

      // SEND EMAIL FOR RETURNED - WITH BETTER DEBUGGING
      try {
        console.log(
          `Attempting to send RETURNED email for order: ${order.orderId}`,
        );
        console.log(`Order username: ${order.username}`);
        console.log(`Order name: ${order.name}`);

        const clientEmail = await getClientEmail(order.username);
        console.log(`Client email retrieved: ${clientEmail || "NULL"}`);

        if (clientEmail) {
          console.log(`Sending RETURNED email to: ${clientEmail}`);
          const result = await sendOrderStatusUpdate(
            order,
            clientEmail,
            "RETURNED",
          );
          console.log(`Email send result:`, result);
          if (result.success) {
            console.log(`Return email sent successfully to ${clientEmail}`);
          } else {
            console.error(`Failed to send return email:`, result.error);
          }
        } else {
          console.warn(
            `No client email found for order ${order.orderId}. Username: ${order.username}`,
          );

          // Try to find user by name as fallback
          if (order.name) {
            console.log(`Trying to find user by name: ${order.name}`);
            const userByName = await User.findOne({ fullName: order.name });
            if (userByName && userByName.email) {
              console.log(
                `Found user by name: ${userByName.username}, Email: ${userByName.email}`,
              );
              await sendOrderStatusUpdate(order, userByName.email, "RETURNED");
            }
          }
        }
      } catch (emailError) {
        console.error("Failed to send return email:", emailError);
        console.error("Error details:", emailError.stack);
      }

      return res.json({
        success: true,
        message: "Status updated successfully",
        order,
      });
    }

    // Handle PARTIAL
    if (status === "PARTIAL") {
      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Partial delivery",
        module: "Order",
        description: `Order ${order.orderId} was marked as partially delivered.`,
      });

      order.status = "PARTIAL";
      await order.save();

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Order #${order.orderId} status is now PARTIAL.`,
      });

      // SEND EMAIL FOR PARTIAL - WITH BETTER DEBUGGING
      try {
        console.log(
          `Attempting to send PARTIAL email for order: ${order.orderId}`,
        );
        console.log(`Order username: ${order.username}`);
        console.log(`Order name: ${order.name}`);

        const clientEmail = await getClientEmail(order.username);
        console.log(`Client email retrieved: ${clientEmail || "NULL"}`);

        if (clientEmail) {
          console.log(`Sending PARTIAL email to: ${clientEmail}`);
          const result = await sendOrderStatusUpdate(
            order,
            clientEmail,
            "PARTIAL",
          );
          console.log(`Email send result:`, result);
          if (result.success) {
            console.log(
              `Partial delivery email sent successfully to ${clientEmail}`,
            );
          } else {
            console.error(
              `Failed to send partial delivery email:`,
              result.error,
            );
          }
        } else {
          console.warn(
            `No client email found for order ${order.orderId}. Username: ${order.username}`,
          );

          // Try to find user by name as fallback
          if (order.name) {
            console.log(`Trying to find user by name: ${order.name}`);
            const userByName = await User.findOne({ fullName: order.name });
            if (userByName && userByName.email) {
              console.log(
                `Found user by name: ${userByName.username}, Email: ${userByName.email}`,
              );
              await sendOrderStatusUpdate(order, userByName.email, "PARTIAL");
            }
          }
        }
      } catch (emailError) {
        console.error("Failed to send partial delivery email:", emailError);
        console.error("Error details:", emailError.stack);
      }

      return res.json({
        success: true,
        message: "Status updated successfully",
        order,
      });
    }

    // Handle CANCELLED
    if (status === "CANCELLED") {
      order.status = "CANCELLED";
      order.cancelledDate = new Date();
      await order.save();

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Order #${order.orderId} status is now CANCELLED.`,
      });

      // SEND EMAIL FOR CANCELLED
      try {
        const clientEmail = await getClientEmail(order.username);
        if (clientEmail) {
          await sendOrderStatusUpdate(order, clientEmail, "CANCELLED");
          console.log(`Cancellation email sent to ${clientEmail}`);
        }
      } catch (emailError) {
        console.error("Failed to send cancellation email:", emailError);
      }

      return res.json({
        success: true,
        message: "Status updated successfully",
        order,
      });
    }

    // Default: Update status and send notification
    order.status = status;
    await order.save();

    await Notification.create({
      name: order.name,
      orderId: order.orderId,
      message: `Order #${order.orderId} status is now ${status}.`,
    });

    res.json({
      success: true,
      message: "Status updated successfully",
      order,
    });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({
      message: err.message || "Failed to update status",
    });
  }
});

// A client's delivered orders that are past their payment due date, for the
// checkout warning. Ordering is still allowed.
router.get("/overdue/:username", async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username || "")
      .replace(/['"]+/g, "")
      .trim();
    const orders = await findOverdueOrdersForClient(username);
    res.json(orders);
  } catch (err) {
    console.error("Error fetching overdue orders:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/user/:username", async (req, res) => {
  try {
    const username = String(req.params.username || "")
      .replace(/['"]+/g, "")
      .trim();
    if (!username) {
      return res.status(400).json({ error: "Client username is required." });
    }

    // Exact match on the account's username. The old search built a regex
    // from the URL without escaping it and also matched on the order name, so
    // a crafted name could list other clients' orders. Orders saved without
    // a username still match on the client's own account name.
    const client = await User.findOne({ username }).select("fullName").lean();
    const conditions = [{ username }];
    if (client?.fullName) {
      conditions.push({
        name: client.fullName,
        $or: [{ username: { $exists: false } }, { username: null }, { username: "" }],
      });
    }

    const orders = await Order.find({ $or: conditions }).sort({ createdAt: -1 });

    res.json(await addUnitTypesToOrders(orders));
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    const orderData = await addUnitTypesToOrders(orders);

    const baseOrderIds = [
      ...new Set(
        orderData
          .map((o) => String(o.orderId || "").replace(/-P$/, ""))
          .filter(Boolean),
      ),
    ];

    const partialOrders = baseOrderIds.length
      ? await Order.find({
          orderId: { $in: baseOrderIds.map((id) => `${id}-P`) },
          status: { $in: ["PENDING", "APPROVED", "PARTIAL", "TO SHIP"] },
        })
          .select("orderId items")
          .lean()
      : [];

    const backordersByOrderId = new Map();
    partialOrders.forEach((partialOrder) => {
      const parentOrderId = partialOrder.orderId.replace(/-P$/, "");
      const existing = backordersByOrderId.get(parentOrderId) || [];
      backordersByOrderId.set(parentOrderId, [
        ...existing,
        ...partialOrder.items.map((item) => ({
          ...item,
          backorderOrderId: partialOrder.orderId,
        })),
      ]);
    });

    res.json(
      orderData.map((order) => {
        const orderIdStr = String(order.orderId || "");
        const isPartial = orderIdStr.endsWith("-P");
        const parentKey = orderIdStr.replace(/-P$/, "");
        const backorders = isPartial
          ? [] // partial orders don't carry their own backorders
          : backordersByOrderId.get(parentKey) || [];

        return {
          ...order,
          isPartial,
          backorders,
        };
      }),
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//picking in mobile
// Statuses the picking screen completes (mobile Picking.js lists these).
const PICKABLE_STATUSES = ["APPROVED", "PARTIAL"];

router.post("/:orderId/complete", async (req, res) => {
  const { pickedItems } = req.body;
  const { orderId } = req.params;
  let claimedOrderId = null;
  let deductionStarted = false;

  try {
    // Every picked quantity must be a whole number above 0. A negative
    // number used to ADD stock.
    const picks = [];
    if (pickedItems && typeof pickedItems === "object" && !Array.isArray(pickedItems)) {
      for (const [scannedCode, rawQty] of Object.entries(pickedItems)) {
        const qty = Number(rawQty);
        const cleanCode = String(scannedCode).trim();
        if (!cleanCode || !Number.isInteger(qty) || qty <= 0) {
          return res.status(400).json({
            success: false,
            message: `Invalid picked quantity for ${cleanCode || "an item"}.`,
          });
        }
        picks.push({ cleanCode, totalToDeduct: qty });
      }
    }
    if (picks.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No picked items were sent." });
    }

    const existing = await Order.findOne({ orderId }).select("status inventoryDeductedAt");
    if (!existing) return res.status(404).json({ message: "Order not found" });

    // Claim the order before touching stock, in one atomic update, so the
    // same order can never be deducted twice (a retried or replayed offline
    // request, or two phones completing it at once).
    const order = await Order.findOneAndUpdate(
      {
        orderId,
        status: { $in: PICKABLE_STATUSES },
        inventoryDeductedAt: null,
      },
      { $set: { inventoryDeductedAt: new Date() } },
      { new: true },
    );

    if (!order) {
      if (existing.inventoryDeductedAt || existing.status === "TO SHIP") {
        // Already completed: report success without deducting again.
        return res.status(200).json({
          success: true,
          alreadyCompleted: true,
          message: "This order was already picked; inventory was not deducted again.",
          emailSent: false,
          deductions: [],
        });
      }
      return res.status(400).json({
        success: false,
        message: `Only APPROVED or PARTIAL orders can be completed. Order ${orderId} is ${existing.status}.`,
      });
    }
    claimedOrderId = order.orderId;

    // Check every item before deducting any, so a shortage on the last item
    // no longer leaves the earlier items deducted.
    const now = new Date();
    const plan = [];
    for (const { cleanCode, totalToDeduct } of picks) {
      const batches = await Batch.find({
        itemCode: cleanCode,
        quantity: { $gt: 0 },
        status: "stored",
        expirationDate: { $gt: now },
      }).sort({ expirationDate: 1 });

      const totalAvailable = batches.reduce((acc, b) => acc + b.quantity, 0);

      if (totalAvailable < totalToDeduct) {
        await Order.updateOne(
          { orderId: claimedOrderId },
          { $set: { inventoryDeductedAt: null } },
        );
        claimedOrderId = null;
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${cleanCode}. Available: ${totalAvailable}, Required: ${totalToDeduct}`,
        });
      }
      plan.push({ cleanCode, totalToDeduct, batches });
    }

    const deductionLog = [];
    deductionStarted = true;

    for (const { cleanCode, totalToDeduct, batches } of plan) {
      let remaining = totalToDeduct;

      let deductedFromBatches = 0;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        batch.quantity -= take;
        remaining -= take;
        deductedFromBatches += take;
        await batch.save();
      }

      const product = await Product.findOne({ itemCode: cleanCode });
      if (product) {
        const oldTotalQuantity = product.totalQuantity;

        product.totalQuantity = Math.max(
          0,
          product.totalQuantity - totalToDeduct,
        );

        // Derive totalBoxes from totalQuantity (Option A)
        if (product.quantityPerBox > 0) {
          product.totalBoxes = Math.floor(
            product.totalQuantity / product.quantityPerBox,
          );
        } else {
          product.totalBoxes = 0;
        }

        await product.save();

        deductionLog.push({
          itemCode: cleanCode,
          itemName: product.name,
          deducted: totalToDeduct,
          oldTotalQuantity: oldTotalQuantity,
          newTotalQuantity: product.totalQuantity,
          newTotalBoxes: product.totalBoxes,
        });
         checkProductStock(cleanCode).catch((err) =>
          console.error(
            `[Hook] complete checkProductStock failed for ${cleanCode}:`,
            err,
          ),
        );
      } else {
        console.warn(`Product not found for itemCode: ${cleanCode}`);
      }
    }

    order.status = "TO SHIP";
    await order.save();

    let emailSent = false;
    let emailError = null;

    let user = null;

    if (order.username) {
      user = await User.findOne({ username: order.username });
    }

    if (!user && order.name) {
      user = await User.findOne({ fullName: order.name, role: "User" });
    }

    if (user && user.email) {
      const [orderWithUnitTypes] = await addUnitTypesToOrders([order]);
      const orderData = {
        orderNumber: order.orderId,
        _id: order._id,
        status: order.status,
        name: order.name,
        shippingAddress: order.shippingAddress,
        procurementMobile: user.procurementMobile || user.phoneNumber || "N/A",
        items: orderWithUnitTypes.items.map((item) => ({
          name: item.name,
          unitType: item.unitType,
          quantity: item.quantity,
          price: item.price,
        })),
        total: order.total,
        subtotal: order.subtotal,
        requestedDeliveryDate: order.requestedDeliveryDate || "N/A",
        notes: order.notes || "N/A",
        createdAt: order.createdAt,
      };

      try {
        const emailResult = await sendOrderReceipt(orderData, user.email);

        if (emailResult.success) {
          emailSent = true;
          console.log(`Email sent successfully to ${user.email}`);
        } else {
          emailError = emailResult.error;
          console.error("Email send failed:", emailError);
        }
      } catch (emailErr) {
        emailError = emailErr.message;
        console.error("Email error:", emailError);
      }
    } else {
      emailError = `User not found or no email. Searched by: username=${order.username}, name=${order.name}`;
      console.warn(`User not found for order ${order.orderId}`);
    }

    const actor = getActor(req);

    await createActivityLog({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      action: "Complete order - Inventory deduction",
      module: "Inventory",
      description: `Inventory deducted for order ${order.orderId}. ${deductionLog.map((d) => `${d.itemName}: ${d.deducted} pcs (${d.oldTotalQuantity} → ${d.newTotalQuantity} pcs, ${d.newTotalBoxes} boxes)`).join(", ")}`,
    });

    await createActivityLog({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      action: "Complete order",
      module: "Order Fulfillment",
      description: `Order ${order.orderId} was completed and moved to shipping. ${emailSent ? "Receipt email sent." : "Receipt email failed."}`,
    });

    await Notification.create({
      name: order.name,
      orderId: order.orderId,
      message: `Order #${order.orderId} is now TO SHIP. ${emailSent ? "Receipt sent to your email." : ""}`,
    });

    res.status(200).json({
      success: true,
      message: "Inventory updated and order moved to shipping.",
      emailSent: emailSent,
      emailError: emailError,
      deductions: deductionLog,
    });
  } catch (error) {
    console.error("Complete order error:", error);
    // Nothing was deducted yet: release the claim so the order can be
    // completed again. Once stock was touched the claim stays, so a retry
    // cannot deduct twice; an admin checks such an order by hand.
    if (claimedOrderId && !deductionStarted) {
      await Order.updateOne(
        { orderId: claimedOrderId },
        { $set: { inventoryDeductedAt: null } },
      ).catch((releaseError) =>
        console.error("Failed to release picking claim:", releaseError),
      );
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:orderId/email", async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId: orderId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const user = await User.findOne({ username: order.username });

    if (!user || !user.email) {
      return res.status(404).json({
        message: "User email not found",
        emailSent: false,
      });
    }

    const [orderWithUnitTypes] = await addUnitTypesToOrders([order]);
    const orderData = {
      orderNumber: order.orderId,
      _id: order._id,
      status: order.status,
      name: order.name,
      shippingAddress: order.shippingAddress,
      procurementMobile: user.procurementMobile || user.phoneNumber || "N/A",
      items: orderWithUnitTypes.items.map((item) => ({
        name: item.name,
        unitType: item.unitType,
        quantity: item.quantity,
        price: item.price,
      })),
      total: order.total,
      subtotal: order.subtotal,
      requestedDeliveryDate: order.requestedDeliveryDate || "N/A",
      notes: order.notes || "N/A",
      createdAt: order.createdAt,
    };

    const emailResult = await sendOrderReceipt(orderData, user.email);

    if (emailResult.success) {
      await createActivityLog({
        userId: req.actor?.userId || null,
        username: req.actor?.username || "Unknown",
        role: req.actor?.role || "Unknown",
        action: "Email sent",
        module: "Orders",
        description: `Receipt email sent to ${user.email} for order ${orderId}`,
      });

      res.json({
        message: "Receipt sent successfully",
        emailSent: true,
      });
    } else {
      res.status(500).json({
        message: "Failed to send receipt",
        emailSent: false,
        error: emailResult.error,
      });
    }
  } catch (err) {
    console.error("Error sending receipt:", err);
    res.status(500).json({
      message: "Error sending receipt",
      emailSent: false,
      error: err.message,
    });
  }
});

//partial ni admin
router.patch("/:orderId/partial", async (req, res) => {
  const { items } = req.body;
  const { orderId } = req.params;

  try {
    const originalOrder = await Order.findOne({ orderId: orderId });
    if (!originalOrder) {
      return res.status(404).json({ message: "Order not found." });
    }

    // Only orders that have not been split or shipped can be split. Splitting
    // a PARTIAL order again would delete and recreate its backorder (-P),
    // even if that backorder was already approved, paid or delivered.
    if (!["PENDING", "PAYMENT REVIEW"].includes(originalOrder.status)) {
      return res.status(400).json({
        message: `Order ${originalOrder.orderId} is ${originalOrder.status} and can no longer be split.`,
      });
    }
    if (await Order.exists({ orderId: `${orderId}-P` })) {
      return res.status(409).json({
        message: `Order ${originalOrder.orderId} already has a backorder (${orderId}-P).`,
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items to split." });
    }

    const deliveredItems = [];
    const backorderItems = [];

    items.forEach((item) => {
      const originalQty = Math.max(0, Number(item.originalQty) || 0);
      // Clamp so a bad input can never ship more than was ordered or create
      // a negative backorder.
      const deliveredQty = Math.min(
        originalQty,
        Math.max(0, Number(item.deliveredQty) || 0),
      );
      const remainingQty = originalQty - deliveredQty;

      const orderMode = item.orderMode === "box" ? "box" : "piece";
      const quantityPerBox = Number(item.quantityPerBox) || 0;
      const calcBoxes = (qty) => {
        if (orderMode !== "box" || !quantityPerBox) return 0;
        return Math.round((qty / quantityPerBox) * 100) / 100;
      };

      // Items with nothing shipped now go only to the backorder.
      if (deliveredQty > 0) {
        deliveredItems.push({
          productId: item.productId,
          itemCode: item.itemCode,
          name: item.name,
          category: item.category,
          unitType: item.unitType,
          quantity: deliveredQty,
          price: item.price,
          image: item.image,
          orderMode,
          boxes: calcBoxes(deliveredQty),
          quantityPerBox,
        });
      }

      if (remainingQty > 0) {
        backorderItems.push({
          productId: item.productId,
          itemCode: item.itemCode,
          name: item.name,
          category: item.category,
          unitType: item.unitType,
          quantity: remainingQty,
          price: item.price,
          image: item.image,
          orderMode,
          boxes: calcBoxes(remainingQty),
          quantityPerBox,
        });
      }
    });

    if (deliveredItems.length === 0) {
      return res.status(400).json({
        message: "Set at least one item quantity to deliver now.",
      });
    }

    // Each order is billed for its own items (decision 5). Any amount on the
    // original order above its item subtotal (such as a fee) stays with it.
    const itemsSubtotal = (list) =>
      list.reduce(
        (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
        0,
      );
    const extraCharges = Math.max(
      0,
      (Number(originalOrder.total) || 0) - (Number(originalOrder.subtotal) || 0),
    );
    const deliveredSubtotal = itemsSubtotal(deliveredItems);
    const backorderSubtotal = itemsSubtotal(backorderItems);

    originalOrder.status = "PARTIAL";
    originalOrder.items = deliveredItems;
    originalOrder.subtotal = deliveredSubtotal;
    originalOrder.total = deliveredSubtotal + extraCharges;
    await originalOrder.save();

    await Notification.create({
      name: originalOrder.name,
      orderId: originalOrder.orderId,
      message: `Your Order #${originalOrder.orderId} has been partially split.`,
    });

    // SEND EMAIL FOR PARTIAL
    try {
      const clientEmail = await getClientEmail(originalOrder.username);
      if (clientEmail) {
        await sendOrderStatusUpdate(originalOrder, clientEmail, "PARTIAL");
        console.log(`Partial split email sent to ${clientEmail}`);
      } else {
        console.warn(
          `No client email found for order ${originalOrder.orderId}`,
        );
      }
    } catch (emailError) {
      console.error("Failed to send partial split email:", emailError);
    }

    let partialOrderId = null;
    if (backorderItems.length > 0) {
      partialOrderId = `${orderId}-P`;

      await Order.deleteOne({ orderId: partialOrderId });

      const partialOrder = new Order({
        ...originalOrder.toObject(),
        _id: undefined,
        orderId: partialOrderId,
        status: "PENDING",
        items: backorderItems,
        subtotal: backorderSubtotal,
        total: backorderSubtotal,
        createdAt: new Date(),
        notes: `Partial order created from ${originalOrder.orderId}. Remaining items: ${backorderItems.map((i) => `${i.name} (${i.quantity})`).join(", ")}`,
        originalOrderId: originalOrder.orderId,
        paymentSlip: undefined,
        paymentStatus: "PENDING",
        paymentAcceptedAt: undefined,
        paymentRejectedAt: undefined,
        paymentAcceptedBy: undefined,
        rejectToken: undefined,
        rejectTokenExpiry: undefined,
        // The backorder starts its own picking, delivery and payment cycle.
        inventoryDeductedAt: null,
        shippedDate: null,
        cancelledDate: null,
        deliveredDate: null,
        deliveryReceipt: "",
        deliveredBy: "",
        paymentDueDate: null,
        lastDueReminderAt: null,
        overdueSmsSentAt: null,
        lastOverdueEmailAt: null,
        slipSubmittedAt: null,
        slipReminderSentAt: null,
      });

      await partialOrder.save();

      await Notification.create({
        name: originalOrder.name,
        orderId: partialOrderId,
        message: `Partial Order #${partialOrderId} created for remaining items.`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Order split successfully",
      data: {
        originalOrder: originalOrder.orderId,
        originalOrderItems: deliveredItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
        })),
        partialOrder: partialOrderId,
        partialOrderItems: backorderItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
        })),
      },
    });
  } catch (err) {
    console.error("Partial split error:", err);
    res.status(500).json({ message: err.message });
  }
});

//return for new proposed date ni admin
router.patch("/:orderId/edit-date", async (req, res) => {
  const { newDate, reason } = req.body;

  try {
    if (!newDate) {
      return res.status(400).json({ message: "New date is required" });
    }
    if (!reason) {
      return res
        .status(400)
        .json({ message: "Reason for changing date is required" });
    }

    const existingOrder = await Order.findOne({ orderId: req.params.orderId });
    if (!existingOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    const oldDate = existingOrder.requestedDeliveryDate || "N/A";
    const dateChangeNote = `Old Date: ${oldDate} | New Date: ${newDate} | Reason: ${reason}`;

    const order = await Order.findOneAndUpdate(
      { orderId: req.params.orderId },
      {
        $set: {
          status: "RETURNED",
          newDate: newDate,
          dateNote: reason,
          notes: dateChangeNote,
        },
        $push: {
          dateChangeHistory: {
            oldDate: oldDate,
            newDate: newDate,
            reason: reason,
            changedAt: new Date(),
          },
        },
      },
      { new: true, runValidators: true },
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      action: "Update order note",
      module: "Order",
      description: `Order ${order.orderId} was marked as returned.`,
    });

    await Notification.create({
      name: order.name,
      orderId: order.orderId,
      message: `Your Order #${order.orderId} delivery date has been changed from ${oldDate} to ${newDate}. Reason: ${reason}. Please review and approve the new date.`,
    });

    try {
      const clientEmail = await getClientEmail(order.username);
      if (clientEmail) {
        const orderWithDateInfo = {
          ...order.toObject(),
          oldDate: oldDate,
          newDate: newDate,
          dateChangeReason: reason,
        };
        await sendOrderStatusUpdate(orderWithDateInfo, clientEmail, "RETURNED");
      } else {
        console.warn(`No client email found for order ${order.orderId}`);
      }
    } catch (emailError) {
      console.error("Failed to send return email:", emailError);
    }

    res.json({
      success: true,
      message: "Delivery date updated successfully",
      order: order,
    });
  } catch (err) {
    console.error("Error in edit-date route:", err);
    res.status(500).json({ message: err.message || "Failed to update date" });
  }
});

router.post("/check-stock", async (req, res) => {
  const { items } = req.body;

  try {
    let insufficientItems = [];
    let stockLevels = [];

    for (const item of items) {
      const product = await findProductForOrderItem(item.itemCode);
      const itemCode = product?.itemCode || item.itemCode;
      const batches = await Batch.find({
        itemCode,
        quantity: { $gt: 0 },
        status: "stored",
        expirationDate: { $gt: new Date() },
      }).sort({ expirationDate: 1 });

      const totalAvailable = batches.reduce(
        (sum, batch) => sum + Number(batch.quantity || 0),
        0,
      );

      stockLevels.push({
        itemCode,
        available: totalAvailable,
      });

      if (totalAvailable < item.quantity) {
        insufficientItems.push({
          productName: product?.name || item.name || "Unknown Product",
          itemCode,
          requested: Number(item.quantity),
          available: totalAvailable,
          shortfall: Number(item.quantity) - totalAvailable,
        });
      }
    }

    res.json({
      insufficientItems,
      stockLevels,
    });
  } catch (err) {
    console.error("Error checking stock:", err);
    res.status(500).json({
      message: err.message || "Failed to check stock",
    });
  }
});

// client partial
router.post("/checkout-with-split", async (req, res) => {
  const {
    items,
    shippingAddress,
    notes,
    requestedDeliveryDate,
  } = req.body;

  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "No items to order." });
    }

    // Same owner rules as the normal checkout: the client comes from the
    // verified login token, never from the names the browser sends.
    const checkoutClient = await resolveCheckoutClient(req);
    if (checkoutClient.error) {
      return res
        .status(checkoutClient.status)
        .json({ success: false, message: checkoutClient.error });
    }
    const { username } = checkoutClient;
    const name = checkoutClient.name || username;
    const role = "User";
    const userId = req.user.userId;

    const reservedMessage = await findReservedOrderItem(req, username, items);
    if (reservedMessage) {
      return res.status(403).json({ success: false, message: reservedMessage });
    }

    // Prices come from the supply records, never from the browser.
    const priced = await priceOrderItems(items);
    if (priced.error) {
      return res.status(400).json({ success: false, message: priced.error });
    }

    const deliveredItems = [];
    const backorderItems = [];
    const newOrderID = await getNextOrderId(username);

    priced.items.forEach((item) => {
      const orderMode = item.orderMode;
      const quantityPerBox = item.quantityPerBox;

      // Total pieces ordered
      const originalPcs = item.quantity;

      // How many pieces the client is willing to accept now
      // (frontend sends deliveredQty as min(requested, available) in pcs)
      let deliveredPcs = Number(item.deliveredQty);
      if (!Number.isFinite(deliveredPcs)) deliveredPcs = originalPcs;

      // Clamp to valid range
      deliveredPcs = Math.max(0, Math.min(deliveredPcs, originalPcs));

      // If box mode: only deliver WHOLE boxes, push leftover pcs to backorder
      let deliveredBoxes = 0;
      let backorderBoxes = 0;

      if (orderMode === "box" && quantityPerBox > 0) {
        deliveredBoxes = Math.floor(deliveredPcs / quantityPerBox);
        deliveredPcs = deliveredBoxes * quantityPerBox; // drop partial box
        const remainingPcs = originalPcs - deliveredPcs;
        backorderBoxes =
          Math.round((remainingPcs / quantityPerBox) * 100) / 100;
      }

      const remainingPcs = originalPcs - deliveredPcs;

      const baseItem = {
        productId: item.productId,
        itemCode: item.itemCode,
        name: item.name,
        category: item.category,
        unitType: item.unitType,
        price: item.price,
        image: item.image,
        orderMode,
        quantityPerBox,
      };

      if (deliveredPcs > 0) {
        deliveredItems.push({
          ...baseItem,
          quantity: deliveredPcs,
          boxes: deliveredBoxes,
        });
      }

      if (remainingPcs > 0) {
        backorderItems.push({
          ...baseItem,
          quantity: remainingPcs,
          boxes: backorderBoxes,
        });
      }
    });

    // Create main order (available items) — PENDING
    const mainOrder = new Order({
      orderId: newOrderID,
      username,
      userId: userId || null,
      role: role || "User",
      name,
      items: deliveredItems,
      subtotal: orderLineTotal(deliveredItems),
      total: orderLineTotal(deliveredItems),
      shippingAddress,
      notes,
      requestedDeliveryDate,
      status: "PENDING",
    });

    await mainOrder.save();

    let partialOrder = null;

    // Create backorder (remaining items)
    if (backorderItems.length > 0) {
      partialOrder = new Order({
        orderId: `${newOrderID}-P`,
        username,
        userId: userId || null,
        role: role || "User",
        name,
        items: backorderItems,
        subtotal: orderLineTotal(backorderItems),
        total: orderLineTotal(backorderItems),
        shippingAddress,
        notes: `${notes || ""} | Backorder from ${mainOrder.orderId}`,
        requestedDeliveryDate,
        // PENDING like the admin split's backorder: these items were out of
        // stock, so they need approval (and its stock check) and picking.
        // As PARTIAL they could be moved straight to TO SHIP.
        status: "PENDING",
        originalOrderId: mainOrder.orderId,
      });

      await partialOrder.save();

      await Notification.create({
        name,
        orderId: partialOrder.orderId,
        message: `Partial Order #${partialOrder.orderId} created for remaining items.`,
      });
    }

    await Notification.create({
      name,
      orderId: mainOrder.orderId,
      message: `Your Order #${mainOrder.orderId} has been placed.`,
    });

    flagOrderPlacedWhileOverdue({
      username,
      name,
      orderId: mainOrder.orderId,
    });

    return res.status(201).json({
      success: true,
      message:
        backorderItems.length > 0
          ? "Order placed. Partial backorder created."
          : "Order placed successfully.",
      data: {
        mainOrderId: mainOrder.orderId,
        partialOrderId: partialOrder ? partialOrder.orderId : null,
        deliveredItems: deliveredItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          boxes: i.boxes,
        })),
        backorderItems: backorderItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          boxes: i.boxes,
        })),
      },
    });
  } catch (err) {
    console.error("Split checkout error:", err);
    res.status(500).json({ message: err.message });
  }
});

//cancel order ni client
router.patch("/:orderId/cancel", async (req, res) => {
  try {
    const { orderId } = req.params;

    // Who is cancelling: the verified login token, never the X-* headers.
    const username = req.user?.username;
    const role = req.user?.role;

    // Validate order exists
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled
    if (order.status !== "PENDING" && order.status !== "RETURNED") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled in its current status: ${order.status}`,
      });
    }

    // Check if order is already cancelled
    if (order.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Order is already cancelled",
      });
    }

    // A client may only cancel their own order.
    if (
      role !== "Admin" &&
      String(username || "").trim() !== String(order.username || "").trim()
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel your own orders.",
      });
    }

    // Update order status to CANCELLED only
    order.status = "CANCELLED";
    order.cancelledDate = new Date();
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order: order,
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
      error: error.message,
    });
  }
});

export default router;
