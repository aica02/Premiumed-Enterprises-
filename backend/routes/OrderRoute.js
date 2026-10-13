import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import fs from "fs";
import path from "path";
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
  sendEmailWithRetry,
  sendOrderReceipt,
  sendDepositSlipToAccountant,
  sendOrderStatusUpdate,
} from "../utils/emailService.js";

const router = express.Router();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

const getActor = (req) => ({
  userId: req.actor?.userId || null,
  username: req.actor?.username || "Unknown",
  role: req.actor?.role || "Unknown",
});

const findProductForOrderItem = async (itemCode) => {
  if (!itemCode) return null;

  const productByCode = await Product.findOne({ itemCode });
  if (productByCode) return productByCode;

  if (mongoose.isValidObjectId(itemCode)) {
    return Product.findById(itemCode);
  }

  return null;
};

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

router.get("/reset-counters", async (req, res) => {
  try {
    await Counter.deleteMany({});
    res.json({ message: "All counters reset successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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

//checkout
router.post("/", async (req, res) => {
  const {
    name,
    items,
    subtotal,
    total,
    shippingAddress,
    notes,
    requestedDeliveryDate,
  } = req.body;

  try {
    const username = req.headers["x-username"] || req.body.username || name;

    const newOrderId = await getNextOrderId(username);

    const transformedItems = await Promise.all(
      items.map(async (item) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        const product = await findProductForOrderItem(item.itemCode);

        const orderMode = item.orderMode === "box" ? "box" : "piece";
        const boxes = Number(item.boxes) || 0;
        const quantityPerBox =
          Number(item.quantityPerBox) || Number(product?.quantityPerBox) || 0;

        return {
          productId: item.productId || item._id,
          itemCode: product?.itemCode || item.itemCode,
          name: item.name,
          category: item.category || "Medical Supply",
          unitType:
            normalizeUnitType(item.unitType) ||
            normalizeUnitType(product?.unitType) ||
            "Piece",
          quantity: quantity,
          price: price,
          image: item.image || item.itemImage || "",
          orderMode,
          boxes: orderMode === "box" ? boxes : 0,
          quantityPerBox,
        };
      })
    );

    const calculatedSubtotal =
      subtotal ||
      transformedItems.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.quantity),
        0,
      );
    const calculatedTotal = total || calculatedSubtotal;

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

    res.json({ message: "Item picked successfully via FEFO (Unexpired Only)" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/upload-slip", upload.single("orderSlip"), async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId || !req.file) {
      return res
        .status(400)
        .json({ message: "Order ID and slip file are required" });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const slipPath = `/uploads/${req.file.filename}`;
    order.paymentSlip = slipPath;
    order.paymentStatus = "COMPLETED";
    order.status = "TO SHIP";
    await order.save();

    const settings = await Settings.findOne();
    const accountantEmail = settings?.accountantEmail;

    let emailSent = false;
    let emailError = null;

    if (accountantEmail) {
      try {
        const fileBuffer = fs.readFileSync(req.file.path);

        const emailResult = await sendDepositSlipToAccountant(
          order,
          fileBuffer,
          req.file.originalname,
          accountantEmail,
        );

        if (emailResult.success) {
          emailSent = true;
          console.log(
            `Deposit slip email sent to accountant: ${accountantEmail}`,
          );
          order.notes = order.notes
            ? `${order.notes} | Deposit Slip has been sent.`
            : "Deposit Slip has been sent.";
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
    await createActivityLog({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      action: "Upload payment slip",
      module: "Order",
      description: `Order ${order.orderId} had a payment slip uploaded.${emailSent ? " Email sent to accountant." : " No email sent."}`,
    });

    // try {
    //   fs.unlinkSync(req.file.path);
    // } catch (cleanupError) {
    //   console.error("Error cleaning up file:", cleanupError);
    // }

    res.json({
      success: true,
      message: `Slip uploaded successfully.${emailSent ? " Deposit slip sent to accountant." : ""}`,
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
});

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

    // Handle DELIVERED
    if (status === "DELIVERED") {
      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Deliver order",
        module: "Delivery",
        description: `Order ${order.orderId} was marked as delivered.`,
      });

      order.status = "DELIVERED";
      order.deliveredDate = new Date();
      await order.save();

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Order #${order.orderId} status is now DELIVERED.`,
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
    if (status === "TO SHIP") {
  let emailSent = false;
  let emailError = null;

  if (order.paymentSlip) {
    try {
      const settings = await Settings.findOne();
      const accountantEmail = settings?.accountantEmail;

      if (accountantEmail) {
        // Fix: paymentSlip is like "/uploads/1234-file.pdf"
        // Strip leading slash and join with cwd
        const relativePath = order.paymentSlip.replace(/^\/+/, "");
        const slipPath = path.join(process.cwd(), relativePath);
        
        console.log(`[TO SHIP] Looking for slip at: ${slipPath}`);
        
        if (fs.existsSync(slipPath)) {
          const fileBuffer = fs.readFileSync(slipPath);
          const fileName = path.basename(order.paymentSlip);

          const emailResult = await sendDepositSlipToAccountant(
            order,
            fileBuffer,
            fileName,
            accountantEmail,
          );

          if (emailResult.success) {
            emailSent = true;
            order.notes = order.notes
              ? `${order.notes} | Deposit slip sent to accountant.`
              : "Deposit slip sent to accountant.";
          } else {
            emailError = emailResult.error;
            console.error("Failed to send email to accountant:", emailError);
          }
        } else {
          emailError = `Payment slip file not found at: ${slipPath}`;
          console.error(emailError);
        }
      } else {
        emailError = "Accountant email not configured in settings";
        console.warn(emailError);
      }
    } catch (emailError) {
      console.error("Error in email sending process:", emailError);
      emailError = emailError.message;
    }
  }
      await createActivityLog({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        action: "Ship order",
        module: "Order",
        description: `Order ${order.orderId} was moved to shipping.${emailSent ? " Deposit slip sent to accountant." : ""}${emailError ? " Email failed: " + emailError : ""}`,
      });

      order.status = "TO SHIP";
      order.shippedDate = new Date();
      await order.save();

      await Notification.create({
        name: order.name,
        orderId: order.orderId,
        message: `Order #${order.orderId} status is now TO SHIP.${emailSent ? " Deposit slip has been sent to the accountant." : ""}`,
      });

      return res.json({
        success: true,
        message: `Order moved to shipping${emailSent ? " and deposit slip sent to accountant" : ""}`,
        order,
        emailSent,
        emailError,
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

router.get("/user/:username", async (req, res) => {
  try {
    let { username } = req.params;

    username = decodeURIComponent(username);

    username = username.replace(/['"]+/g, "").trim();

    const flexibleSearch = username.split("").join("\\s*");

    const orders = await Order.find({
      $or: [
        { name: { $regex: new RegExp(`^${flexibleSearch}$`, "i") } },
        { username: { $regex: new RegExp(`^${flexibleSearch}$`, "i") } },
      ],
    }).sort({ createdAt: -1 });

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
    res.json(await addUnitTypesToOrders(orders));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

//picking in mobile
router.post("/:orderId/complete", async (req, res) => {
  const { pickedItems, userId, username, role } = req.body;
  const { orderId } = req.params;

  try {
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const deductionLog = [];

    for (const [scannedCode, totalToDeduct] of Object.entries(pickedItems)) {
      let remaining = totalToDeduct;
      const cleanCode = scannedCode.trim();

      const batches = await Batch.find({
        itemCode: cleanCode,
        quantity: { $gt: 0 },
        status: "stored",
        expirationDate: { $gt: new Date() },
      }).sort({ expirationDate: 1 });

      const totalAvailable = batches.reduce((acc, b) => acc + b.quantity, 0);

      if (totalAvailable < totalToDeduct) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${cleanCode}. Available: ${totalAvailable}, Required: ${totalToDeduct}`,
        });
      }

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
      user = await User.findOne({ fullName: order.name });
    }

    if (!user && req.body.username) {
      user = await User.findOne({ username: req.body.username });
    }

    if (!user && req.headers["x-username"]) {
      user = await User.findOne({ username: req.headers["x-username"] });
    }

    if (user && user.email) {
      const orderData = {
        orderNumber: order.orderId,
        _id: order._id,
        name: order.name,
        shippingAddress: order.shippingAddress,
        procurementMobile: user.procurementMobile || user.phoneNumber || "N/A",
        items: order.items.map((item) => ({
          name: item.name,
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
      userId: userId || actor.userId,
      username: username || actor.username || order.username,
      role: role || actor.role || "User",
      action: "Complete order - Inventory deduction",
      module: "Inventory",
      description: `Inventory deducted for order ${order.orderId}. ${deductionLog.map((d) => `${d.itemName}: ${d.deducted} pcs (${d.oldTotalQuantity} → ${d.newTotalQuantity} pcs, ${d.newTotalBoxes} boxes)`).join(", ")}`,
    });

    await createActivityLog({
      userId: userId || actor.userId,
      username: username || actor.username || order.username,
      role: role || actor.role || "User",
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

    const orderData = {
      orderNumber: order.orderId,
      _id: order._id,
      name: order.name,
      shippingAddress: order.shippingAddress,
      procurementMobile: user.procurementMobile || user.phoneNumber || "N/A",
      items: order.items.map((item) => ({
        name: item.name,
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
        userId: req.body.userId || user._id,
        username: order.username,
        role: req.body.role || "User",
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

    const deliveredItems = [];
    const backorderItems = [];

    items.forEach((item) => {
      const deliveredQty = item.deliveredQty || 0;
      const remainingQty = item.originalQty - deliveredQty;

      const orderMode = item.orderMode === "box" ? "box" : "piece";
      const quantityPerBox = Number(item.quantityPerBox) || 0;
      const calcBoxes = (qty) => {
        if (orderMode !== "box" || !quantityPerBox) return 0;
        return Math.round((qty / quantityPerBox) * 100) / 100;
      };

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

    originalOrder.status = "PARTIAL";
    originalOrder.items = deliveredItems;
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
        createdAt: new Date(),
        notes: `Partial order created from ${originalOrder.orderId}. Remaining items: ${backorderItems.map((i) => `${i.name} (${i.quantity})`).join(", ")}`,
        originalOrderId: originalOrder.orderId,
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
    username,
    userId,
    role,
    name,
    items,
    shippingAddress,
    notes,
    requestedDeliveryDate,
    subtotal,
    total,
  } = req.body;

  try {
    const deliveredItems = [];
    const backorderItems = [];
    const newOrderID = await getNextOrderId(username);

    items.forEach((item) => {
      const orderMode = item.orderMode === "box" ? "box" : "piece";
      const quantityPerBox = Number(item.quantityPerBox) || 0;

      // Total pieces ordered
      const originalPcs = Number(item.quantity) || 0;

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
        unitType: item.unitType || "Piece",
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
      subtotal: deliveredItems.reduce(
        (a, i) => a + Number(i.price) * Number(i.quantity),
        0,
      ),
      total: deliveredItems.reduce(
        (a, i) => a + Number(i.price) * Number(i.quantity),
        0,
      ),
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
        subtotal: backorderItems.reduce(
          (a, i) => a + Number(i.price) * Number(i.quantity),
          0,
        ),
        total: backorderItems.reduce(
          (a, i) => a + Number(i.price) * Number(i.quantity),
          0,
        ),
        shippingAddress,
        notes: `${notes || ""} | Backorder from ${mainOrder.orderId}`,
        requestedDeliveryDate,
        status: "PARTIAL",
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

    // Get user info from headers
    const username = req.headers["x-username"];
    const userId = req.headers["x-user-id"];
    const role = req.headers["x-role"];

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

    // Update order status to CANCELLED only
    order.status = "CANCELLED";
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