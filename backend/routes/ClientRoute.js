import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import ClientRequest from "../models/ClientRequest.js";
import createActivityLog from "../utils/createActivityLogs.js";
import Order from "../models/Order.js";
import { ObjectId } from "mongodb";
import {
  sendEmailWithRetry,
  getDepositSlipRejectedEmail,
} from "../utils/emailService.js";

const router = express.Router();

const getActor = (req) => ({
  userId: req.actor?.userId || null,
  username: req.actor?.username || "Unknown",
  role: req.actor?.role || "Unknown",
});

router.post("/register-request", async (req, res) => {
  try {
    const newRequest = new ClientRequest(req.body);
    await newRequest.save();

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || req.body.username || "Unknown",
      role: actor.role || "Client",
      action: "Create client",
      module: "Client Management",
      description: `Client request for "${req.body.dialysisCenterName || req.body.username || "a new client"}" was submitted.`,
    });

    res.status(201).json({ message: "Application submitted for review!" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/requests", async (req, res) => {
  try {
    const requests = await ClientRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/client/check-username?username=xxx
router.get("/check-username", async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    const exists = await User.findOne({ username });
    return res.status(200).json({ exists: !!exists });
  } catch (err) {
    console.error("Check username error:", err);
    res.status(500).json({ error: "Failed to check username." });
  }
});

router.post("/approve-client", async (req, res) => {
  const { requestId, username, password } = req.body;

  try {
    // 1. Validate
    if (!requestId || !username || !password) {
      return res.status(400).json({
        success: false,
        error: "requestId, username, and password are required.",
      });
    }

    // 2. Find the request
    const requestData = await ClientRequest.findById(requestId);
    if (!requestData) {
      return res
        .status(404)
        .json({ success: false, error: "Request not found." });
    }

    if (requestData.status === "APPROVED") {
      return res.status(409).json({
        success: false,
        error: "This request has already been approved.",
      });
    }

    // 3. Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        error: "Username already exists. Please try again.",
      });
    }

    // 4. Check if email already exists (using the email from the request)
    const normalizedEmail = (requestData.email || "").toLowerCase().trim();
    if (normalizedEmail) {
      const existingEmail = await User.findOne({ email: normalizedEmail });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: "A user with this email already exists.",
        });
      }
    }

    // 5. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 6. Create the user
    const newUser = new User({
      username,
      password: hashedPassword,
      role: "User",
      status: "Active",

      // FACILITY INFO
      fullName: requestData.dialysisCenterName,
      facilityType: requestData.facilityType || "Standalone Dialysis Center",
      yearEstablished: requestData.yearEstablished || "N/A",
      registrationNumber: requestData.registrationNumber || "N/A",
      machines: Number(requestData.machines) || 0,
      address: requestData.address || "N/A",
      phoneNumber: requestData.mobile,
      landline: requestData.landline || "N/A",
      email: normalizedEmail,

      // OWNERSHIP & PERSONNEL
      ownership: requestData.ownership || "Private",
      ownerName: requestData.ownerName || "N/A",
      medicalDirector: requestData.medicalDirector || "N/A",
      nephrologist: requestData.nephrologist || "N/A",
      unitManager: requestData.unitManager || "N/A",

      // PROCUREMENT
      purchasingContact: requestData.purchasingContact || "N/A",
      designation: requestData.designation || "N/A",
      procurementMobile: requestData.procurementMobile || "N/A",
      procurementEmail: requestData.procurementEmail || "N/A",
    });

    // 7. Save (catch race-condition duplicates as a safety net)
    try {
      await newUser.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return res.status(409).json({
          success: false,
          error: "Username or email already exists.",
        });
      }
      throw saveErr;
    }

    // 8. Mark the request as approved
    requestData.status = "APPROVED";
    await requestData.save();

    // 9. Activity log
    try {
      const actor = getActor(req);
      await createActivityLog({
        userId: actor.userId,
        username: actor.username || username,
        role: actor.role || "Admin",
        action: "Approve client",
        module: "Client Management",
        description: `Client account "${username}" was approved and activated.`,
      });
    } catch (logErr) {
      console.error("Activity log error:", logErr);
    }

    res.status(200).json({
      success: true,
      message: "Account activated and password hashed successfully!",
      emailSent: false,
    });
  } catch (err) {
    console.error("Approval Error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to approve client.",
    });
  }
});

const verifyAndInvalidateToken = async (token) => {
  try {
    const order = await Order.findOne({
      rejectToken: token,
      rejectTokenExpiry: { $gt: new Date() },
    });

    if (!order) return null;

    // Invalidate the token so it can't be reused
    order.rejectToken = null;
    order.rejectTokenExpiry = null;
    await order.save();

    return order;
  } catch (e) {
    console.error("Token verification failed:", e.message);
    return null;
  }
};

const renderDepositStatusPage = ({
  statusCode = 200,
  tone = "success",
  title,
  message,
  url,
}) => {
  const toneStyles = {
    success: {
      accent: "#1f6f42",
      accentSoft: "#eaf8ee",
      icon: "#1b8d5a",
      badge: "#edf9f0",
      label: "Completed",
    },
    error: {
      accent: "#b42318",
      accentSoft: "#fff1f1",
      icon: "#d92d20",
      badge: "#fef3f2",
      label: "Invalid or expired",
    },
  };

  const palette = toneStyles[tone] || toneStyles.success;
  const statusIcon =
    tone === "error"
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5L9.2 16.7L19 6.9"/></svg>`;

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Deposit Status</title>
      <style>
        :root {
          --page-bg: #f3f4ee;
          --chrome-bg: #e6e9e1;
          --chrome-border: #cad2c7;
          --surface: rgba(255,255,255,0.22);
          --text: #111111;
          --muted: #4a4f4a;
          --badge-bg: #eef3eb;
          --shadow: rgba(15, 16, 12, 0.08);
        }

        * { box-sizing: border-box; }

        html, body {
          margin: 0;
          min-height: 100%;
          background: var(--page-bg);
          color: var(--text);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        body {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .browser-shell {
          width: 100%;
          min-height: 100vh;
          background: var(--page-bg);
        }
        .nav-group {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 112px;
          justify-content: flex-start;
        }

        .nav-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: var(--text);
          opacity: 0.8;
          cursor: default;
        }

        .nav-btn svg {
          width: 18px;
          height: 18px;
          stroke: currentColor;
          stroke-width: 2.6;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .address-wrap {
          flex: 1;
          max-width: 100%;
          padding: 0 12px;
        }

        .address-bar {
          width: 100%;
          height: 42px;
          background: rgba(255,255,255,0.22);
          border: 1px solid rgba(20, 23, 18, 0.08);
          border-radius: 999px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 16px;
          box-shadow: inset 0 1px rgba(255,255,255,0.4);
          overflow: hidden;
        }

        .address-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #1c1d1b;
          flex-shrink: 0;
        }

        .address-icon svg {
          width: 18px;
          height: 18px;
          stroke: currentColor;
          stroke-width: 2.2;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .address-text {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 18px;
          color: rgba(18, 18, 18, 0.8);
          letter-spacing: -0.02em;
        }

        .page-body {
          max-width: 1500px;
          width: 100%;
          margin: 0 auto;
          padding: 42px 24px 0 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .status-meta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 8px 14px;
          background: ${palette.accentSoft};
          border: 1px solid rgba(26, 34, 25, 0.08);
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: ${palette.accent};
          margin-bottom: 28px;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${palette.icon};
          box-shadow: 0 0 0 4px rgba(17, 17, 17, 0.04);
        }

        .status-visual {
          width: 98px;
          height: 98px;
          border-radius: 50%;
          background: ${palette.accentSoft};
          display: grid;
          place-items: center;
          color: ${palette.icon};
          box-shadow: 0 12px 28px rgba(17, 17, 17, 0.06);
          margin-bottom: 22px;
          border: 1px solid rgba(0,0,0,0.04);
        }

        .status-visual svg {
          width: 42px;
          height: 42px;
          stroke: currentColor;
          stroke-width: 2.8;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        h1 {
          margin: 0;
          font-size: clamp(2.5rem, 3vw, 4.2rem);
          line-height: 1.04;
          letter-spacing: -0.06em;
          font-weight: 800;
          color: #101010;
        }

        .status-copy {
          margin-top: 18px;
          max-width: 760px;
          color: rgba(17,17,17,0.72);
          font-size: 1.05rem;
          line-height: 1.6;
        }

        @media (max-width: 640px) {
          .address-bar {
            height: 38px;
            padding: 0 10px;
          }

          .address-text {
            font-size: 12px;
          }

          .page-body {
            padding-left: 18px;
            padding-right: 18px;
          }
        }
      </style>
    </head>
    <body>
      <div class="browser-shell">
        <main class="page-body">
          <div class="status-visual" aria-label="Status icon">${statusIcon}</div>

          <div class="status-meta">
            <span class="status-dot" aria-hidden="true"></span>
            <span>${palette.label}</span>
          </div>

          <h1>${title}</h1>
          ${message ? `<div class="status-copy">${message}</div>` : ""}
        </main>
      </div>
    </body>
  </html>`;
};

router.get("/reject-deposit", async (req, res) => {
  const { token } = req.query;
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  if (!token) {
    return res.status(400).send(
      renderDepositStatusPage({
        statusCode: 400,
        tone: "error",
        title: "Missing secure token.",
        message:
          "This rejection link is incomplete or expired. Please request a fresh link and try again.",
        url: fullUrl,
      }),
    );
  }

  // 1. Verify token + invalidate it
  const order = await verifyAndInvalidateToken(token);
  if (!order) {
    return res.status(400).send(
      renderDepositStatusPage({
        statusCode: 400,
        tone: "error",
        title: "This link is invalid or expired.",
        message:
          "The payment slip rejection has already been processed or the secure token is no longer valid.",
        url: fullUrl,
      }),
    );
  }

  // 2. Perform DB update
  try {
    await Order.updateOne(
      { _id: order._id },
      { $set: { paymentStatus: "REJECTED", paymentslip: "" } },
    );

    // 3. Look up the client's email via the order's username
    const orderRef =
      order.orderNumber || order.orderId || order._id?.toString();

    try {
      let clientEmail = null;
      let clientName =
        order.customerName || order.clientName || order.name || "Customer";

      // Try order.username first — most likely field
      const username = order.username || order.clientUsername;

      if (username) {
        const user = await User.findOne({ username })
          .select("email fullName username")
          .lean();
        if (user) {
          clientEmail = user.email;
          clientName = user.fullName || user.username || clientName;
        }
      }

      // Fallback: if order has a direct email field anywhere
      if (!clientEmail) {
        clientEmail =
          order.email ||
          order.clientEmail ||
          order.customerEmail ||
          order.procurementEmail ||
          null;
      }

      if (clientEmail && clientEmail.includes("@")) {
        const { subject, html } = getDepositSlipRejectedEmail({
          username: clientName,
          orderId: orderRef,
          actionUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/orders/${order._id}`,
        });

        const emailResult = await sendEmailWithRetry({
          sender: {
            name: "Premiumed Enterprises",
            email: process.env.SYSTEM_EMAIL,
          },
          to: [{ email: clientEmail }],
          subject,
          htmlContent: html,
        });

        if (!emailResult.success) {
          console.error("Failed to send rejection email:", emailResult.error);
        }
      } else {
        console.warn(
          `Order ${orderRef} has no resolvable client email (username: ${username || "N/A"}) — skipping notification.`,
        );
      }
    } catch (emailErr) {
      // Don't fail the whole request just because the email failed
      console.error("Error sending rejection email:", emailErr.message);
    }

    return res.status(200).send(
      renderDepositStatusPage({
        statusCode: 200,
        tone: "success",
        title: "Payment slip rejected successfully.",
        message:
          "The payment record has been updated and the client has been notified.",
        url: fullUrl,
      }),
    );
  } catch (error) {
    console.error("Reject payment slip update failed:", error);
    return res.status(500).send(
      renderDepositStatusPage({
        statusCode: 500,
        tone: "error",
        title: "Something went wrong.",
        message:
          "We couldn't update the payment record. Please try again or contact support.",
        url: fullUrl,
      }),
    );
  }
});
export default router;
