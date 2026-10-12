import express from "express";
const router = express.Router();

const normalizeUnitType = (unitType) => {
  const value = String(unitType || "").trim();
  return ["", "-", "n/a", "na"].includes(value.toLowerCase()) ? "" : value;
};
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
        999,
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
        (now - new Date(b.expirationDate)) / 86400000,
      );
      console.log(
        `   • ${b.itemName} | ${b.itemCode} | exp: ${new Date(
          b.expirationDate,
        ).toISOString()} | past ${daysPast}d | qty: ${b.quantity} | ${b.status}`,
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
    
    const baseQuery = {};
    
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
      baseQuery.updatedAt = { $gte: start, $lte: end };
    }

    if (client) {
      baseQuery.name = client;
    }

    const aggregateData = async (statusRegex) => {
      return await Order.aggregate([
        { $match: { ...baseQuery, status: { $regex: statusRegex } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            totalQuantity: { $sum: "$items.quantity" },
            unitType: { $first: "$items.unitType" },
            itemCode: { $first: "$items.itemCode" },
          },
        },
        {
          $project: {
            _id: 0,
            name: "$_id",
            value: "$totalQuantity",
            unitType: 1,
            itemCode: 1,
          },
        },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ]);
    };

    const [deliveredData, toShipData] = await Promise.all([
      aggregateData(/^delivered$/i),
      aggregateData(/^TO SHIP$/i),
    ]);

    const allItemCodes = [
      ...new Set([
        ...deliveredData.map((item) => item.itemCode),
        ...toShipData.map((item) => item.itemCode),
      ].filter(Boolean)),
    ];

    const [products, batches] = allItemCodes.length
      ? await Promise.all([
          Product.find({ itemCode: { $in: allItemCodes } })
            .select("itemCode unitType")
            .lean(),
          Batch.find({ itemCode: { $in: allItemCodes } })
            .select("itemCode unitType")
            .sort({ createdAt: -1 })
            .lean(),
        ])
      : [[], []];

    const productUnitTypes = new Map(
      products.map((product) => [
        String(product.itemCode),
        normalizeUnitType(product.unitType),
      ]),
    );
    const batchUnitTypes = new Map();
    batches.forEach((batch) => {
      const unitType = normalizeUnitType(batch.unitType);
      const itemCode = String(batch.itemCode);
      if (unitType && !batchUnitTypes.has(itemCode)) {
        batchUnitTypes.set(itemCode, unitType);
      }
    });

    const resolveUnitType = (item) => {
      return (
        normalizeUnitType(item.unitType) ||
        productUnitTypes.get(String(item.itemCode)) ||
        batchUnitTypes.get(String(item.itemCode)) ||
        "N/A"
      );
    };

    const delivered = deliveredData.map((item) => ({
      name: item.name,
      value: item.value,
      unitType: resolveUnitType(item),
    }));

    const toShip = toShipData.map((item) => ({
      name: item.name,
      value: item.value,
      unitType: resolveUnitType(item),
    }));

    res.json({
      delivered,
      toShip,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/items', async (req, res) => {
  try {
    const doc = await Item.create(req.body);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/items/:id', async (req, res) => {
  try {
    const doc = await Item.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    const items = await Item.find().lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
