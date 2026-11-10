import watermark from "../../assets/Premiumed-Watermark.png";
import {
  addPageNumbers,
  createReportDoc,
  drawDataTable,
  drawInfoRows,
  drawMetaLine,
  drawSignatureLines,
  drawTitleRow,
  drawTotalBox,
} from "./pdfLayout.js";

const pickCompany = (options) => ({
  companyName: options.companyName,
  companyAddress: options.companyAddress,
  ceo: options.ceo,
  vatReg: options.vatReg,
  landlineNum: options.landlineNum,
});

// ===================== ORDER LIST (one order) =====================
// Columns: QTY | Unit Type | Supplies | Price
export const generateReport = (options) => {
  const {
    title = "",
    sectionTitle = "Order List",
    totalPrice = 0,
    orderBy = "",
    deliveryAddress = "",
    columns = [],
    data = [],
    logo,
    filename = "Order List.pdf",
  } = options;

  const ctx = createReportDoc({ company: pickCompany(options), logo, watermark });
  let y = drawTitleRow(ctx, sectionTitle || "Order List");
  y = drawInfoRows(
    ctx,
    [
      ["Order No.:", title],
      ["Ordered By:", orderBy],
      ["Address:", deliveryAddress],
    ],
    y + 8,
  );
  y = drawMetaLine(ctx, `Total Records: ${data.length}`, y + 16);

  y = drawDataTable(ctx, {
    columns,
    data,
    startY: y + 2,
    moneyColumns: [3],
    columnStyles: {
      0: { cellWidth: 60, halign: "center" }, // QTY
      1: { cellWidth: 85, halign: "center" }, // Unit Type
      2: { cellWidth: "auto", halign: "left" }, // Supplies
      3: { cellWidth: 100 }, // Price
    },
  });
  drawTotalBox(ctx, "Total", totalPrice, y + 10);

  addPageNumbers(ctx);
  ctx.doc.save(filename);
};

// ===================== DELIVERY RECEIPT (one order) =====================
// Columns: QTY | Supply Name | Unit Type | Price | Subtotal
export const generateOrderReceipt = (options) => {
  const {
    title = "",
    documentTitle = "Delivery Receipt",
    recipientLabel = "Delivered To:",
    totalPrice = 0,
    deliveredTo = "",
    deliveryAddress = "",
    columns = [],
    data = [],
    logo,
    filename = "Delivery Receipt.pdf",
  } = options;

  const ctx = createReportDoc({ company: pickCompany(options), logo, watermark });
  let y = drawTitleRow(ctx, documentTitle);
  y = drawInfoRows(
    ctx,
    [
      ["Order No.:", title],
      [recipientLabel, deliveredTo],
      ["Address:", deliveryAddress],
    ],
    y + 8,
  );

  y = drawDataTable(ctx, {
    columns,
    data,
    startY: y + 14,
    moneyColumns: [3, 4],
    columnStyles: {
      0: { cellWidth: 50, halign: "center" }, // QTY
      1: { cellWidth: "auto", halign: "left" }, // Supply Name
      2: { cellWidth: 75, halign: "center" }, // Unit Type
      3: { cellWidth: 95 }, // Price
      4: { cellWidth: 105 }, // Subtotal
    },
  });
  y = drawTotalBox(ctx, "Total", totalPrice, y + 10);
  drawSignatureLines(ctx, y);

  addPageNumbers(ctx);
  ctx.doc.save(filename);
};

// ===================== ORDERS REPORT (many orders) =====================
// Columns: Order ID | Client Name | Delivery Status | Requested Delivery Date |
//          Total Items | Items | Total Price
export const generateFilteredReport = (options) => {
  const {
    title = "Orders Report",
    filters = "",
    totalPrice = 0,
    columns = [],
    data = [],
    logo,
    filename = "Orders Report.pdf",
  } = options;

  const ctx = createReportDoc({ company: pickCompany(options), logo, watermark });
  let y = drawTitleRow(ctx, title);
  y += 20;
  if (filters) y = drawMetaLine(ctx, `Filters: ${filters}`, y, { muted: true });
  y = drawMetaLine(ctx, `Total Records: ${data.length}`, y);

  y = drawDataTable(ctx, {
    columns,
    data,
    startY: y + 2,
    moneyColumns: [6],
    hyphenColumns: [0],
    columnStyles: {
      0: { cellWidth: 96, halign: "left" }, // Order ID, wraps at its hyphens
      1: { cellWidth: 86, halign: "left" }, // Client Name
      2: { cellWidth: 66, halign: "center" }, // Delivery Status
      3: { cellWidth: 70, halign: "center" }, // Requested Delivery Date
      4: { cellWidth: 46, halign: "center" }, // Total Items
      5: { cellWidth: "auto", halign: "left" }, // Items
      6: { cellWidth: 75 }, // Total Price
    },
  });
  drawTotalBox(ctx, "Total", totalPrice, y + 10);

  addPageNumbers(ctx);
  ctx.doc.save(filename);
};

// ===================== INVENTORY REPORTS =====================
// type "full":     Supply Name | Unit Type | Category | Qty | Location |
//                  Expiration Date | FEFO Status | Stock Status
// type "disposed": same, with Price instead of Stock Status, plus a total.
export const generateInventoryReport = (options) => {
  const {
    title = "Inventory Report",
    sectionTitle = "",
    totalValue = 0,
    columns = [],
    data = [],
    logo,
    filename = "Inventory Report.pdf",
    type = "full",
  } = options;

  const isDisposed = type === "disposed";
  const ctx = createReportDoc({ company: pickCompany(options), logo, watermark });
  let y = drawTitleRow(ctx, sectionTitle || title);
  y = drawMetaLine(ctx, `Total Records: ${data.length}`, y + 20);

  y = drawDataTable(ctx, {
    columns,
    data,
    startY: y + 2,
    moneyColumns: isDisposed ? [7] : [],
    columnStyles: isDisposed
      ? {
          0: { cellWidth: 80, halign: "left" }, // Supply Name
          1: { cellWidth: 45, halign: "center" }, // Unit Type
          2: { cellWidth: "auto", halign: "left" }, // Category
          3: { cellWidth: 35, halign: "center" }, // Qty
          4: { cellWidth: 50, halign: "center" }, // Location
          5: { cellWidth: 72, halign: "center" }, // Expiration Date
          6: { cellWidth: 65, halign: "center" }, // FEFO Status
          7: { cellWidth: 70 }, // Price
        }
      : {
          0: { cellWidth: 95, halign: "left" }, // Supply Name
          1: { cellWidth: 50, halign: "center" }, // Unit Type
          2: { cellWidth: "auto", halign: "left" }, // Category
          3: { cellWidth: 35, halign: "center" }, // Qty
          4: { cellWidth: 50, halign: "center" }, // Location
          5: { cellWidth: 70, halign: "center" }, // Expiration Date
          6: { cellWidth: 65, halign: "center" }, // FEFO Status
          7: { cellWidth: 75, halign: "center" }, // Stock Status
        },
  });
  if (isDisposed) drawTotalBox(ctx, "Total Disposed Value", totalValue, y + 10);

  addPageNumbers(ctx);
  ctx.doc.save(filename);
};
