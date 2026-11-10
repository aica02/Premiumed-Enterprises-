// Pay-after-delivery: payment due dates, overdue alerts, the accountant
// reminder for unreviewed slips, and the admin alerts for clients who order
// while overdue or who apply for an account.
//
// Client reminders: days 7, 14 and 21 after delivery ("payment due on"),
// then day 30 and every 7 days after while unpaid ("payment overdue").
// The alert job runs at server start and then every hour. Render's free plan
// puts the server to sleep, so a once-a-day timer could skip days; every
// alert records when it was sent, so an hourly run never repeats one.

import Order from "../models/Order.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import Notification from "../models/NotificationClient.js";
import NotificationAdmin from "../models/NotificationAdmin.js";
import { sendSMS } from "./smsService.js";
import { getAdminRecipients } from "./inventoryAlertService.js";
import {
  createDepositReviewLinks,
  sendPaymentDueReminderEmail,
  sendPaymentOverdueEmail,
  sendSlipReviewReminder,
  sendClientApplicationEmail,
} from "./emailService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const PAYMENT_TERM_DAYS = 30;
// Friendly reminders before the due date, counted from delivery.
export const DUE_REMINDER_DAYS = [7, 14, 21];
export const OVERDUE_EMAIL_INTERVAL_DAYS = 7;
export const SLIP_REVIEW_REMINDER_DAYS = 3;
const JOB_INTERVAL_MS = 60 * 60 * 1000; // hourly

export const computePaymentDueDate = (deliveredDate) =>
  new Date(new Date(deliveredDate).getTime() + PAYMENT_TERM_DAYS * DAY_MS);

// An order is overdue when it was delivered, its due date has passed, and no
// slip is paid or waiting for review. A rejected slip counts as unpaid.
export const overdueOrderFilter = (now = new Date()) => ({
  status: "DELIVERED",
  paymentDueDate: { $ne: null, $lte: now },
  paymentStatus: { $nin: ["COMPLETED", "AWAITING REVIEW"] },
});

export const isOrderOverdue = (order, now = new Date()) =>
  order?.status === "DELIVERED" &&
  Boolean(order.paymentDueDate) &&
  new Date(order.paymentDueDate) <= now &&
  !["COMPLETED", "AWAITING REVIEW"].includes(order.paymentStatus);

export async function findOverdueOrdersForClient(username) {
  if (!username) return [];
  return Order.find({ username, ...overdueOrderFilter() })
    .select("orderId name total deliveredDate paymentDueDate paymentStatus")
    .sort({ paymentDueDate: 1 })
    .lean();
}

const daysPast = (date, now = new Date()) =>
  Math.max(0, Math.floor((now - new Date(date)) / DAY_MS));

async function getAdminEmails() {
  const admins = await User.find({
    role: "Admin",
    status: "Active",
    email: { $exists: true, $nin: [null, ""] },
  })
    .select("email")
    .lean();
  return [...new Set(admins.map((a) => String(a.email).trim()).filter(Boolean))];
}

async function getClientEmail(username) {
  if (!username) return null;
  const user = await User.findOne({ username }).select("email").lean();
  return user?.email || null;
}

// ---------- client reminders at day 7, 14, 21 (before the due date) ----------

// Delivered orders still inside the 30-day window, at least 7 days after
// delivery, with no slip sent or accepted.
export const dueReminderFilter = (now = new Date()) => ({
  status: "DELIVERED",
  paymentDueDate: { $ne: null, $gt: now },
  deliveredDate: {
    $ne: null,
    $lte: new Date(now.getTime() - DUE_REMINDER_DAYS[0] * DAY_MS),
  },
  paymentStatus: { $nin: ["COMPLETED", "AWAITING REVIEW"] },
});

// The latest reminder day (7, 14 or 21) that has come due, as a date, or
// null if none has. After downtime only that one reminder goes out.
const latestDueReminderSlot = (deliveredDate, now) => {
  const delivered = new Date(deliveredDate).getTime();
  let slot = null;
  for (const day of DUE_REMINDER_DAYS) {
    const at = delivered + day * DAY_MS;
    if (at <= now.getTime()) slot = new Date(at);
  }
  return slot;
};

async function remindClientBeforeDue(order, now) {
  const slot = latestDueReminderSlot(order.deliveredDate, now);
  if (!slot) return false;
  if (order.lastDueReminderAt && new Date(order.lastDueReminderAt) >= slot) {
    return false; // this reminder already went out
  }

  const clientEmail = await getClientEmail(order.username);
  if (clientEmail) {
    const result = await sendPaymentDueReminderEmail(order, clientEmail);
    if (!result.success) {
      // Try again on the next hourly run.
      console.error(
        `[PaymentAlert] Due reminder for ${order.orderId} failed:`,
        result.error,
      );
      return false;
    }
  } else {
    console.warn(
      `[PaymentAlert] No email for client "${order.username}" (order ${order.orderId}); in-app reminder only.`,
    );
  }

  const dueText = new Date(order.paymentDueDate).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  await Notification.create({
    name: order.name,
    orderId: order.orderId,
    message: `Reminder: payment for Order #${order.orderId} is due on ${dueText}. Please upload your payment slip.`,
  });

  await Order.updateOne(
    { _id: order._id },
    { $set: { lastDueReminderAt: now } },
  );
  return true;
}

// ---------- day-30 admin SMS (once per order) ----------

async function alertAdminsOfOverdue(order, now) {
  const days = daysPast(order.paymentDueDate, now);
  const message =
    `Premiumed: Order ${order.orderId} (${order.name}) is unpaid ` +
    `${days} day(s) past its due date. Amount: PHP ${Number(order.total || 0).toFixed(2)}.`;

  const recipients = await getAdminRecipients();
  for (const admin of recipients) {
    try {
      await sendSMS(admin.phoneNumber, message);
    } catch (err) {
      console.error(
        `[PaymentAlert] SMS to admin "${admin.username}" failed:`,
        err.message,
      );
    }
  }

  await NotificationAdmin.create({
    type: "payment-overdue",
    message: `Order #${order.orderId} (${order.name}) is past its payment due date with no accepted payment slip.`,
    orderId: order.orderId,
    clientName: order.name,
    clientUsername: order.username,
  });

  // Recorded even when an SMS failed: the in-app notification above stands,
  // and retrying every hour would repeat it.
  await Order.updateOne(
    { _id: order._id },
    { $set: { overdueSmsSentAt: now } },
  );
}

// ---------- client email at day 30, 37, 44, ... ----------

// The most recent reminder date that has come due: the due date plus a
// whole number of 7-day steps. Anchoring to the due date keeps reminders on
// the same weekday even if a run is late.
const latestReminderSlot = (paymentDueDate, now) => {
  const due = new Date(paymentDueDate).getTime();
  const step = OVERDUE_EMAIL_INTERVAL_DAYS * DAY_MS;
  const steps = Math.floor((now.getTime() - due) / step);
  return new Date(due + Math.max(0, steps) * step);
};

async function remindClientOfOverdue(order, now) {
  const slot = latestReminderSlot(order.paymentDueDate, now);
  if (order.lastOverdueEmailAt && new Date(order.lastOverdueEmailAt) >= slot) {
    return false; // this week's reminder already went out
  }

  const clientEmail = await getClientEmail(order.username);
  if (clientEmail) {
    const result = await sendPaymentOverdueEmail(order, clientEmail);
    if (!result.success) {
      // Try again on the next hourly run.
      console.error(
        `[PaymentAlert] Overdue email for ${order.orderId} failed:`,
        result.error,
      );
      return false;
    }
  } else {
    console.warn(
      `[PaymentAlert] No email for client "${order.username}" (order ${order.orderId}); in-app notice only.`,
    );
  }

  await Notification.create({
    name: order.name,
    orderId: order.orderId,
    message: `Payment for Order #${order.orderId} is overdue. Please upload your payment slip.`,
  });

  await Order.updateOne(
    { _id: order._id },
    { $set: { lastOverdueEmailAt: now } },
  );
  return true;
}

// ---------- accountant reminder for slips waiting 3 days ----------

async function remindAccountantOfSlips(now) {
  const cutoff = new Date(now.getTime() - SLIP_REVIEW_REMINDER_DAYS * DAY_MS);
  const waiting = await Order.find({
    paymentStatus: "AWAITING REVIEW",
    slipSubmittedAt: { $ne: null, $lte: cutoff },
    slipReminderSentAt: null,
  });
  if (waiting.length === 0) return 0;

  const settings = await Settings.findOne().lean();
  const accountantEmail = settings?.accountantEmail;
  if (!accountantEmail) {
    console.warn(
      `[PaymentAlert] ${waiting.length} slip(s) awaiting review, but no accountant email is set in Settings.`,
    );
    return 0;
  }

  const backendBase = process.env.BACKEND_URL || "http://localhost:5000";
  let sent = 0;
  for (const order of waiting) {
    try {
      const links = await createDepositReviewLinks(order._id);
      const slipUrl = order.paymentSlip
        ? order.paymentSlip.startsWith("http")
          ? order.paymentSlip
          : `${backendBase}${order.paymentSlip}`
        : null;
      const result = await sendSlipReviewReminder(order, accountantEmail, {
        ...links,
        slipUrl,
      });
      if (result.success) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { slipReminderSentAt: now } },
        );
        sent += 1;
      } else {
        console.error(
          `[PaymentAlert] Slip reminder for ${order.orderId} failed:`,
          result.error,
        );
      }
    } catch (err) {
      console.error(
        `[PaymentAlert] Slip reminder for ${order.orderId} failed:`,
        err.message,
      );
    }
  }
  return sent;
}

// ---------- the hourly run ----------

let running = false;

export async function runPaymentAlertCheck(now = new Date()) {
  if (running) return { skipped: true };
  running = true;
  const summary = {
    dueReminders: 0,
    adminSms: 0,
    clientEmails: 0,
    slipReminders: 0,
  };
  try {
    const upcoming = await Order.find(dueReminderFilter(now));
    for (const order of upcoming) {
      try {
        if (await remindClientBeforeDue(order, now)) {
          summary.dueReminders += 1;
        }
      } catch (err) {
        console.error(
          `[PaymentAlert] Due reminder for ${order.orderId} failed:`,
          err.message,
        );
      }
    }

    const overdue = await Order.find(overdueOrderFilter(now));
    for (const order of overdue) {
      try {
        if (!order.overdueSmsSentAt) {
          await alertAdminsOfOverdue(order, now);
          summary.adminSms += 1;
        }
        if (await remindClientOfOverdue(order, now)) {
          summary.clientEmails += 1;
        }
      } catch (err) {
        console.error(
          `[PaymentAlert] Overdue handling for ${order.orderId} failed:`,
          err.message,
        );
      }
    }
    summary.slipReminders = await remindAccountantOfSlips(now);
    return summary;
  } finally {
    running = false;
  }
}

// One-time clean-up (decision 1): orders left in PAYMENT REVIEW by the old
// flow go back to TO SHIP so drivers see them; their payment stays
// AWAITING REVIEW (or REJECTED). Safe to run on every start.
export async function migrateLegacyPaymentReviewOrders(now = new Date()) {
  await Order.updateMany(
    {
      status: "PAYMENT REVIEW",
      paymentStatus: "AWAITING REVIEW",
      slipSubmittedAt: null,
    },
    { $set: { slipSubmittedAt: now } },
  );
  const result = await Order.updateMany(
    { status: "PAYMENT REVIEW" },
    { $set: { status: "TO SHIP" } },
  );
  if (result.modifiedCount) {
    console.log(
      `[PaymentAlert] Moved ${result.modifiedCount} PAYMENT REVIEW order(s) back to TO SHIP.`,
    );
  }
}

export function startPaymentAlertJob() {
  const run = async () => {
    try {
      const summary = await runPaymentAlertCheck();
      if (!summary.skipped) {
        console.log("[PaymentAlert] Check complete:", summary);
      }
    } catch (err) {
      console.error("[PaymentAlert] Check failed:", err);
    }
  };

  // Give the server a moment to connect to MongoDB first.
  setTimeout(async () => {
    try {
      await migrateLegacyPaymentReviewOrders();
    } catch (err) {
      console.error("[PaymentAlert] PAYMENT REVIEW clean-up failed:", err);
    }
    await run();
  }, 10000);
  setInterval(run, JOB_INTERVAL_MS);
}

// ---------- alerts that are not on a timer ----------

// A client with overdue orders placed a new order. The order still goes
// through; the client and the admins each get a notification.
export async function notifyOrderPlacedWhileOverdue({ username, name, orderId }) {
  const overdue = await findOverdueOrdersForClient(username);
  if (overdue.length === 0) return [];

  const ids = overdue.map((o) => `#${o.orderId}`).join(", ");
  await Notification.create({
    name: name || overdue[0].name,
    orderId,
    message: `Order #${orderId} was placed, but you have unpaid overdue order(s): ${ids}. Please upload your payment slip.`,
  });
  await NotificationAdmin.create({
    type: "order-with-overdue",
    message: `${name || username} placed Order #${orderId} while ${overdue.length} order(s) are unpaid past due: ${ids}.`,
    orderId,
    clientName: name,
    clientUsername: username,
  });
  return overdue;
}

// A client applied for an account: email the admins and add a notification.
// No SMS (decision 4). Failures are logged and never block the application.
export async function notifyClientApplication(application) {
  const centerName =
    application.dialysisCenterName || application.username || "A new client";
  try {
    await NotificationAdmin.create({
      type: "client-application",
      message: `New client application from ${centerName}.`,
      clientName: centerName,
    });
  } catch (err) {
    console.error("[ClientApplication] Admin notification failed:", err.message);
  }

  try {
    const adminEmails = await getAdminEmails();
    const result = await sendClientApplicationEmail(application, adminEmails);
    if (!result.success) {
      console.error("[ClientApplication] Admin email failed:", result.error);
    }
  } catch (err) {
    console.error("[ClientApplication] Admin email failed:", err.message);
  }
}
