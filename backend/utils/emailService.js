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
    let dateChangeInfo = "";

    if (newStatus === "RETURNED" && (orderData.oldDate || orderData.newDate)) {
      dateChangeInfo = `
        <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
          <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
            Date Change Details
          </h3>

          <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
            <strong>Old Date:</strong> ${orderData.oldDate || "N/A"}
          </p>

          <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
            <strong>New Date:</strong> ${orderData.newDate || "N/A"}
          </p>

          <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
            <strong>Reason:</strong> ${orderData.dateChangeReason || orderData.dateNote || "No reason provided"}
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
          <div style="margin-bottom: 15px; padding: 15px; background-color: #f8f8f8; border-left: 3px solid #d4af37;">
            <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.5;">
              <strong>${index + 1}. ${itemName}</strong>
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
Update Date: ${new Date().toLocaleString()}

${statusMessage}

${
  newStatus === "RETURNED" && (orderData.oldDate || orderData.newDate)
    ? `
DATE CHANGE DETAILS
Old Date: ${orderData.oldDate || "N/A"}
New Date: ${orderData.newDate || "N/A"}
Reason: ${orderData.dateChangeReason || orderData.dateNote || "No reason provided"}

Please review and approve the new delivery date by logging into your account.
`
    : ""
}

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
${new Date().getFullYear()}
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
                  <strong>Update Date:</strong> ${new Date().toLocaleString()}
                </p>
              </div>

              ${dateChangeInfo}

              <div style="margin: 25px 0;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                  Order Summary
                </h3>

                ${itemsList}

                <div style="margin-top: 20px; padding: 15px; background-color: #f8f8f8; border-top: 1px solid #dddddd; border-left: 4px solid #d4af37;">
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
          return `${index + 1}. ${item.name} - ${item.quantity} Pcs. - ₱${(
            item.price * item.quantity
          ).toFixed(2)}`;
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
            ${item.name}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: center; color: #333333;">
            ${item.quantity} Pcs.
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: right; color: #333333;">
            ₱${(item.price * item.quantity).toFixed(2)}
          </td>
        </tr>
      `;
        })
        .join("") ||
      `
      <tr>
        <td colspan="4" style="padding: 15px; text-align: center; color: #777777;">
          No items listed
        </td>
      </tr>
    `;

    // ─────────────────────────────────────────────────────────────
    // Generate a secure, time-limited token for the reject action
    // ─────────────────────────────────────────────────────────────
    const rejectToken = crypto.randomBytes(32).toString("hex");

    // Persist token + expiry so the route can verify it later
    try {
      await Order.updateOne(
        { _id: orderData._id },
        {
          $set: {
            rejectToken,
            rejectTokenExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3), // 3 days
          },
        },
      );
    } catch (persistErr) {
      console.error("Failed to persist reject token:", persistErr.message);
      return { success: false, error: "Failed to generate reject link" };
    }

    const backendBase = process.env.BACKEND_URL || "http://localhost:5000";
    const rejectUrl = `${backendBase}/api/clients/reject-deposit?token=${rejectToken}`;

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
Order Date: ${new Date(orderData.createdAt || Date.now()).toLocaleString()}
New Status: TO SHIP

ORDER DETAILS
-------------
${itemsList}

Subtotal: ₱${totalAmount.toFixed(2)}
Total: ₱${(orderData.total || totalAmount).toFixed(2)}

Delivery Address: ${orderData.deliveryAddress || orderData.shippingAddress || "N/A"}
Contact: ${orderData.contactNumber || orderData.procurementMobile || "N/A"}

The payment slip is attached to this email. Please verify and process accordingly.

If the payment slip is invalid, you can reject it here:
${rejectUrl}

-----------------------------------------
This is an automated message from the Premiumed Enterprises system.
${new Date().getFullYear()}
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
                    ${orderData.customerName || orderData.name || "N/A"}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Order Date:</strong>
                    ${new Date(orderData.createdAt || Date.now()).toLocaleString()}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>New Status:</strong>
                    <span style="color: #2e7d32; font-weight: bold;">
                      TO SHIP
                    </span>
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
                          Item Name
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

                <div style="margin-top: 20px; padding: 20px; background-color: #f8f8f8; border: 1px solid #dddddd;">
                  <p style="margin: 8px 0; font-size: 14px; text-align: left;">
                    <strong>Subtotal:</strong>
                    ₱${totalAmount.toFixed(2)}
                  </p>

                  <p style="margin: 8px 0; font-size: 18px; text-align: left; color: #222222;">
                    <strong>Total:</strong>
                    ₱${(orderData.total || totalAmount).toFixed(2)}
                  </p>
                </div>

                <div style="margin-top: 25px; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                  <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                    Delivery Information
                  </h3>

                  <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                    <strong>Delivery Address:</strong><br>
                    ${orderData.deliveryAddress || orderData.shippingAddress || "N/A"}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Contact:</strong>
                    ${orderData.contactNumber || orderData.procurementMobile || "N/A"}
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
                    href="${rejectUrl}"
                    style="
                      display: inline-block;
                      padding: 14px 24px;
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
                  This is an automated message from the Premiumed Enterprises system.
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
                Hello ${username || "Customer"},
              </p>

              <p style="font-size: 15px; line-height: 1.6;">
                Your submitted payment slip for order
                <strong>#${orderId}</strong>
                was verified and could not be accepted.
              </p>

              <!-- ORDER INFORMATION -->
              <div style="margin: 25px 0; padding: 20px; background-color: #f8f8f8; border-left: 4px solid #d4af37;">
                <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px; color: #222222;">
                  Order Information
                </h3>

                <p style="margin: 8px 0; font-size: 14px;">
                  <strong>Order Number:</strong>
                  #${orderId}
                </p>

                <p style="margin: 8px 0; font-size: 14px;">
                  <strong>Payment Status:</strong>
                  <span style="color: #b8251e; font-weight: bold;">
                    PENDING
                  </span>
                </p>
              </div>

              <div style="margin: 25px 0; padding: 20px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                <p style="margin: 0; font-size: 14px; line-height: 1.6;">
                  <strong>Important:</strong>
                  Your payment status has been reset to
                  <strong>PENDING</strong>.
                  Please re-upload a valid payment slip to complete your transaction.
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

              <p style="font-size: 13px; color: #777777; line-height: 1.5;">
                If you have any questions, please contact our support team.
              </p>

              <p style="font-size: 13px; color: #777777; line-height: 1.5;">
                This is an automated message from the Premiumed Enterprises system.
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
    const itemsList = orderData.items
      .map((item, index) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        const itemSubtotal = price * quantity;
        return `${index + 1}. ${item.name} - ${quantity} Pcs. - ₱${price.toFixed(2)} - Subtotal: ₱${itemSubtotal.toFixed(2)}`;
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
      deliveredTo: orderData.clientName || orderData.name || "N/A",
      vatReg: "VAT REG. TIN: 000-000-000",
      landlineNum: "(044) 812-2280",
      totalPrice: orderData.total || total,
      deliveryAddress: orderData.shippingAddress || orderData.address || "N/A",
      columns: ["QTY", "Unit", "Articles", "Price", "Subtotal"],
      data: orderData.items.map((item, index) => {
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        const itemSubtotal = price * quantity;

        return [
          `${quantity}`,
          item.unit,
          item.name,
          `${price.toFixed(2)}`,
          `${itemSubtotal.toFixed(2)}`,
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
            ${item.name}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: center; color: #333333;">
            ${quantity} Pcs.
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: right; color: #333333;">
            ₱${price.toFixed(2)}
          </td>

          <td style="padding: 12px; border-bottom: 1px solid #dddddd; font-size: 14px; text-align: right; color: #333333;">
            ₱${(price * quantity).toFixed(2)}
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
Order Date: ${new Date(orderData.createdAt || Date.now()).toLocaleString()}
Status: TO SHIP

CLIENT INFORMATION
------------------
Client Name: ${orderData.clientName || orderData.name || "N/A"}
Delivery Address: ${orderData.shippingAddress || orderData.address || "N/A"}
Contact: ${orderData.contactNumber || orderData.procurementMobile || "N/A"}

ORDER DETAILS
------------
${itemsList}

Subtotal: ₱${subtotal.toFixed(2)}
Total: ₱${total.toFixed(2)}

------------------
Thank you for your order! Kindly submit the Payment Slip once you received this email.

Premiumed Enterprises
${new Date().getFullYear()}
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
                    ${new Date(orderData.createdAt || Date.now()).toLocaleString()}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Status:</strong>
                    <span style="color: #2e7d32; font-weight: bold;">
                      TO SHIP
                    </span>
                  </p>
                </div>

                <h3 style="margin-top: 30px; margin-bottom: 15px; font-size: 17px; color: #222222;">
                  Client Information
                </h3>

                <div style="padding: 20px; background-color: #f8f8f8; border: 1px solid #dddddd;">
                  <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                    <strong>Client Name:</strong><br>
                    ${orderData.clientName || orderData.name || "N/A"}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px; line-height: 1.5;">
                    <strong>Delivery Address:</strong><br>
                    ${orderData.shippingAddress || orderData.address || "N/A"}
                  </p>

                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Contact:</strong>
                    ${orderData.contactNumber || orderData.procurementMobile || "N/A"}
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
                          Item
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

                <div style="margin-top: 20px; padding: 20px; background-color: #f8f8f8; border: 1px solid #dddddd;">
                  <p style="margin: 8px 0; font-size: 14px; text-align: left;">
                    <strong>Subtotal:</strong>
                    ₱${subtotal.toFixed(2)}
                  </p>
                  <p style="margin: 8px 0; font-size: 18px; text-align: left; color: #222222;">
                    <strong>Total:</strong>
                    ₱${total.toFixed(2)}
                  </p>
                </div>

                <div style="margin: 25px 0; padding: 15px; background-color: #fff8e1; border: 1px solid #e6d28a;">
                  <p style="margin: 0; font-size: 14px; line-height: 1.5;">
                    <strong>Important:</strong>
                    Kindly submit the Payment Slip once you receive this email.
                    Please ensure that the uploaded payment slip is clear and readable.
                  </p>
                </div>
                <p style="font-size: 13px; color: #777777; line-height: 1.5;">
                  This is an automated message from the Premiumed Enterprises system.
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

IMPORTANT: For security reasons, please change your password after your first login.

If you have any questions, please contact our support team.
This is an automated message, please do not reply to this email.

Premiumed Enterprises
${new Date().getFullYear()}
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
                Dear <strong>${centerName}</strong>,
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
                  <strong>IMPORTANT:</strong>
                  For security reasons, please change your password after your first login.
                </p>
              </div>
              <p style="font-size: 15px; line-height: 1.6;">
                If you have any questions, please contact our support team.
              </p>

              <p style="font-size: 13px; color: #777777;">
                This is an automated message, please do not reply to this email.
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

Your employee account has been successfully created.

ACCOUNT DETAILS:
----------------
Role: ${role}
Employee ID: ${employeeId || "N/A"}
Username: ${username}
Password: ${password}

IMPORTANT: For security reasons, please log in and change your password as soon as possible.

This is an automated message. Please do not reply to this email.

Premiumed Enterprises
${new Date().getFullYear()}
      `.trim(),
      htmlContent: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background-color: #1a252f; padding: 20px; text-align: center; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px;">PREMIUMED ENTERPRISES</h2>
            <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.8;">Employee Account Created</p>
          </div>
          
          <div style="padding: 30px; background-color: #f9f9f9; border: 1px solid #e0e0e0;">
            <p style="margin-top: 0;">Dear <strong>${fullName}</strong>,</p>
            <p>Welcome to the team! Your official employee account has been successfully created.</p>
            
            <div style="background-color: #ffffff; border: 1px solid #dcdcdc; border-radius: 6px; padding: 20px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1a252f; border-bottom: 1px solid #eee; padding-bottom: 10px;">Account Credentials</h3>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; color: #666; width: 140px;"><strong>Role:</strong></td>
                  <td style="padding: 6px 0;">${role}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666;"><strong>Employee ID:</strong></td>
                  <td style="padding: 6px 0;">${employeeId || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666;"><strong>Username:</strong></td>
                  <td style="padding: 6px 0;"><code style="background-color: #f4f4f4; padding: 3px 6px; border-radius: 4px; font-weight: bold; color: #2c3e50;">${username}</code></td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666;"><strong>Temporary Password:</strong></td>
                  <td style="padding: 6px 0;"><code style="background-color: #f4f4f4; padding: 3px 6px; border-radius: 4px; font-weight: bold; color: #d9534f;">${password}</code></td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 15px; margin: 20px 0; border-radius: 0 4px 4px 0;">
              <p style="margin: 0; font-size: 13px; color: #856404;">
                <strong>Important:</strong> For security reasons, please log in and change your password immediately after your first sign-in.
              </p>
            </div>
            
            <p style="font-size: 12px; color: #888; text-align: center; margin-bottom: 0;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
          
          <div style="background-color: #f1f1f1; padding: 12px; text-align: center; font-size: 12px; color: #666;">
            &copy; ${new Date().getFullYear()} Premiumed Enterprises. All rights reserved.
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

export default {
  sendEmailWithRetry,
  sendOrderReceipt,
  sendAccountApprovalEmail,
  sendOrderStatusUpdate,
  sendDepositSlipToAccountant,
  sendEmployeeAccountEmail,
  getDepositSlipRejectedEmail,
};
