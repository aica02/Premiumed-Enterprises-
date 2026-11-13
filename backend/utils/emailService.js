import { BrevoClient } from "@getbrevo/brevo";
import dotenv from "dotenv";
import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import { generateOrderReceipt } from "./reportEngine.js";

dotenv.config();

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

// Emails always show Philippine time, whatever time zone the server runs in.
const formatDateTime = (value = new Date()) =>
  new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// Date only, in Philippine time (for payment due dates).
const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// Escapes text that came from a form or the database before it goes into
// email HTML.
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const statusColor = (status) =>
  ["TO SHIP", "DELIVERED", "COMPLETED", "APPROVED"].includes(status)
    ? "#2e7d32"
    : status === "CANCELLED" || status === "REJECTED"
      ? "#b8251e"
      : "#8a6d14";

export const sendEmailWithRetry = async (mailOptions, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response =
        await brevo.transactionalEmails.sendTransacEmail(mailOptions);
      return {
        success: true,
        messageId: response?.messageId || response?.messageIds,
      };
    } catch (error) {
      console.error(`Email attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) {
        return { success: false, error: error.message };
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return { success: false, error: "All retry attempts failed" };
};

export const sendOrderStatusUpdate = async (
  orderData,
  clientEmail,
  newStatus,
) => {
  try {
    const statusMessages = {
      RETURNED:
        "Your order has been returned. Kindly check the Orders & Transactions page for more information.",
      APPROVED: "Your order has been approved and is being processed.",
      DELIVERED: "Your order has been delivered.",
      PARTIAL:
        "Your order has been split into multiple shipments. Please check the Orders & Transactions page for details.",
      CANCELLED: "Your order has been cancelled.",
    };

    let statusMessage =
      statusMessages[newStatus] ||
      `Your order status has been updated to: ${newStatus}`;
    if (
      newStatus === "DELIVERED" &&
      orderData.paymentDueDate &&
      orderData.paymentStatus !== "COMPLETED"
    ) {
      statusMessage += ` Please submit your payment slip on or before ${formatDate(orderData.paymentDueDate)}.`;
    }
    let dateChangeInfo = "";

    const history = Array.isArray(orderData.dateChangeHistory)
      ? orderData.dateChangeHistory
      : [];
    const lastChange = history.length ? history[history.length - 1] : {};
    const oldDate =
      orderData.oldDate || lastChange.oldDate || orderData.requestedDeliveryDate;
    const newDate = orderData.newDate || lastChange.newDate;
    const changeReason =
      orderData.dateChangeReason ||
      orderData.dateNote ||
      lastChange.reason ||
      "No reason provided";
    // A brand-change email only shows date details while a new date is
    // still waiting for the client's answer.
    const brandChanges = Array.isArray(orderData.brandChanges)
      ? orderData.brandChanges
      : [];
    const hasBrandChange = newStatus === "RETURNED" && brandChanges.length > 0;
    const hasDateChange =
      newStatus === "RETURNED" &&
      Boolean(newDate) &&
      (!hasBrandChange || Boolean(orderData.awaitingDateApproval));
    if (hasBrandChange) {
      statusMessage =
        "An item in your order is not available in the brand you picked. We are offering another brand. Kindly check the Orders & Transactions page to accept or decline.";
    }
    const brandChangeInfo = hasBrandChange
      ? `
        <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
          <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
            Brand Change Details
          </h3>
          ${brandChanges
            .map(
              (change) => `
          <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
            <strong>Ordered:</strong> ${escapeHtml(change.fromName)}<br/>
            <strong>Offered instead:</strong> ${escapeHtml(change.toText)}<br/>
            <strong>Reason:</strong> ${escapeHtml(change.reason)}
          </p>`,
            )
            .join("")}
          <p style="margin: 15px 0 0; font-size: 14px; line-height: 1.5;">
            Please log in to accept or decline the new brand.
          </p>
        </div>
      `
      : "";
    const brandChangeText = hasBrandChange
      ? `
BRAND CHANGE DETAILS
${brandChanges
  .map(
    (change) =>
      `Ordered: ${change.fromName}\nOffered instead: ${change.toText}\nReason: ${change.reason}`,
  )
  .join("\n\n")}

Please log in to accept or decline the new brand.
`
      : "";

    if (hasDateChange) {
      dateChangeInfo = `
        <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
          <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
            Date Change Details
          </h3>

          <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
            <strong>Old Date:</strong> ${escapeHtml(oldDate || "N/A")}
          </p>

          <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
            <strong>New Date:</strong> ${escapeHtml(newDate || "N/A")}
          </p>

          <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
            <strong>Reason:</strong> ${escapeHtml(changeReason)}
          </p>

          <p style="margin: 15px 0 0; font-size: 14px; line-height: 1.5;">
            Please review and approve the new delivery date by logging into your account.
          </p>
        </div>
      `;
    }

    const totalItems = orderData.items
      ? orderData.items.reduce(
          (sum, item) => sum + (Number(item.quantity) || 0),
          0,
        )
      : 0;

    const totalDelivered = orderData.items
      ? orderData.items.reduce(
          (sum, item) => sum + (Number(item.deliveredQuantity) || 0),
          0,
        )
      : 0;

    const totalBackorder = totalItems - totalDelivered;

    let backorderInfo = "";
    if (newStatus === "PARTIAL" && totalBackorder > 0) {
      backorderInfo = `
        <p style="margin: 15px 0 0; font-size: 14px; line-height: 1.5;">
          <strong>Backorder Balance:</strong>
          ${totalBackorder} item(s) will be delivered in the next shipment.
        </p>
      `;
    }

    let itemsList = "";
    if (orderData.items && orderData.items.length > 0) {
      itemsList = orderData.items
        .map((item, index) => {
          const itemName = item.name || "Unknown Item";
          const itemCode = item.itemCode || "N/A";
          const quantity = Number(item.quantity) || 0;
          const deliveredQty = Number(item.deliveredQuantity) || 0;
          const backorderQty = quantity - deliveredQty;

          let itemDetails = `
          <div style="margin-bottom: 12px; padding: 15px 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5;">
              <strong>${index + 1}. ${escapeHtml(itemName)}</strong>
            </p>

            <p style="margin: 5px 0; font-size: 14px; line-height: 1.5;">
              <strong>Requested:</strong> ${quantity}
        `;

          if (newStatus === "PARTIAL" && backorderQty > 0) {
            itemDetails += `
            <span style="margin-left: 10px;">
              <strong>Backorder:</strong> ${backorderQty}
            </span>
          `;
          }

          itemDetails += `
            </p>
          </div>
        `;

          return itemDetails;
        })
        .join("");
    } else {
      itemsList = `
        <p style="margin: 0; font-size: 14px; color: #777777;">
          No items listed
        </p>
      `;
    }

    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: "Premiumed Enterprises",
        email: process.env.SYSTEM_EMAIL,
      },
      to: [{ email: clientEmail }],
      subject: `Order Status Update #${orderData.orderId || orderData.orderNumber || orderData._id}`,
      textContent: `
PREMIUMED ENTERPRISES
ORDER STATUS UPDATE

Order Number: ${orderData.orderId || orderData.orderNumber || orderData._id}
New Status: ${newStatus}
Update Date: ${formatDateTime()}

${statusMessage}

${
  hasDateChange
    ? `
DATE CHANGE DETAILS
Old Date: ${oldDate || "N/A"}
New Date: ${newDate || "N/A"}
Reason: ${changeReason}

Please review and approve the new delivery date by logging into your account.
`
    : ""
}
${brandChangeText}
ORDER SUMMARY

${
  orderData.items && orderData.items.length > 0
    ? orderData.items
        .map((item, index) => {
          const itemName = item.name || "Unknown Item";
          const itemCode = item.itemCode || "N/A";
          const quantity = Number(item.quantity) || 0;
          const deliveredQty = Number(item.deliveredQuantity) || 0;
          const backorderQty = quantity - deliveredQty;

          let itemDetails = `${index + 1}. ${itemName} (${itemCode})\n   Requested: ${quantity}`;
          if (newStatus === "PARTIAL" && backorderQty > 0) {
            itemDetails += ` | Backorder: ${backorderQty}`;
          }
          return itemDetails;
        })
        .join("\n\n")
    : "No items listed"
}

Total Items Requested: ${totalItems}
${
  newStatus === "PARTIAL"
    ? `
Available for Shipment: ${totalDelivered}
Total Backorder: ${totalBackorder}`
    : ""
}

For more details, please log in to your account and check the Orders & Transactions page.

This is an automated message. Please do not reply to this email.

Premiumed Enterprises
© ${new Date().getFullYear()} Premiumed Enterprises
      `.trim(),
      htmlContent: `
        <div style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333;">
          <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
            <div style="background-color: #000000; padding: 25px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
                PREMIUMED ENTERPRISES
              </h1>
              <div style="width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
            </div>

            <div style="padding: 35px;">
              <h2 style="margin-top: 0; margin-bottom: 25px; color: #222222; font-size: 22px;">
                Order Status Update
              </h2>

              <p style="font-size: 15px; line-height: 1.6;">
                ${statusMessage}
              </p>

              <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                  Order Information
                </h3>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Order Number:</strong> ${orderData.orderId || orderData.orderNumber || orderData._id}
                </p>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>New Status:</strong> ${newStatus}
                </p>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Update Date:</strong> ${formatDateTime()}
                </p>
              </div>

              ${dateChangeInfo}

              ${brandChangeInfo}

              <div style="margin: 25px 0;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                  Order Summary
                </h3>

                ${itemsList}

                <div style="margin-top: 20px; padding: 15px 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                  <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                    <strong>Total Items Requested:</strong> ${totalItems}
                  </p>
                  ${
                    newStatus === "PARTIAL"
                      ? `
                        <p style="margin: 8px 0 0; font-size: 14px; line-height: 1.5;">
                          <strong>Available for Shipment:</strong> ${totalDelivered}
                        </p>
                        <p style="margin: 8px 0 0; font-size: 14px; line-height: 1.5;">
                          <strong>Total Backorder:</strong> ${totalBackorder}
                        </p>
                        ${backorderInfo}
                      `
                      : ""
                  }
                </div>
              </div>

              <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                  For more details, please log in to your account and check the Orders & Transactions page.
                </p>
              </div>

              <p style="font-size: 13px; color: #777777;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>

            <div style="padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd;">
              <p style="margin: 0; font-size: 13px; color: #555555;">
                <strong>Premiumed Enterprises</strong>
              </p>
              <p style="margin: 5px 0 0; font-size: 12px; color: #888888;">
                &copy; ${new Date().getFullYear()} Premiumed Enterprises
              </p>
            </div>
          </div>
        </div>
      `,
    });

    return {
      success: true,
      messageId: response?.messageId || response?.messageIds,
    };
  } catch (error) {
    console.error("Error sending status update email via Brevo:", error);
    return { success: false, error: error.message };
  }
};

// Creates a fresh one-time token for an order's Accept / Reject links and
// returns both links. Any older links for the order stop working.
export const createDepositReviewLinks = async (orderObjectId) => {
  const rejectToken = crypto.randomBytes(32).toString("hex");

  // Persist token + expiry so the route can verify it later
  await Order.updateOne(
    { _id: orderObjectId },
    {
      $set: {
        rejectToken,
        rejectTokenExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3), // 3 days
      },
    },
  );

  const backendBase = process.env.BACKEND_URL || "http://localhost:5000";
  return {
    acceptUrl: `${backendBase}/api/clients/accept-deposit?token=${rejectToken}`,
    rejectUrl: `${backendBase}/api/clients/reject-deposit?token=${rejectToken}`,
  };
};

export const sendDepositSlipToAccountant = async (
  orderData,
  depositSlipBuffer,
  originalFilename,
  accountantEmail,
) => {
  try {
    if (!accountantEmail || !accountantEmail.includes("@")) {
      return { success: false, error: "Invalid accountant email" };
    }

    // Guard: orderData._id must exist before we build the reject link
    if (!orderData?._id) {
      console.error("sendDepositSlipToAccountant: orderData._id is missing");
      return { success: false, error: "Order ID is missing" };
    }

    const itemsList =
      orderData.items
        ?.map((item, index) => {
          return `${index + 1}. ${item.name} - ${item.unitType || "N/A"} - Qty: ${item.quantity} - ${formatCurrency(item.price * item.quantity)}`;
        })
        .join("\n") || "No items listed";

    const totalAmount =
      orderData.items?.reduce((sum, item) => {
        return sum + item.price * item.quantity;
      }, 0) || 0;

    const itemsHtml =
      orderData.items
        ?.map((item, index) => {
          return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; color: #333333;">
            ${index + 1}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; color: #333333;">
            ${escapeHtml(item.name)}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; color: #333333;">
            ${escapeHtml(item.unitType || "N/A")}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: center; color: #333333; white-space: nowrap;">
            ${item.quantity}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: right; color: #333333; white-space: nowrap;">
            ${formatCurrency(item.price * item.quantity)}
          </td>
        </tr>
      `;
        })
        .join("") ||
      `
      <tr>
        <td colspan="5" style="padding: 15px; text-align: center; color: #777777;">
          No items listed
        </td>
      </tr>
    `;

    // ─────────────────────────────────────────────────────────────
    // Generate a secure, time-limited token for the reject action
    // ─────────────────────────────────────────────────────────────
    let acceptUrl;
    let rejectUrl;
    try {
      ({ acceptUrl, rejectUrl } = await createDepositReviewLinks(orderData._id));
    } catch (persistErr) {
      console.error("Failed to persist reject token:", persistErr.message);
      return { success: false, error: "Failed to generate reject link" };
    }

    const mailOptions = {
      sender: {
        name: "Premiumed Enterprises",
        email: process.env.SYSTEM_EMAIL,
      },
      to: [{ email: accountantEmail }],
      subject: `Payment Slip Uploaded - Order #${orderData.orderNumber || orderData.orderId || orderData._id}`,
      textContent: `
PREMIUMED ENTERPRISES
PAYMENT SLIP SUBMISSION

A payment slip has been uploaded for the following order:

Order Number: ${orderData.orderNumber || orderData.orderId || orderData._id}
Client Name: ${orderData.customerName || orderData.name || "N/A"}
Order Date: ${formatDateTime(orderData.createdAt || Date.now())}
Delivery Status: ${orderData.status || "PAYMENT REVIEW"}
Payment Status: AWAITING REVIEW

ORDER DETAILS
-------------
${itemsList}

Subtotal: ${formatCurrency(totalAmount)}
Total: ${formatCurrency(orderData.total || totalAmount)}

Delivery Address: ${orderData.deliveryAddress || orderData.shippingAddress || "N/A"}
Contact: ${orderData.contactNumber || orderData.procurementMobile || "N/A"}

The payment slip is attached to this email. Please verify and process accordingly.

To ACCEPT this payment slip:
${acceptUrl}

To REJECT this payment slip:
${rejectUrl}

This is an automated message. Please do not reply to this email.

Premiumed Enterprises
© ${new Date().getFullYear()} Premiumed Enterprises
      `.trim(),
      htmlContent: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Slip Uploaded - Premiumed Enterprises</title>
          </head>

          <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333;">
            <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
              <div style="background-color: #000000; padding: 25px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
                  PREMIUMED ENTERPRISES
                </h1>

                <div style="width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
              </div>

              <div style="padding: 35px;">
                <h2 style="margin-top: 0; margin-bottom: 25px; color: #222222; font-size: 22px;">
                  Payment Slip Submission
                </h2>

                <p style="font-size: 15px; line-height: 1.6;">
                  A payment slip has been uploaded for the following order:
                </p>

                <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                  <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                    Order Information
                  </h3>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Order Number:</strong>
                    ${orderData.orderNumber || orderData.orderId || orderData._id}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Client Name:</strong>
                    ${escapeHtml(orderData.customerName || orderData.name || "N/A")}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Order Date:</strong>
                    ${formatDateTime(orderData.createdAt || Date.now())}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Delivery Status:</strong>
                    <span style="color: ${statusColor(orderData.status || "PAYMENT REVIEW")}; font-weight: bold;">
                      ${orderData.status || "PAYMENT REVIEW"}
                    </span>
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Payment Status:</strong>
                    <span style="color: #8a6d14; font-weight: bold;">AWAITING REVIEW</span>
                  </p>
                </div>

                <h3 style="margin-top: 30px; margin-bottom: 15px; font-size: 17px; color: #222222;">
                  Order Details
                </h3>

                <div style="width: 100%; overflow-x: auto;">
                  <table style="width: 100%; border-collapse: collapse; border: 1px solid #dddddd;">
                    <thead>
                      <tr style="background-color: #000000; color: #ffffff;">
                        <th style="padding: 12px; font-size: 13px; text-align: left;">
                          #
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: left;">
                          Supply Name
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: left; white-space: nowrap;">
                          Unit Type
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: center;">
                          Quantity
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: right;">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHtml}
                    </tbody>
                  </table>
                </div>

                <div style="margin-top: 20px; padding: 12px 20px; background-color: #f8f8f8; border: 1px solid #dddddd;">
                  <p style="margin: 8px 0; font-size: 14px; text-align: right;">
                    <strong>Subtotal:</strong>
                    ${formatCurrency(totalAmount)}
                  </p>

                  <p style="margin: 8px 0; font-size: 18px; text-align: right; color: #222222;">
                    <strong>Total:</strong>
                    ${formatCurrency(orderData.total || totalAmount)}
                  </p>
                </div>

                <div style="margin-top: 25px; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                  <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                    Delivery Information
                  </h3>

                  <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                    <strong>Delivery Address:</strong><br>
                    ${escapeHtml(orderData.deliveryAddress || orderData.shippingAddress || "N/A")}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Contact:</strong>
                    ${escapeHtml(orderData.contactNumber || orderData.procurementMobile || "N/A")}
                  </p>
                </div>

                <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                  <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                    <strong>Important:</strong>
                    The payment slip is attached to this email.
                    Please verify and process accordingly.
                  </p>
                </div>

                <!-- Reject button -->
                <div style="margin: 30px 0; text-align: center;">
  <a
    href="${acceptUrl}"
    style="
      display: inline-block;
      padding: 14px 28px;
      background-color: #2e7d32;
      color: #ffffff;
      text-decoration: none;
      font-size: 14px;
      font-weight: bold;
      border-radius: 4px;
      margin-right: 12px;
    "
  >
    Accept Payment Slip
  </a>

  <a
    href="${rejectUrl}"
    style="
      display: inline-block;
      padding: 14px 28px;
      background-color: #b3261e;
      color: #ffffff;
      text-decoration: none;
      font-size: 14px;
      font-weight: bold;
      border-radius: 4px;
    "
  >
    Reject Payment Slip
  </a>
</div>

                <p style="font-size: 13px; color: #777777; line-height: 1.5;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </div>

              <div style="padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd;">
                <p style="margin: 0; font-size: 13px; color: #555555;">
                  <strong>Premiumed Enterprises</strong>
                </p>
                <p style="margin: 5px 0 0; font-size: 12px; color: #888888;">
                  &copy; ${new Date().getFullYear()} Premiumed Enterprises
                </p>
              </div>
            </div>
          </body>
        </html>
      `.trim(),
      attachment: [
        {
          name: `deposit_slip_${orderData.orderNumber || orderData.orderId || orderData._id}_${Date.now()}.${originalFilename.split(".").pop()}`,
          content: depositSlipBuffer.toString("base64"),
        },
      ],
    };

    return await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error("Error sending payment slip to accountant:", error);
    return { success: false, error: error.message };
  }
};

export const getDepositSlipRejectedEmail = ({
  username,
  orderId,
  actionUrl,
}) => {
  return {
    subject: `Payment Slip Rejected - Order #${orderId}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Slip Rejected - Premiumed Enterprises</title>
        </head>

        <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333;">
          <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
            <div style="background-color: #000000; padding: 25px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
                PREMIUMED ENTERPRISES
              </h1>

              <div style="width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
            </div>

            <div style="padding: 35px;">
              <h2 style="margin-top: 0; margin-bottom: 25px; color: #b8251e; font-size: 22px;">
                Payment Slip Rejected
              </h2>

              <p style="font-size: 15px; line-height: 1.6;">
                Dear <strong>${escapeHtml(username || "Valued Client")}</strong>,
              </p>

              <p style="font-size: 15px; line-height: 1.6;">
                Your submitted payment slip for order
                <strong>#${orderId}</strong>
                was reviewed and could not be accepted.
              </p>

              <!-- ORDER INFORMATION -->
              <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                  Order Information
                </h3>

                <p style="margin: 8px 0; font-size: 14px;">
                  <strong>Order Number:</strong>
                  ${orderId}
                </p>

                <p style="margin: 8px 0; font-size: 14px;">
                  <strong>Payment Status:</strong>
                  <span style="color: #b8251e; font-weight: bold;">
                    REJECTED
                  </span>
                </p>
              </div>

              <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                  <strong>Important:</strong>
                  Please upload a new, clear payment slip to complete your transaction.
                </p>
              </div>

              <!-- ACTION BUTTON -->
              <div style="margin: 30px 0; text-align: center;">
                <a
                  href="${actionUrl || "#"}"
                  style="
                    display: inline-block;
                    padding: 14px 28px;
                    background-color: #000000;
                    color: #ffffff;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: bold;
                    border-radius: 4px;
                  "
                >
                  Re-upload Payment Slip
                </a>
              </div>

              <p style="font-size: 15px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>

              <p style="font-size: 13px; color: #777777; line-height: 1.5;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>

            <!-- FOOTER -->
            <div style="padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd;">
              <p style="margin: 0; font-size: 13px; color: #555555;">
                <strong>Premiumed Enterprises</strong>
              </p>

              <p style="margin: 5px 0 0; font-size: 12px; color: #888888;">
                &copy; ${new Date().getFullYear()} Premiumed Enterprises
              </p>
            </div>
          </div>
        </body>
      </html>
    `.trim(),
  };
};

export const sendOrderReceipt = async (orderData, clientEmail) => {
  try {
    const getUnitType = (item) =>
      String(item.unitType || item.unit || "").trim() || "N/A";

    const itemsList = orderData.items
      .map((item, index) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        const itemSubtotal = price * quantity;
        return `${index + 1}. ${item.name} - ${getUnitType(item)} - Qty: ${quantity} - ${formatCurrency(price)} - Subtotal: ${formatCurrency(itemSubtotal)}`;
      })
      .join("\n");

    const subtotal = orderData.items.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 0;
      return sum + price * quantity;
    }, 0);

    const total = subtotal;

    const pdfBuffer = generateOrderReceipt({
      title: orderData.orderNumber || orderData._id,
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      documentTitle: "Order Receipt",
      recipientLabel: "Deliver To:",
      deliveredTo: orderData.clientName || orderData.name || "N/A",
      vatReg: "VAT REG. TIN: 275-357-338-00000",
      landlineNum: "(044) 812-2280",
      totalPrice: orderData.total || total,
      deliveryAddress: orderData.shippingAddress || orderData.address || "N/A",
      columns: ["QTY", "Supply Name", "Unit Type", "Price", "Subtotal"],
      data: orderData.items.map((item, index) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        const itemSubtotal = price * quantity;

        return [
          `${quantity}`,
          item.name,
          getUnitType(item),
          price,
          itemSubtotal,
        ];
      }),
    });

    const itemsHtml = orderData.items
      .map((item, index) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; color: #333333;">
            ${index + 1}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; color: #333333;">
            ${escapeHtml(item.name)}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; color: #333333;">
            ${getUnitType(item)}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: center; color: #333333; white-space: nowrap;">
            ${quantity}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: right; color: #333333; white-space: nowrap;">
            ${formatCurrency(price)}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: right; color: #333333; white-space: nowrap;">
            ${formatCurrency(price * quantity)}
          </td>
        </tr>
      `;
      })
      .join("");

    const mailOptions = {
      sender: {
        name: "Premiumed Enterprises",
        email: process.env.SYSTEM_EMAIL,
      },
      to: [{ email: clientEmail }],
      subject: `Order Receipt #${orderData.orderNumber || orderData._id}`,
      textContent: `
PREMIUMED ENTERPRISES
ORDER RECEIPT

Order Number: ${orderData.orderNumber || orderData._id}
Order Date: ${formatDateTime(orderData.createdAt || Date.now())}
Status: ${orderData.status || "TO SHIP"}

CLIENT INFORMATION
------------------
Client Name: ${orderData.clientName || orderData.name || "N/A"}
Delivery Address: ${orderData.shippingAddress || orderData.address || "N/A"}
Contact: ${orderData.contactNumber || orderData.procurementMobile || "N/A"}

ORDER DETAILS
------------
${itemsList}

Subtotal: ${formatCurrency(subtotal)}
Total: ${formatCurrency(total)}

Thank you for your order! Kindly submit the payment slip once you receive this email.

This is an automated message. Please do not reply to this email.

Premiumed Enterprises
© ${new Date().getFullYear()} Premiumed Enterprises
      `.trim(),
      htmlContent: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Receipt - Premiumed Enterprises</title>
          </head>

          <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333;">
            <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
              <div style="background-color: #000000; padding: 25px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
                  PREMIUMED ENTERPRISES
                </h1>
                <div style="width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
              </div>

              <div style="padding: 35px;">
                <h2 style="margin-top: 0; margin-bottom: 25px; color: #222222; font-size: 22px;">
                  Order Receipt
                </h2>

                <p style="font-size: 15px; line-height: 1.6;">
                  Thank you for your order!
                  Please review your order details below.
                </p>

                <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                  <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                    Order Information
                  </h3>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Order Number:</strong>
                    ${orderData.orderNumber || orderData._id}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Order Date:</strong>
                    ${formatDateTime(orderData.createdAt || Date.now())}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Status:</strong>
                    <span style="color: ${statusColor(orderData.status || "TO SHIP")}; font-weight: bold;">
                      ${orderData.status || "TO SHIP"}
                    </span>
                  </p>
                </div>

                <h3 style="margin-top: 30px; margin-bottom: 15px; font-size: 17px; color: #222222;">
                  Client Information
                </h3>

                <div style="padding: 20px; background-color: #f8f8f8; border: 1px solid #dddddd;">
                  <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                    <strong>Client Name:</strong><br>
                    ${escapeHtml(orderData.clientName || orderData.name || "N/A")}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                    <strong>Delivery Address:</strong><br>
                    ${escapeHtml(orderData.shippingAddress || orderData.address || "N/A")}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Contact:</strong>
                    ${escapeHtml(orderData.contactNumber || orderData.procurementMobile || "N/A")}
                  </p>
                </div>

                <h3 style="margin-top: 30px; margin-bottom: 15px; font-size: 17px; color: #222222;">
                  Order Details
                </h3>

                <div style="width: 100%; overflow-x: auto;">
                  <table style="width: 100%; border-collapse: collapse; border: 1px solid #dddddd;">
                    <thead>
                      <tr style="background-color: #000000; color: #ffffff;">
                        <th style="padding: 12px; font-size: 13px; text-align: left;">
                          #
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: left;">
                          Supply Name
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: left; white-space: nowrap;">
                          Unit Type
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: center;">
                          Qty
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: right;">
                          Price
                        </th>
                        <th style="padding: 12px; font-size: 13px; text-align: right;">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHtml}
                    </tbody>
                  </table>
                </div>

                <div style="margin-top: 20px; padding: 12px 20px; background-color: #f8f8f8; border: 1px solid #dddddd;">
                  <p style="margin: 8px 0; font-size: 14px; text-align: right;">
                    <strong>Subtotal:</strong>
                    ${formatCurrency(subtotal)}
                  </p>
                  <p style="margin: 8px 0; font-size: 18px; text-align: right; color: #222222;">
                    <strong>Total:</strong>
                    ${formatCurrency(total)}
                  </p>
                </div>

                <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                  <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                    <strong>Important:</strong>
                    Kindly submit the payment slip once you receive this email.
                    Please ensure that the uploaded payment slip is clear and readable.
                  </p>
                </div>
                <p style="font-size: 13px; color: #777777; line-height: 1.5;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </div>

              <div style="padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd;">
                <p style="margin: 0; font-size: 13px; color: #555555;">
                  <strong>Premiumed Enterprises</strong>
                </p>

                <p style="margin: 5px 0 0; font-size: 12px; color: #888888;">
                  &copy; ${new Date().getFullYear()} Premiumed Enterprises
                </p>
              </div>
            </div>
          </body>
        </html>
      `.trim(),
      attachment: [
        {
          name: `Receipt-${orderData.orderNumber || orderData._id}.pdf`,
          content: pdfBuffer.toString("base64"),
        },
      ],
    };
    return await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error("Error sending order receipt:", error);
    return { success: false, error: error.message };
  }
};

export const sendAccountApprovalEmail = async (
  email,
  username,
  password,
  centerName,
  attachment = null,
) => {
  try {
    const mailOptions = {
      sender: {
        name: "Premiumed Enterprises",
        email: process.env.SYSTEM_EMAIL,
      },
      to: [{ email: email }],
      subject: "Account Activated - Premiumed Enterprises",
      textContent: `
PREMIUMED ENTERPRISES
ACCOUNT ACTIVATION

Dear ${centerName},

We are pleased to inform you that your account has been approved and activated.

Your login credentials:
Username: ${username}
Password: ${password}

Important: For security reasons, please change your password after your first login.

If you have any questions, please contact our support team.
This is an automated message. Please do not reply to this email.

Premiumed Enterprises
© ${new Date().getFullYear()} Premiumed Enterprises
      `.trim(),
      htmlContent: `
        <div style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333;">
          <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
            <div style="background-color: #000000; padding: 25px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
                PREMIUMED ENTERPRISES
              </h1>
              <div style="width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
            </div>

            <div style="padding: 35px;">
              <h2 style="margin-top: 0; margin-bottom: 25px; color: #222222; font-size: 22px;">
                Account Activation
              </h2>

              <p style="font-size: 15px; line-height: 1.6;">
                Dear <strong>${escapeHtml(centerName)}</strong>,
              </p>

              <p style="font-size: 15px; line-height: 1.6;">
                We are pleased to inform you that your account has been approved and activated.
              </p>

              <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                  Your login credentials:
                </h3>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Username:</strong> ${username}
                </p>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Password:</strong> ${password}
                </p>
              </div>

              <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                  <strong>Important:</strong>
                  For security reasons, please change your password after your first login.
                </p>
              </div>
              <p style="font-size: 15px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>

              <p style="font-size: 13px; color: #777777;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>

            <div style="padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd;">
              <p style="margin: 0; font-size: 13px; color: #555555;">
                <strong>Premiumed Enterprises</strong>
              </p>
              <p style="margin: 5px 0 0; font-size: 12px; color: #888888;">
                &copy; ${new Date().getFullYear()} Premiumed Enterprises
              </p>
            </div>
          </div>
        </div>
      `,
    };

    if (attachment) {
      mailOptions.attachment = [
        {
          name: attachment.originalname,
          content: attachment.buffer.toString("base64"),
        },
      ];
    }

    return await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error("Error sending approval email:", error);
    return { success: false, error: error.message };
  }
};

export const sendEmployeeAccountEmail = async (
  email,
  username,
  password,
  fullName,
  role,
  employeeId,
) => {
  try {
    const mailOptions = {
      sender: {
        name: "Premiumed Enterprises",
        email: process.env.SYSTEM_EMAIL,
      },
      to: [{ email: email }],
      subject: "Employee Account Created - Premiumed Enterprises",
      textContent: `
PREMIUMED ENTERPRISES
EMPLOYEE ACCOUNT CREATED

Dear ${fullName},

Welcome to the team! Your employee account has been successfully created.

YOUR LOGIN CREDENTIALS
----------------------
Role: ${role}
Employee ID: ${employeeId || "N/A"}
Username: ${username}
Temporary Password: ${password}

Important: For security reasons, please log in and change your password as soon as possible.

If you have any questions, please contact our support team.
This is an automated message. Please do not reply to this email.

Premiumed Enterprises
© ${new Date().getFullYear()} Premiumed Enterprises
      `.trim(),
      htmlContent: `
        <div style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333;">
          <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
            <div style="background-color: #000000; padding: 25px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
                PREMIUMED ENTERPRISES
              </h1>
              <div style="width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
            </div>

            <div style="padding: 35px;">
              <h2 style="margin-top: 0; margin-bottom: 25px; color: #222222; font-size: 22px;">
                Employee Account Created
              </h2>

              <p style="font-size: 15px; line-height: 1.6;">
                Dear <strong>${fullName}</strong>,
              </p>

              <p style="font-size: 15px; line-height: 1.6;">
                Welcome to the team! Your employee account has been successfully created.
              </p>

              <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                  Your login credentials:
                </h3>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Role:</strong> ${role}
                </p>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Employee ID:</strong> ${employeeId || "N/A"}
                </p>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Username:</strong> ${username}
                </p>

                <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                  <strong>Temporary Password:</strong> ${password}
                </p>
              </div>

              <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                  <strong>Important:</strong>
                  For security reasons, please log in and change your password as soon as possible.
                </p>
              </div>

              <p style="font-size: 15px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>

              <p style="font-size: 13px; color: #777777;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>

            <div style="padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd;">
              <p style="margin: 0; font-size: 13px; color: #555555;">
                <strong>Premiumed Enterprises</strong>
              </p>
              <p style="margin: 5px 0 0; font-size: 12px; color: #888888;">
                &copy; ${new Date().getFullYear()} Premiumed Enterprises
              </p>
            </div>
          </div>
        </div>
      `,
    };

    return await sendEmailWithRetry(mailOptions);
  } catch (error) {
    console.error("Error sending employee account email:", error);
    return { success: false, error: error.message };
  }
};

// ─────────────────────────────────────────────────────────────
// Pay-after-delivery emails
// ─────────────────────────────────────────────────────────────

// The same black-and-gold frame the other emails use.
const brandedEmailHtml = (title, bodyHtml, { titleColor = "#222222" } = {}) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Premiumed Enterprises</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333;">
    <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border: 1px solid #dddddd;">
      <div style="background-color: #000000; padding: 25px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; letter-spacing: 1px;">
          PREMIUMED ENTERPRISES
        </h1>
        <div style="width: 60px; height: 3px; background-color: #d4af37; margin: 12px auto 0;"></div>
      </div>
      <div style="padding: 35px;">
        <h2 style="margin-top: 0; margin-bottom: 25px; color: ${titleColor}; font-size: 22px;">
          ${title}
        </h2>
        ${bodyHtml}
        <p style="font-size: 13px; color: #777777; line-height: 1.5;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
      <div style="padding: 20px; background-color: #f5f5f5; text-align: center; border-top: 1px solid #dddddd;">
        <p style="margin: 0; font-size: 13px; color: #555555;">
          <strong>Premiumed Enterprises</strong>
        </p>
        <p style="margin: 5px 0 0; font-size: 12px; color: #888888;">
          &copy; ${new Date().getFullYear()} Premiumed Enterprises
        </p>
      </div>
    </div>
  </body>
</html>`.trim();

const infoBlock = (heading, rows) => `
  <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
    <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">${heading}</h3>
    ${rows
      .map(
        ([label, value]) =>
          `<p style="margin: 8px 0; font-size: 14px; line-height: 1.5;"><strong>${label}:</strong> ${value}</p>`,
      )
      .join("")}
  </div>`;

const noticeBlock = (html) => `
  <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
    <p style="margin: 0; font-size: 14px; line-height: 1.5;">${html}</p>
  </div>`;

const systemSender = () => ({
  name: "Premiumed Enterprises",
  email: process.env.SYSTEM_EMAIL,
});

// Sent to the client 7, 14 and 21 days after delivery, before the payment
// is due, unless a slip was already sent or accepted.
export const sendPaymentDueReminderEmail = async (order, clientEmail) => {
  try {
    if (!clientEmail || !clientEmail.includes("@")) {
      return { success: false, error: "Invalid client email" };
    }

    const orderRef = escapeHtml(order.orderId || order._id);
    const daysLeft = Math.max(
      0,
      Math.ceil((new Date(order.paymentDueDate) - Date.now()) / 86400000),
    );
    const rejected = order.paymentStatus === "REJECTED";
    const frontendBase = process.env.FRONTEND_URL || "http://localhost:3000";

    const body = `
      <p style="font-size: 15px; line-height: 1.6;">
        Dear <strong>${escapeHtml(order.name || "Valued Client")}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6;">
        This is a friendly reminder that payment for order <strong>#${orderRef}</strong>
        is due on <strong>${formatDate(order.paymentDueDate)}</strong>.
        ${rejected ? "Your last payment slip was rejected, so a new slip is needed." : ""}
      </p>
      ${infoBlock("Payment Information", [
        ["Order Number", orderRef],
        ["Delivered On", order.deliveredDate ? formatDate(order.deliveredDate) : "N/A"],
        ["Payment Due", formatDate(order.paymentDueDate)],
        ["Days Left", String(daysLeft)],
        ["Amount Due", formatCurrency(order.total)],
      ])}
      ${noticeBlock(
        "Please upload your payment slip on the Orders &amp; Transactions page before the due date. If you have already sent it, you can ignore this reminder.",
      )}
      <div style="margin: 30px 0; text-align: center;">
        <a href="${frontendBase}/order-transaction" style="display: inline-block; padding: 14px 28px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 4px;">
          Upload Payment Slip
        </a>
      </div>`;

    return await sendEmailWithRetry({
      sender: systemSender(),
      to: [{ email: clientEmail }],
      subject: `Payment Reminder - Order #${order.orderId || order._id}`,
      textContent: `PREMIUMED ENTERPRISES
PAYMENT REMINDER

Payment for order #${order.orderId || order._id} is due on ${formatDate(order.paymentDueDate)}.
Days Left: ${daysLeft}
Amount Due: ${formatCurrency(order.total)}

Please upload your payment slip on the Orders & Transactions page:
${frontendBase}/order-transaction`,
      htmlContent: brandedEmailHtml("Payment Reminder", body),
    });
  } catch (error) {
    console.error("Error sending payment due reminder email:", error);
    return { success: false, error: error.message };
  }
};

// Sent to the client at day 30 after delivery and every 7 days after that
// until a payment slip is accepted.
export const sendPaymentOverdueEmail = async (order, clientEmail) => {
  try {
    if (!clientEmail || !clientEmail.includes("@")) {
      return { success: false, error: "Invalid client email" };
    }

    const orderRef = escapeHtml(order.orderId || order._id);
    const daysOverdue = Math.max(
      0,
      Math.floor((Date.now() - new Date(order.paymentDueDate)) / 86400000),
    );
    const rejected = order.paymentStatus === "REJECTED";
    const frontendBase = process.env.FRONTEND_URL || "http://localhost:3000";

    const body = `
      <p style="font-size: 15px; line-height: 1.6;">
        Dear <strong>${escapeHtml(order.name || "Valued Client")}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6;">
        Payment for order <strong>#${orderRef}</strong> is past due.
        ${rejected ? "Your last payment slip was rejected, so a new slip is needed." : "We have not received a payment slip for this order yet."}
      </p>
      ${infoBlock("Payment Information", [
        ["Order Number", orderRef],
        ["Delivered On", order.deliveredDate ? formatDate(order.deliveredDate) : "N/A"],
        ["Payment Due", formatDate(order.paymentDueDate)],
        ["Days Overdue", String(daysOverdue)],
        ["Amount Due", formatCurrency(order.total)],
      ])}
      ${noticeBlock(
        "<strong>Action needed:</strong> Please upload your payment slip on the Orders &amp; Transactions page. This reminder repeats every 7 days until the payment is received.",
      )}
      <div style="margin: 30px 0; text-align: center;">
        <a href="${frontendBase}/order-transaction" style="display: inline-block; padding: 14px 28px; background-color: #000000; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 4px;">
          Upload Payment Slip
        </a>
      </div>`;

    return await sendEmailWithRetry({
      sender: systemSender(),
      to: [{ email: clientEmail }],
      subject: `Payment Overdue - Order #${order.orderId || order._id}`,
      textContent: `PREMIUMED ENTERPRISES
PAYMENT OVERDUE

Payment for order #${order.orderId || order._id} is past due.
Payment Due: ${formatDate(order.paymentDueDate)}
Days Overdue: ${daysOverdue}
Amount Due: ${formatCurrency(order.total)}

Please upload your payment slip on the Orders & Transactions page:
${frontendBase}/order-transaction

This reminder repeats every 7 days until the payment is received.`,
      htmlContent: brandedEmailHtml("Payment Overdue", body, {
        titleColor: "#b8251e",
      }),
    });
  } catch (error) {
    console.error("Error sending payment overdue email:", error);
    return { success: false, error: error.message };
  }
};

// Sent once to the accountant when a slip has waited 3 days for review.
// The links are fresh because the original ones expire after 3 days.
export const sendSlipReviewReminder = async (
  order,
  accountantEmail,
  { acceptUrl, rejectUrl, slipUrl },
) => {
  try {
    if (!accountantEmail || !accountantEmail.includes("@")) {
      return { success: false, error: "Invalid accountant email" };
    }

    const orderRef = escapeHtml(order.orderId || order._id);
    const body = `
      <p style="font-size: 15px; line-height: 1.6;">
        The payment slip for order <strong>#${orderRef}</strong> has been waiting for review since
        ${order.slipSubmittedAt ? formatDateTime(order.slipSubmittedAt) : "more than 3 days ago"}.
      </p>
      ${infoBlock("Order Information", [
        ["Order Number", orderRef],
        ["Client Name", escapeHtml(order.name || "N/A")],
        ["Order Status", escapeHtml(order.status || "N/A")],
        ["Total", formatCurrency(order.total)],
        ...(slipUrl
          ? [["Payment Slip", `<a href="${slipUrl}" style="color: #000000;">View slip</a>`]]
          : []),
      ])}
      ${noticeBlock(
        "<strong>Reminder:</strong> Please accept or reject this slip. The links below replace the ones in the earlier email and expire in 3 days.",
      )}
      <div style="margin: 30px 0; text-align: center;">
        <a href="${acceptUrl}" style="display: inline-block; padding: 14px 28px; background-color: #2e7d32; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 4px; margin-right: 12px;">
          Accept Payment Slip
        </a>
        <a href="${rejectUrl}" style="display: inline-block; padding: 14px 28px; background-color: #b3261e; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 4px;">
          Reject Payment Slip
        </a>
      </div>`;

    return await sendEmailWithRetry({
      sender: systemSender(),
      to: [{ email: accountantEmail }],
      subject: `Reminder: Payment Slip Awaiting Review - Order #${order.orderId || order._id}`,
      textContent: `PREMIUMED ENTERPRISES
PAYMENT SLIP AWAITING REVIEW

The payment slip for order #${order.orderId || order._id} has been waiting for review for 3 days.
Client: ${order.name || "N/A"}
Total: ${formatCurrency(order.total)}
${slipUrl ? `Payment slip: ${slipUrl}\n` : ""}
To ACCEPT this payment slip:
${acceptUrl}

To REJECT this payment slip:
${rejectUrl}

These links replace the ones in the earlier email and expire in 3 days.`,
      htmlContent: brandedEmailHtml("Payment Slip Awaiting Review", body),
    });
  } catch (error) {
    console.error("Error sending slip review reminder:", error);
    return { success: false, error: error.message };
  }
};

// Sent to every active admin with an email address when a client applies
// for an account.
export const sendClientApplicationEmail = async (application, adminEmails) => {
  try {
    const recipients = (adminEmails || []).filter(
      (email) => email && email.includes("@"),
    );
    if (recipients.length === 0) {
      return { success: false, error: "No admin email addresses" };
    }

    const centerName =
      application.dialysisCenterName || application.username || "A new client";
    const body = `
      <p style="font-size: 15px; line-height: 1.6;">
        A new client account application was submitted and is waiting for review.
      </p>
      ${infoBlock("Application", [
        ["Center Name", escapeHtml(centerName)],
        ["Facility Type", escapeHtml(application.facilityType || "N/A")],
        ["Email", escapeHtml(application.email || "N/A")],
        ["Mobile", escapeHtml(application.mobile || "N/A")],
        ["Address", escapeHtml(application.address || "N/A")],
        ["Submitted", formatDateTime(application.createdAt || Date.now())],
      ])}
      ${noticeBlock("Review the application on the Clients page of the admin site.")}`;

    return await sendEmailWithRetry({
      sender: systemSender(),
      to: recipients.map((email) => ({ email })),
      subject: `New Client Application - ${centerName}`,
      textContent: `PREMIUMED ENTERPRISES
NEW CLIENT APPLICATION

Center Name: ${centerName}
Facility Type: ${application.facilityType || "N/A"}
Email: ${application.email || "N/A"}
Mobile: ${application.mobile || "N/A"}
Address: ${application.address || "N/A"}

Review the application on the Clients page of the admin site.`,
      htmlContent: brandedEmailHtml("New Client Application", body),
    });
  } catch (error) {
    console.error("Error sending client application email:", error);
    return { success: false, error: error.message };
  }
};

export default {
  sendEmailWithRetry,
  sendOrderReceipt,
  sendAccountApprovalEmail,
  sendOrderStatusUpdate,
  sendDepositSlipToAccountant,
  sendEmployeeAccountEmail,
  getDepositSlipRejectedEmail,
};
