import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createReportDoc,
  drawDataTable,
  drawInfoRows,
  drawSignatureLines,
  drawTitleRow,
  drawTotalBox,
  addPageNumbers,
} from "./pdfLayout.js";

// ================= BACKEND FILE PATH =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readImage = (fileName) =>
  `data:image/png;base64,${fs
    .readFileSync(path.join(__dirname, "../assets", fileName))
    .toString("base64")}`;

const watermark = readImage("Premiumed-Watermark.png");
const logo = readImage("Premiumed-Logo.png");

// Same layout as the receipt printed from the web app
// (frontend/src/utils/pdf/reportEngine.js), returned as a Buffer for email.
// Columns: QTY | Supply Name | Unit Type | Price | Subtotal
export const generateOrderReceipt = ({
  title = "",
  documentTitle = "Delivery Receipt",
  recipientLabel = "Delivered To:",
  companyName = "Company",
  companyAddress = "",
  ceo = "",
  totalPrice = 0,
  vatReg = "",
  landlineNum = "",
  deliveredTo = "",
  deliveryAddress = "",
  columns = [],
  data = [],
}) => {
  const ctx = createReportDoc({
    company: { companyName, companyAddress, ceo, vatReg, landlineNum },
    logo,
    watermark,
  });
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
  return Buffer.from(ctx.doc.output("arraybuffer"));
};
