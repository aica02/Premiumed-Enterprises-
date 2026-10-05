import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ================= BACKEND FILE PATH =================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const watermarkPath = path.join(
  __dirname,
  "../assets/Premiumed-Watermark.png"
);

const watermark = `data:image/png;base64,${fs
  .readFileSync(watermarkPath)
  .toString("base64")}`;

export const generateOrderReceipt = ({
  title = "Delivery Receipt",
  companyName = "Company",
  companyAddress = "",
  ceo = "",
  totalPrice = "",
  vatReg = "",
  landlineNum = "",
  deliveredTo = "",
  deliveryAddress = "",
  columns = [],
  data = [],
  filename = "report.pdf",
}) => {
  const doc = new jsPDF("p", "pt", "a6");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 125;
  const paddingX = 10;
  const now = new Date();
  const formattedDate = now.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // ================= WATERMARK =================
  const drawWatermark = () => {
    doc.addImage(
      watermark,
      "PNG",
      0,
      0,
      pageWidth,
      pageHeight,
      "Premiumed-Watermark",
      "FAST"
    );
  };

  // ================= HEADER =================
  const drawHeader = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0,0,pageWidth,headerHeight + 10,"F");

    // Gold accent line
    doc.setFillColor(212, 175, 55);
    doc.rect(0,headerHeight + 10,pageWidth,2,"F");

    // Report title
    doc.setFont("helvetica", "bold");
    doc.setTextColor(215, 175, 55);
    doc.setFontSize(9);

    doc.text("Delivery Receipt - ", paddingX, 95);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(title, paddingX + 80, 95);

    // ================= CLIENT / DATE =================
    autoTable(doc, {
      startY: 100,
      margin: {
        left: paddingX,
        right: paddingX,
      },
      body: [
        [
          "Delivered To:", deliveredTo,
          "Date:", formattedDate,
        ],
      ],
      theme: "plain",
      styles: {
        textColor: [0, 0, 0],
        fontSize: 9,
        overflow: "linebreak",
        valign: "top",
        lineWidth: 0,
        cellPadding: {top: 2, right: 0, bottom: 2, left: 0},
      },

      columnStyles: {
        0: {cellWidth: 60, fontStyle: "bold", textColor: [215, 175, 55]},
        1: {cellWidth: 140, halign: "left", textColor: [0, 0, 0]},
        2: {cellWidth: 25, fontStyle: "bold", textColor: [215, 175, 55]},
        3: {cellWidth: 65, textColor: [0, 0, 0]}
      },
    });

    // Address label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(212, 175, 55);
    doc.text("Address:", paddingX, 123);

    // Address value
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(deliveryAddress,paddingX + 45,123);
    const centerX = pageWidth / 2;
    // Company name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(12);
    doc.text(companyName, centerX, 25, { align: "center" });

    // Company address
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(companyAddress, centerX, 38, { align: "center" });

    // CEO
    doc.text(ceo, centerX, 50, { align: "center" });

    // VAT Registration
    doc.text(vatReg, centerX, 62, { align: "center" });

    // Landline
    doc.text(landlineNum, centerX, 74, { align: "center" });
  };

  // ================= FIRST PAGE =================
  drawWatermark();
  drawHeader();

  const sectionY = 120;

  // ================= ITEM TABLE =================
  autoTable(doc, {
    startY: sectionY + 25,
    head: [columns],
    body: data,
    margin: {
      left: paddingX,
      right: paddingX,
    },

    styles: {
      fontSize: 8,
      textColor: [26, 26, 26],
      overflow: "linebreak",
      cellPadding: 2,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },

    columnStyles: {
      0: {cellWidth: 20, halign: "center"},
      1: {cellWidth: 40, halign: "center"},
      2: {cellWidth: 120, halign: "left"},
      3: {cellWidth: 51, halign: "center"},
      4: {cellWidth: 45, halign: "center"}
    },

    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },

    willDrawPage: (dataArg) => {
      if (dataArg.pageNumber > 1) {
        drawWatermark();
        drawHeader();
      }
    },
  });

  // ================= TOTAL =================
  const totalY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: totalY,
    body: [
      [
        "Total",
        `PHP ${Number(totalPrice).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
    ],

    margin: {
      left: pageWidth - paddingX - 87,
      right: paddingX,
    },
    tableWidth: 100,
    theme: "grid",
    styles: {
      fontSize: 8,
      fontStyle: "bold",
      textColor: [0, 0, 0],
      cellPadding: 2,
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      valign: "middle",
    },

    columnStyles: {
      0: {cellWidth: 35, halign: "left"},
      1: {cellWidth: 50, halign: "left", fillColor: [245, 245, 245]},
    },
  });

  // ================= PAGE NUMBERS =================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 70,
      pageHeight - 20
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
};