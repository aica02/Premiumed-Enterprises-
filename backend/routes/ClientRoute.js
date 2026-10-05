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
}from "../utils/emailService.js";

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


router.post("/approve-client", async (req, res) => {
  const { requestId, username, password } = req.body;

  try {
    const requestData = await ClientRequest.findById(requestId);
    if (!requestData) return res.status(404).json({ error: "Request not found" });

    const newUser = new User({
      username,
      password,
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
      email: requestData.email,

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
      procurementEmail: requestData.procurementEmail || "N/A"
    });

    await newUser.save();

    requestData.status = "APPROVED";
    await requestData.save();

    const actor = getActor(req);
    await createActivityLog({
      userId: actor.userId,
      username: actor.username || username,
      role: actor.role || "Admin",
      action: "Approve client",
      module: "Client Management",
      description: `Client account "${username}" was approved and activated.`,
    });

    res.status(200).json({ message: "Account activated and password hashed successfully!" });
  } catch (err) {
    console.error("Approval Error:", err);
    res.status(500).json({ error: err.message });
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

router.get("/reject-deposit", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("Missing token.");
  }

  // 1. Verify token + invalidate it
  const order = await verifyAndInvalidateToken(token);
  if (!order) {
    return res.status(400).send("Invalid or expired link.");
  }

  // 2. Perform DB update
  try {
    await Order.updateOne(
      { _id: order._id },
      { $set: { paymentStatus: "REJECTED", paymentslip: "" } }

    );

    // 3. Look up the client's email via the order's username
    const orderRef =
      order.orderNumber ||
      order.orderId ||
      order._id?.toString();

    try {
      let clientEmail = null;
      let clientName = order.customerName || order.clientName || order.name || "Customer";

      // Try order.username first — most likely field
      const username = order.username || order.clientUsername;

      if (username) {
        const user = await User.findOne({ username }).select("email fullName username").lean();
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
          `Order ${orderRef} has no resolvable client email (username: ${username || "N/A"}) — skipping notification.`
        );
      }
    } catch (emailErr) {
      // Don't fail the whole request just because the email failed
      console.error("Error sending rejection email:", emailErr.message);
    }

    return res.send("<h2>Deposit slip rejected successfully.</h2>");
  } catch (error) {
    console.error("Reject deposit update failed:", error);
    return res.status(500).send("An error occurred while updating the record.");
  }
});
export default router;