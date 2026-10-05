import express from "express";
const router = express.Router();
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Batch from "../models/Batch.js";
import ClientRequest from "../models/ClientRequest.js"; 
import Settings from "../models/Settings.js";


router.get("/clients", async (req, res) => {
  try {
    const clients = await Order.distinct("name");
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const range = req.query.range || "today";
    const now = new Date();
    let startDate, endDate;

    if (range === "today") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (range === "week") {
      const day = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - day);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (range === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
    }

    const settings = (await Settings.findOne()) || { urgencyThreshold: 0 };
    const threshold = settings.urgencyThreshold;

    const urgentDateLimit = new Date();
    urgentDateLimit.setDate(now.getDate() + threshold);
    urgentDateLimit.setHours(23, 59, 59, 999);

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // ---- ORDERS ----
    // totalOrders = ALL orders except CANCELLED
    const [totalOrders, pendingOrders, allOrdersInRange] = await Promise.all([
      Order.countDocuments({ status: { $ne: "CANCELLED" } }),
      Order.countDocuments({ status: "PENDING" }),
      Order.find({
        status: { $nin: ["DELIVERED", "RETURNED", "CANCELLED"] },
      }),
    ]);

    const urgentRequests = allOrdersInRange.filter((order) => {
      const dateStr = order.notes || order.requestedDeliveryDate;
      if (!dateStr) return false;
      const cleanDateStr = dateStr.includes(":")
        ? dateStr.split(":")[1].trim()
        : dateStr;
      const deliveryDate = new Date(cleanDateStr);
      return deliveryDate <= urgentDateLimit;
    }).length;

    // ---- EXPIRED ----
    const expiredBatches = await Batch.find({
      expirationDate: { $ne: null, $lt: now },
      status: { $in: ["pending", "stored", "for disposal"] },
    }).select("itemName itemCode expirationDate quantity status");

    expiredBatches.forEach((b) => {
      const daysPast = Math.floor(
        (now - new Date(b.expirationDate)) / 86400000
      );
      console.log(
        `   • ${b.itemName} | ${b.itemCode} | exp: ${new Date(
          b.expirationDate
        ).toISOString()} | past ${daysPast}d | qty: ${b.quantity} | ${b.status}`
      );
    });

    const expiredCount = expiredBatches.length;

    // ---- CRITICAL (near-expiry, still valid) ----
    const criticalCount = await Batch.countDocuments({
      expirationDate: { $gt: now, $lte: thirtyDaysFromNow },
      status: { $in: ["stored", "for disposal"] },
    });

    // ---- LOW STOCK ----
    const lowStockSupplies = await Product.aggregate([
  { $match: { isKit: false } },
  {
    $lookup: {
      from: "batches",
      let: { currentItemCode: "$itemCode" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$itemCode", "$$currentItemCode"] },
            status: { $in: ["stored"] },
          },
        },
      ],
      as: "productBatches",
    },
  },
  {
    $project: {
      name: 1,
      itemCode: 1,
      reorderLevel: 1,
      totalQuantity: { $sum: "$productBatches.quantity" },
    },
  },
  { $match: { totalQuantity: { $gt: 0 } } },
  { $match: { $expr: { $lte: ["$totalQuantity", "$reorderLevel"] } } },
  { $sort: { totalQuantity: 1 } },
  { $limit: 5 },
]);

    const outgoingToday = await Order.countDocuments({
      status: { $regex: /^TO SHIP$/i },
    });

    const pendingClientRequests = await ClientRequest.countDocuments({
      status: "PENDING",
    });

    res.json({
      totalOrders,
      urgentRequests,
      pendingOrders,
      expiredCount,
      criticalCount,
      lowStockSupplies: lowStockSupplies.map((p) => ({
        name: p.name,
        quantity: p.totalQuantity,
      })),
      outgoingToday,
      pendingClientRequests,
    });
  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/chart-data", async (req, res) => {
  try {
    const { day, month, year, client } = req.query;
    let matchQuery = { status: { $regex: /^delivered$/i } };

    if (year) {
      const y = parseInt(year);
      let start, end;

      if (day && month) {
        start = new Date(y, parseInt(month) - 1, parseInt(day), 0, 0, 0);
        end = new Date(y, parseInt(month) - 1, parseInt(day), 23, 59, 59);
      } else if (month) {
        start = new Date(y, parseInt(month) - 1, 1);
        end = new Date(y, parseInt(month), 0, 23, 59, 59);
      } else {
        start = new Date(y, 0, 1);
        end = new Date(y, 11, 31, 23, 59, 59);
      }
      matchQuery.updatedAt = { $gte: start, $lte: end };
    }

    if (client) {
      matchQuery.name = client;
    }

    const data = await Order.aggregate([
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalDelivered: { $sum: "$items.quantity" }
        }
      },
      {
        $project: {
          _id: 0,
          name: "$_id",
          value: "$totalDelivered"
        }
      },
      { $sort: { value: -1 } },
      { $limit: 8 }
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;