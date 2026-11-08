// Shared layout for every Premiumed PDF (reports, order list, receipts).
//
// Every document gets the same header, title row, table style, total box and
// page numbers, so spacing and fonts stay consistent. Peso amounts use the
// PesoSans font (see pesoFont.js) because the built-in fonts have no "₱".
//
// The web app (frontend/src/utils/pdf/pdfLayout.js) and the backend
// (backend/utils/pdfLayout.js, used for the emailed order receipt) keep
// identical copies of this file. Change both together.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PESO_FONT, formatPeso, registerPesoFont } from "./pesoFont.js";

export const PADDING_X = 30;
const HEADER_LINE_Y = 110; // gold bar under the company header
const TITLE_Y = 135; // baseline of the report title on page 1
const CONTENT_TOP = 130; // where tables continue on pages 2+
const GOLD = [212, 175, 55];
const BLACK = [0, 0, 0];
const TEXT = [26, 26, 26];
const MUTED = [90, 90, 90];
const HEAD_FILL = [246, 239, 215];
const ZEBRA = [245, 245, 245];

// "Nov 6, 2026". Accepts a Date, a timestamp, an ISO string or a plain
// "YYYY-MM-DD" calendar date. Plain dates are read at noon UTC so they never
// shift a day in any time zone. Anything unreadable is returned as text.
export const formatReportDate = (value = new Date()) => {
  if (value === null || value === undefined || value === "") return "N/A";
  let date;
  const text = typeof value === "string" ? value.trim() : "";
  const plainDate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plainDate) {
    const [, y, m, d] = plainDate.map(Number);
    date = new Date(Date.UTC(y, m - 1, d, 12));
  } else {
    date = value instanceof Date ? value : new Date(value);
  }
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Creates the A4 document, draws the header on page 1 and returns helpers.
// company: { companyName, companyAddress, ceo, vatReg, landlineNum }
// logo / watermark: image data URLs (either may be missing).
export const createReportDoc = ({ company = {}, logo, watermark }) => {
  const doc = new jsPDF("p", "pt", "a4");
  registerPesoFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - PADDING_X;

  const drawPageChrome = () => {
    if (watermark) {
      doc.addImage(watermark, "PNG", 0, 0, pageWidth, pageHeight, "Premiumed-Watermark", "FAST");
    }

    const textX = logo ? PADDING_X + 85 : PADDING_X;
    if (logo) {
      doc.addImage(logo, "PNG", PADDING_X, 20, 70, 70, "Premiumed-Logo", "FAST");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...GOLD);
    doc.text(company.companyName || "", textX, 31);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);
    doc.setFontSize(11);
    doc.text(company.companyAddress || "", textX, 46);
    doc.text(company.ceo || "", textX, 62);
    doc.setFontSize(10);
    doc.text(company.vatReg || "", textX, 76);
    doc.text(company.landlineNum || "", textX, 90);

    doc.setFillColor(...GOLD);
    doc.rect(0, HEADER_LINE_Y, pageWidth, 2, "F");
  };

  drawPageChrome();

  // Redraw the header when a table runs onto a new page.
  const onNewPage = (data) => {
    if (data.pageNumber > 1) drawPageChrome();
  };

  return { doc, pageWidth, pageHeight, right, drawPageChrome, onNewPage };
};

// Title on the left, "Date: Nov 6, 2026" on the right, gold divider below.
// Returns the y just under the divider.
export const drawTitleRow = (ctx, title, y = TITLE_Y) => {
  const { doc, right } = ctx;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BLACK);
  doc.text(String(title || ""), PADDING_X, y);

  const dateText = formatReportDate(new Date());
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(dateText, right, y, { align: "right" });
  const dateWidth = doc.getTextWidth(dateText);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("Date:", right - dateWidth - 5, y, { align: "right" });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(PADDING_X, y + 8, right, y + 8);
  doc.setTextColor(...BLACK);
  return y + 8;
};

// Gold labels with black values (Order No., Delivered To, Address...).
// Long values wrap. Returns the y under the block.
export const drawInfoRows = (ctx, rows, startY) => {
  const { doc, onNewPage } = ctx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const labelWidth =
    Math.max(...rows.map(([label]) => doc.getTextWidth(String(label)))) + 8;

  autoTable(doc, {
    startY,
    body: rows.map(([label, value]) => [label, value || "N/A"]),
    theme: "plain",
    margin: { top: CONTENT_TOP, left: PADDING_X, right: PADDING_X },
    styles: {
      font: "helvetica",
      fontSize: 11,
      textColor: BLACK,
      overflow: "linebreak",
      valign: "top",
      cellPadding: { top: 2, right: 0, bottom: 2, left: 0 },
    },
    columnStyles: {
      0: { cellWidth: labelWidth, fontStyle: "bold", textColor: GOLD },
      1: { cellWidth: "auto" },
    },
    willDrawPage: onNewPage,
  });
  return doc.lastAutoTable.finalY;
};

// A plain line of text under the title (Total Records, Filters...).
// Long text wraps. Returns the y of the next line.
export const drawMetaLine = (ctx, text, y, { muted = false } = {}) => {
  const { doc, right } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(muted ? 10 : 11);
  doc.setTextColor(...(muted ? MUTED : BLACK));
  const lines = doc.splitTextToSize(String(text), right - PADDING_X);
  doc.text(lines, PADDING_X, y);
  doc.setTextColor(...BLACK);
  return y + lines.length * (muted ? 12 : 13) + 3;
};

// Splits a long code such as "Order01-11062026-AB12" at its hyphens so it
// wraps as "Order01-11062026-" / "AB12" instead of breaking mid-character.
const breakAtHyphens = (doc, value, maxWidth) => {
  const text = String(value ?? "");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (doc.getTextWidth(text) <= maxWidth || !text.includes("-")) return text;
  const parts = text.split(/(?<=-)/);
  const lines = [];
  let line = "";
  parts.forEach((part) => {
    if (line && doc.getTextWidth(line + part) > maxWidth) {
      lines.push(line);
      line = part;
    } else {
      line += part;
    }
  });
  if (line) lines.push(line);
  return lines.join("\n");
};

// The main data table. moneyColumns are column indexes holding amounts:
// they are formatted as "₱1,234.00", right-aligned, in the peso font.
// hyphenColumns hold codes that should wrap at their hyphens; they need a
// numeric cellWidth in columnStyles.
export const drawDataTable = (
  ctx,
  { columns, data, columnStyles = {}, moneyColumns = [], hyphenColumns = [], startY },
) => {
  const { doc, onNewPage } = ctx;
  const styles = { ...columnStyles };
  moneyColumns.forEach((index) => {
    styles[index] = { ...(styles[index] || {}), font: PESO_FONT, halign: "right" };
  });
  const body = data.map((row) =>
    row.map((cell, index) => {
      if (moneyColumns.includes(index)) return formatPeso(cell);
      if (hyphenColumns.includes(index)) {
        return breakAtHyphens(doc, cell, Number(styles[index]?.cellWidth) - 8);
      }
      return cell;
    }),
  );

  autoTable(doc, {
    startY,
    head: [columns],
    body,
    margin: { top: CONTENT_TOP, left: PADDING_X, right: PADDING_X },
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      textColor: TEXT,
      overflow: "linebreak",
      cellPadding: 4,
      lineWidth: 0.1,
      lineColor: BLACK,
      valign: "middle",
    },
    headStyles: {
      font: "helvetica",
      fillColor: HEAD_FILL,
      textColor: BLACK,
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: styles,
    willDrawPage: onNewPage,
  });
  return doc.lastAutoTable.finalY;
};

// "Total | ₱16,750.00" box, right-aligned with the table's right edge.
export const drawTotalBox = (ctx, label, amount, startY) => {
  const { doc, pageWidth, onNewPage } = ctx;
  const amountText = formatPeso(amount);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const labelWidth = Math.max(50, doc.getTextWidth(String(label)) + 16);
  doc.setFont(PESO_FONT, "bold");
  const amountWidth = Math.max(95, doc.getTextWidth(amountText) + 16);

  autoTable(doc, {
    startY,
    body: [[label, amountText]],
    theme: "grid",
    rowPageBreak: "avoid",
    margin: {
      top: CONTENT_TOP,
      left: pageWidth - PADDING_X - labelWidth - amountWidth,
      right: PADDING_X,
    },
    tableWidth: labelWidth + amountWidth,
    styles: {
      font: "helvetica",
      fontSize: 10,
      fontStyle: "bold",
      textColor: BLACK,
      cellPadding: 4,
      lineWidth: 0.5,
      lineColor: BLACK,
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: labelWidth, halign: "center", fillColor: HEAD_FILL },
      1: { cellWidth: amountWidth, halign: "right", font: PESO_FONT, fillColor: ZEBRA },
    },
    willDrawPage: onNewPage,
  });
  return doc.lastAutoTable.finalY;
};

// Prepared / Checked / Approved / Received By lines across the page.
export const drawSignatureLines = (ctx, afterY) => {
  const { doc, pageWidth, pageHeight, right, drawPageChrome } = ctx;
  let y = afterY + 60;
  if (y + 30 > pageHeight - 40) {
    doc.addPage();
    drawPageChrome();
    y = CONTENT_TOP + 60;
  }
  const labels = ["Prepared By", "Checked By", "Approved By", "Received By"];
  const slot = (right - PADDING_X) / labels.length;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  labels.forEach((label, index) => {
    const centerX = PADDING_X + slot * index + slot / 2;
    doc.line(centerX - 45, y, centerX + 45, y);
    doc.text(label, centerX, y + 14, { align: "center" });
  });
  return y + 14;
};

// "Page 1 of 3" at the bottom right of every page.
export const addPageNumbers = (ctx) => {
  const { doc, pageHeight, right } = ctx;
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(`Page ${i} of ${pageCount}`, right, pageHeight - 20, { align: "right" });
  }
};
