import Batch from "../models/Batch.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import AlertLog from "../models/AlertLogs.js";
import { sendSMS } from "./smsService.js";

const NEAR_EXPIRY_DAYS = parseInt(process.env.NEAR_EXPIRY_DAYS || "30", 10);
const LOW_STOCK_DEFAULT = parseInt(
  process.env.LOW_STOCK_DEFAULT_THRESHOLD || "50",
  10
);
const COOLDOWN_HOURS = parseInt(process.env.ALERT_COOLDOWN_HOURS || "12", 10);

// ---------- HELPERS ----------

function normalizePhone(raw) {
  if (!raw) return null;
  let phone = String(raw).replace(/[\s\-()]/g, "");

  if (phone.startsWith("0")) {
    phone = "+63" + phone.slice(1);
  } else if (phone.startsWith("63") && !phone.startsWith("+")) {
    phone = "+" + phone;
  } else if (!phone.startsWith("+")) {
    phone = "+" + phone;
  }

  return /^\+[0-9]{10,15}$/.test(phone) ? phone : null;
}

async function getAdminRecipients() {
  console.log("\n[InventoryAlert] --- STEP 1: Fetching admin recipients ---");

  const admins = await User.find({
    role: "Admin",
    status: "Active",
    phoneNumber: { $exists: true, $nin: [null, ""] },
  })
    .select("_id username fullName phoneNumber")
    .lean();

  console.log(
    `[InventoryAlert] Found ${admins.length} Active Admin(s) with a phone number in DB.`
  );

  const recipients = [];
  for (const a of admins) {
    const phone = normalizePhone(a.phoneNumber);
    if (phone) {
      console.log(
        `[InventoryAlert]   OK: Admin "${a.username}" (${a.fullName || "no name"}) -> ${phone}`
      );
      recipients.push({ ...a, phoneNumber: phone });
    } else {
      console.warn(
        `[InventoryAlert]   SKIP: Admin "${a.username}" -- invalid phone: "${a.phoneNumber}"`
      );
    }
  }

  console.log(
    `[InventoryAlert] ${recipients.length} valid recipient(s) after normalization.`
  );
  return recipients;
}

async function getStockRecipients(settings) {
  if (!settings.stockAlertsEnabled) return [];

  const roles = [];
  if (settings.reorderNotifySupervisor) roles.push("Admin");
  if (settings.reorderNotifyStaff && settings.notifyStaffStock) {
    roles.push("Staff");
  }

  const users = roles.length
    ? await User.find({
        role: { $in: roles },
        status: "Active",
        phoneNumber: { $exists: true, $nin: [null, ""] },
      })
        .select("_id username fullName role phoneNumber")
        .lean()
    : [];

  const recipients = [];
  for (const user of users) {
    const phone = normalizePhone(user.phoneNumber);
    if (phone) {
      recipients.push({
        ...user,
        phoneNumber: phone,
        recipientName: user.username,
      });
    } else {
      console.warn(
        `[InventoryAlert] Skipping ${user.role} "${user.username}" -- invalid phone: "${user.phoneNumber}"`
      );
    }
  }

  if (settings.reorderNotifyOwner && settings.ownerNumber) {
    const phone = normalizePhone(settings.ownerNumber);
    if (phone) {
      recipients.push({
        _id: "owner",
        username: "Owner",
        recipientName: "Owner",
        phoneNumber: phone,
      });
    } else {
      console.warn(
        `[InventoryAlert] Skipping Owner -- invalid phone: "${settings.ownerNumber}"`
      );
    }
  }

  return [
    ...new Map(
      recipients.map((recipient) => [recipient.phoneNumber, recipient])
    ).values(),
  ];
}

async function wasRecentlyAlerted(batchId, alertType) {
  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await AlertLog.findOne({
    batchId,
    alertType,
    sentAt: { $gte: cutoff },
  }).lean();

  if (existing) {
    console.log(
      `[InventoryAlert]   Skipping ${alertType} for ${batchId} -- already alerted at ${existing.sentAt.toISOString()} (cooldown ${COOLDOWN_HOURS}h)`
    );
  }
  return !!existing;
}

async function logAlert(batchId, alertType) {
  await AlertLog.create({ batchId, alertType });
  console.log(`[InventoryAlert]   AlertLog saved: ${alertType} / ${batchId}`);
}

// ---------- MAIN (FULL SCAN) ----------

export async function runInventoryAlertCheck({ force = false } = {}) {
  console.log("\n========================================================");
  console.log("   INVENTORY ALERT CHECK - START");
  console.log("========================================================");
  console.log(
    `[InventoryAlert] force=${force} | NEAR_EXPIRY_DAYS=${NEAR_EXPIRY_DAYS} | LOW_STOCK_DEFAULT=${LOW_STOCK_DEFAULT} | COOLDOWN_HOURS=${COOLDOWN_HOURS}`
  );

  const settings = (await Settings.findOne().lean()) || {};
  const stockSettings = {
    stockAlertsEnabled: settings.stockAlertsEnabled ?? true,
    notifyStaffStock: settings.notifyStaffStock ?? true,
    reorderNotifyOwner: settings.reorderNotifyOwner ?? true,
    reorderNotifySupervisor: settings.reorderNotifySupervisor ?? true,
    reorderNotifyStaff: settings.reorderNotifyStaff ?? true,
    ownerNumber: settings.ownerNumber ?? "",
  };
  const recipients = await getAdminRecipients();
  const stockRecipients = await getStockRecipients(stockSettings);

  if (recipients.length === 0 && stockRecipients.length === 0) {
    console.error(
      "[InventoryAlert] No enabled inventory-alert recipients with valid phone numbers found -- skipping."
    );
    return { skipped: true, reason: "No inventory alert recipients" };
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const nearExpiryCutoff = new Date(now);
  nearExpiryCutoff.setDate(now.getDate() + NEAR_EXPIRY_DAYS);
  nearExpiryCutoff.setHours(23, 59, 59, 999);

  const relevantStatuses = ["pending", "stored", "for disposal"];

  console.log(
    `[InventoryAlert] Date window: todayStart=${todayStart.toISOString()} | nearExpiryCutoff=${nearExpiryCutoff.toISOString()}`
  );
  console.log(
    `[InventoryAlert] Relevant batch statuses: ${relevantStatuses.join(", ")}`
  );

  const alerts = [];

  // ---------- 1. EXPIRED ----------
  console.log("\n[InventoryAlert] --- STEP 2: Checking EXPIRED batches ---");
  const expiredBatches = await Batch.find({
    expirationDate: { $ne: null, $lt: todayStart },
    status: { $in: relevantStatuses },
    quantity: { $gt: 0 },
  }).lean();

  console.log(
    `[InventoryAlert] Found ${expiredBatches.length} candidate expired batch(es).`
  );

  for (const b of expiredBatches) {
    console.log(
      `[InventoryAlert]   - ${b.itemName} (${b.itemCode}) | batch ${b.batchCode} | exp ${new Date(b.expirationDate).toISOString().split("T")[0]} | qty ${b.quantity} | status ${b.status}`
    );
    if (!force && (await wasRecentlyAlerted(b._id, "expired"))) continue;

    const daysPast = Math.floor((now - new Date(b.expirationDate)) / 86400000);
    alerts.push({
      batch: b,
      type: "expired",
      message:
        `Premiumed Enterprises\n` +
        `EXPIRED BATCH ALERT\n` +
        `Item: ${b.itemName} (${b.itemCode})\n` +
        `Batch: ${b.batchCode}\n` +
        `Expired: ${new Date(b.expirationDate).toISOString().split("T")[0]} (${daysPast}d ago)\n` +
        `Qty: ${b.quantity} ${b.unitType || ""}\n` +
        `Location: ${b.storageLocation}`,
    });
  }
  console.log(`[InventoryAlert] Queued ${alerts.length} expired alert(s).`);

  // ---------- 2. NEAR EXPIRY ----------
  console.log(
    "\n[InventoryAlert] --- STEP 3: Checking NEAR-EXPIRY batches ---"
  );
  const nearExpiryBatches = await Batch.find({
    expirationDate: { $gte: todayStart, $lte: nearExpiryCutoff },
    status: { $in: relevantStatuses },
    quantity: { $gt: 0 },
  }).lean();

  console.log(
    `[InventoryAlert] Found ${nearExpiryBatches.length} candidate near-expiry batch(es).`
  );

  const beforeNearExpiry = alerts.length;
  for (const b of nearExpiryBatches) {
    console.log(
      `[InventoryAlert]   - ${b.itemName} (${b.itemCode}) | batch ${b.batchCode} | exp ${new Date(b.expirationDate).toISOString().split("T")[0]} | qty ${b.quantity} | status ${b.status}`
    );
    if (!force && (await wasRecentlyAlerted(b._id, "near_expiry"))) continue;

    const daysLeft = Math.ceil((new Date(b.expirationDate) - now) / 86400000);
    alerts.push({
      batch: b,
      type: "near_expiry",
      message:
        `Premiumed Enterprises\n` +
        `NEAR EXPIRY ALERT\n` +
        `Item: ${b.itemName} (${b.itemCode})\n` +
        `Batch: ${b.batchCode}\n` +
        `Expires: ${new Date(b.expirationDate).toISOString().split("T")[0]} (in ${daysLeft}d)\n` +
        `Qty: ${b.quantity} ${b.unitType || ""}\n` +
        `Location: ${b.storageLocation}`,
    });
  }
  console.log(
    `[InventoryAlert] Queued ${alerts.length - beforeNearExpiry} near-expiry alert(s).`
  );

  // ---------- 3. LOW STOCK (based on Product.totalQuantity) ----------
  console.log(
    "\n[InventoryAlert] --- STEP 4: Checking LOW-STOCK products (using totalQuantity) ---"
  );

  const lowStockProducts = stockSettings.stockAlertsEnabled
    ? await Product.find({
        isKit: false,
        $expr: {
          $lte: [
            { $ifNull: ["$totalQuantity", 0] },
            { $ifNull: ["$reorderLevel", LOW_STOCK_DEFAULT] },
          ],
        },
      })
        .select("name itemCode unitType reorderLevel totalQuantity")
        .lean()
    : [];

  console.log(
    `[InventoryAlert] Found ${lowStockProducts.length} product(s) at or below reorder level.`
  );

  const beforeLowStock = alerts.length;
  for (const p of lowStockProducts) {
    console.log(
      `[InventoryAlert]   - ${p.name} (${p.itemCode}) | totalQuantity ${p.totalQuantity} | reorderLevel ${p.reorderLevel} | unit ${p.unitType || "N/A"}`
    );
    if (!force && (await wasRecentlyAlerted(p._id, "low_stock"))) continue;

    alerts.push({
      batch: { _id: p._id, itemName: p.name, itemCode: p.itemCode },
      type: "low_stock",
      message:
        `Premiumed Enterprises\n` +
        `LOW STOCK ALERT\n` +
        `Item: ${p.name} (${p.itemCode})\n` +
        `Stock: ${p.totalQuantity} ${p.unitType || ""}\n` +
        `Reorder level: ${p.reorderLevel || LOW_STOCK_DEFAULT}\n` +
        `Please restock soon.`,
    });
  }
  console.log(
    `[InventoryAlert] Queued ${alerts.length - beforeLowStock} low-stock alert(s).`
  );

  // ---------- SUMMARY BEFORE SENDING ----------
  console.log("\n[InventoryAlert] --- STEP 5: Alert queue summary ---");
  console.log(`[InventoryAlert] Total alerts to send: ${alerts.length}`);
  console.log(`[InventoryAlert] Expiry recipients: ${recipients.length}`);
  console.log(`[InventoryAlert] Low-stock recipients: ${stockRecipients.length}`);

  if (alerts.length === 0) {
    console.log("[InventoryAlert] No alerts to send. Exiting.");
    console.log("========================================================");
    console.log("   INVENTORY ALERT CHECK - COMPLETE (0 alerts)");
    console.log("========================================================\n");
    return {
      sent: 0,
      failed: 0,
      totalAlerts: 0,
      totalRecipients: recipients.length + stockRecipients.length,
      results: [],
    };
  }

  // ---------- SEND ----------
  console.log("\n[InventoryAlert] --- STEP 6: Sending SMS ---");
  const results = [];
  let alertIndex = 0;

  for (const alert of alerts) {
    alertIndex++;
    console.log(
      `\n[InventoryAlert] [${alertIndex}/${alerts.length}] ${alert.type.toUpperCase()} - ${alert.batch.itemName} (${alert.batch.itemCode})`
    );
    console.log(
      `[InventoryAlert]   Message preview: "${alert.message.replace(/\n/g, " | ")}"`
    );

    const alertRecipients =
      alert.type === "low_stock" ? stockRecipients : recipients;
    if (alertRecipients.length === 0) {
      console.log(
        `[InventoryAlert] No enabled recipients for ${alert.type}; skipping delivery.`
      );
      continue;
    }

    for (const recipient of alertRecipients) {
      try {
        console.log(
          `[InventoryAlert]   -> Sending to ${recipient.username} (${recipient.phoneNumber})...`
        );
        const resp = await sendSMS(recipient.phoneNumber, alert.message);
        console.log(
          `[InventoryAlert]   SENT to ${recipient.username} (${recipient.phoneNumber}) -- API response:`,
          JSON.stringify(resp)
        );
        results.push({
          type: alert.type,
          item: alert.batch.itemName,
          admin: recipient.recipientName || recipient.username,
          sent: true,
        });
      } catch (err) {
        console.error(
          `[InventoryAlert]   FAILED to ${recipient.username} (${recipient.phoneNumber}):`
        );
        console.error("     Message:", err.message);
        if (err.response) {
          console.error("     HTTP status:", err.response.status);
          console.error(
            "     Response body:",
            JSON.stringify(err.response.data, null, 2)
          );
          console.error(
            "     Response headers:",
            JSON.stringify(err.response.headers, null, 2)
          );
        }
        if (err.config) {
          console.error(
            "     Request payload sent:",
            JSON.stringify(err.config.data, null, 2)
          );
        }
        results.push({
          type: alert.type,
          item: alert.batch.itemName,
          admin: recipient.recipientName || recipient.username,
          sent: false,
          error: err.message,
        });
      }
    }

    await logAlert(alert.batch._id, alert.type);
  }

  const sentCount = results.filter((r) => r.sent).length;
  const failedCount = results.filter((r) => !r.sent).length;

  console.log("\n========================================================");
  console.log("   INVENTORY ALERT CHECK - COMPLETE");
  console.log("========================================================");
  console.log(`[InventoryAlert] Alerts processed : ${alerts.length}`);
  console.log(`[InventoryAlert] SMS sent         : ${sentCount}`);
  console.log(`[InventoryAlert] SMS failed       : ${failedCount}`);
  console.log(
    `[InventoryAlert] Recipients       : ${recipients.length + stockRecipients.length}`
  );
  console.log("");

  return {
    sent: sentCount,
    failed: failedCount,
    totalAlerts: alerts.length,
    totalRecipients: recipients.length + stockRecipients.length,
    results,
  };
}

// ---------- TARGETED CHECK: SINGLE BATCH ----------

export async function checkBatchById(batchId) {
  try {
    const batch = await Batch.findById(batchId).lean();
    if (!batch) return { skipped: true, reason: "Batch not found" };

    const recipients = await getAdminRecipients();
    if (recipients.length === 0) {
      console.log("[InventoryAlert] (event) No admin recipients -- skipping.");
      return { skipped: true, reason: "No admin recipients" };
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const nearExpiryCutoff = new Date(now);
    nearExpiryCutoff.setDate(now.getDate() + NEAR_EXPIRY_DAYS);
    nearExpiryCutoff.setHours(23, 59, 59, 999);

    const relevantStatuses = ["pending", "stored", "for disposal"];
    if (!relevantStatuses.includes(batch.status)) {
      console.log(
        `[InventoryAlert] (event) Batch ${batch.batchCode} status "${batch.status}" not alertable. Skipping.`
      );
      return { skipped: true, reason: "Status not relevant" };
    }
    if (!batch.quantity || batch.quantity <= 0) {
      console.log(
        `[InventoryAlert] (event) Batch ${batch.batchCode} qty 0. Skipping.`
      );
      return { skipped: true, reason: "Zero quantity" };
    }

    let alertType = null;
    let message = null;

    if (batch.expirationDate && new Date(batch.expirationDate) < todayStart) {
      const daysPast = Math.floor(
        (now - new Date(batch.expirationDate)) / 86400000
      );
      alertType = "expired";
      message =
        `Premiumed Enterprises\n` +
        `EXPIRED BATCH ALERT\n` +
        `Item: ${batch.itemName} (${batch.itemCode})\n` +
        `Batch: ${batch.batchCode}\n` +
        `Expired: ${new Date(batch.expirationDate).toISOString().split("T")[0]} (${daysPast}d ago)\n` +
        `Qty: ${batch.quantity} ${batch.unitType || ""}\n` +
        `Location: ${batch.storageLocation}`;
    } else if (
      batch.expirationDate &&
      new Date(batch.expirationDate) >= todayStart &&
      new Date(batch.expirationDate) <= nearExpiryCutoff
    ) {
      const daysLeft = Math.ceil(
        (new Date(batch.expirationDate) - now) / 86400000
      );
      alertType = "near_expiry";
      message =
        `Premiumed Enterprises\n` +
        `NEAR EXPIRY ALERT\n` +
        `Item: ${batch.itemName} (${batch.itemCode})\n` +
        `Batch: ${batch.batchCode}\n` +
        `Expires: ${new Date(batch.expirationDate).toISOString().split("T")[0]} (in ${daysLeft}d)\n` +
        `Qty: ${batch.quantity} ${batch.unitType || ""}\n` +
        `Location: ${batch.storageLocation}`;
    }

    if (!alertType) {
      console.log(
        `[InventoryAlert] (event) Batch ${batch.batchCode} OK -- no expiry alert.`
      );
      return { skipped: true, reason: "No expiry issue" };
    }

    // Cooldown check
    if (await wasRecentlyAlerted(batch._id, alertType)) {
      return { skipped: true, reason: "Cooldown active" };
    }

    // Send
    const results = [];
    for (const admin of recipients) {
      try {
        await sendSMS(admin.phoneNumber, message);
        console.log(
          `[InventoryAlert] (event) ${alertType} SMS sent to ${admin.username} for batch ${batch.batchCode}`
        );
        results.push({ admin: admin.username, sent: true });
      } catch (err) {
        console.error(
          `[InventoryAlert] (event) ${alertType} failed for ${admin.username} (${admin.phoneNumber}):`
        );
        console.error("     Message:", err.message);
        if (err.response) {
          console.error("     HTTP status:", err.response.status);
          console.error(
            "     Response body:",
            JSON.stringify(err.response.data, null, 2)
          );
          console.error(
            "     Response headers:",
            JSON.stringify(err.response.headers, null, 2)
          );
        }
        if (err.config) {
          console.error(
            "     Request payload sent:",
            JSON.stringify(err.config.data, null, 2)
          );
        }
        results.push({ admin: admin.username, sent: false, error: err.message });
      }
    }
    await logAlert(batch._id, alertType);
    return {
      sent: results.filter((r) => r.sent).length,
      failed: results.filter((r) => !r.sent).length,
      alertType,
    };
  } catch (err) {
    console.error("[InventoryAlert] (event) checkBatchById error:", err);
    return { error: err.message };
  }
}

// ---------- TARGETED CHECK: SINGLE PRODUCT (LOW STOCK) ----------

export async function checkProductStock(itemCode) {
  try {
    const settings = (await Settings.findOne().lean()) || {};
    const stockSettings = {
      stockAlertsEnabled: settings.stockAlertsEnabled ?? true,
      notifyStaffStock:
        settings.notifyStaffStock ?? settings.reorderNotifyStaff ?? true,
      reorderNotifyOwner: settings.reorderNotifyOwner ?? true,
      reorderNotifySupervisor: settings.reorderNotifySupervisor ?? true,
      reorderNotifyStaff: settings.reorderNotifyStaff ?? true,
      ownerNumber: settings.ownerNumber ?? "",
    };
    if (!stockSettings.stockAlertsEnabled) {
      return { skipped: true, reason: "Stock alerts disabled" };
    }

    const product = await Product.findOne({ itemCode, isKit: false })
      .select("name itemCode unitType reorderLevel totalQuantity")
      .lean();

    if (!product) {
      console.log(
        `[InventoryAlert] (event) Product ${itemCode} not found or is a kit. Skipping.`
      );
      return { skipped: true, reason: "Product not found or is kit" };
    }

    const threshold = product.reorderLevel ?? LOW_STOCK_DEFAULT;
    const currentQty = product.totalQuantity ?? 0;

    if (currentQty > threshold) {
      console.log(
        `[InventoryAlert] (event) Product ${itemCode} OK (${currentQty} > ${threshold}).`
      );
      return { skipped: true, reason: "Above reorder level" };
    }

    const recipients = await getStockRecipients(stockSettings);
    if (recipients.length === 0) {
      console.log(
        "[InventoryAlert] (event) No enabled stock-alert recipients -- skipping."
      );
      return { skipped: true, reason: "No stock alert recipients" };
    }

    if (await wasRecentlyAlerted(product._id, "low_stock")) {
      return { skipped: true, reason: "Cooldown active" };
    }

    const message =
      `Premiumed Enterprises\n` +
      `LOW STOCK ALERT\n` +
      `Item: ${product.name} (${product.itemCode})\n` +
      `Stock: ${currentQty} ${product.unitType || ""}\n` +
      `Reorder level: ${threshold}\n` +
      `Please restock soon.`;

    const results = [];
    for (const admin of recipients) {
      try {
        await sendSMS(admin.phoneNumber, message);
        console.log(
          `[InventoryAlert] (event) low_stock SMS sent to ${admin.username} for ${product.itemCode}`
        );
        results.push({
          admin: admin.recipientName || admin.username,
          sent: true,
        });
      } catch (err) {
        console.error(
          `[InventoryAlert] (event) low_stock failed for ${admin.username} (${admin.phoneNumber}):`
        );
        console.error("     Message:", err.message);
        if (err.response) {
          console.error("     HTTP status:", err.response.status);
          console.error(
            "     Response body:",
            JSON.stringify(err.response.data, null, 2)
          );
          console.error(
            "     Response headers:",
            JSON.stringify(err.response.headers, null, 2)
          );
        }
        if (err.config) {
          console.error(
            "     Request payload sent:",
            JSON.stringify(err.config.data, null, 2)
          );
        }
        results.push({
          admin: admin.recipientName || admin.username,
          sent: false,
          error: err.message,
        });
      }
    }
    await logAlert(product._id, "low_stock");
    return {
      sent: results.filter((r) => r.sent).length,
      failed: results.filter((r) => !r.sent).length,
    };
  } catch (err) {
    console.error("[InventoryAlert] (event) checkProductStock error:", err);
    return { error: err.message };
  }
}