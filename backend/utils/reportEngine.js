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
  const doc = new jsPDF("p", "pt", "a5");
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

  // ================= HEADER =================
  const drawHeader = () => {
    const rowwY = 145;

    // black header background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, headerHeight + 10, "F");

    // gold accent line
    doc.setFillColor(212, 175, 55);
    doc.rect(0, headerHeight + 15, pageWidth, 2, "F");

    // report title
    doc.setFont("helvetica", "bold");
    doc.setTextColor(215, 175, 55);
    doc.setFontSize(11);
    doc.text("Delivery Receipt - ", paddingX, 100);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(title, paddingX + 98, 100);

    autoTable(doc, {
      startY: 105,
      margin: {left: paddingX, right: paddingX,},
      body: [
        [
          "Delivered To:", deliveredTo,
          "Date:", formattedDate,
        ],
      ],

      theme: "plain",
      styles: {
        textColor: [255, 255, 255],
        fontSize: 11,
        overflow: "linebreak",
        valign: "top",
        lineWidth: 0,
        cellPadding: {
          top: 2,
          right: 0,
          bottom: 2,
          left: 0,
        },
      },

      columnStyles: {
        0: { cellWidth: 75, fontStyle: "bold", textColor: [215, 175, 55] }, // delivered to
        1: { cellWidth: 225, align: "left",  textColor: [0, 0, 0]},
        2: { cellWidth: 30, fontStyle: "bold", textColor: [215, 175, 55] }, // date
        3: { cellWidth: 65,  textColor: [0, 0, 0] },
      },
    });

    // Address label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(212, 175, 55);
    doc.text("Address:", paddingX, 132);

    // Address value
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(deliveryAddress, paddingX + 55,132);

    const centerX = pageWidth / 2;

    // company name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(13);
    doc.text(companyName, centerX, 25, { align: "center" });

    // company address
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(companyAddress, centerX, 38, { align: "center" });

    // CEO name
    doc.setFont("helvetica", "normal");
    doc.text(ceo, centerX, 50, { align: "center" });

    // VAT Registration
    doc.setFont("helvetica", "normal");
    doc.text(vatReg, centerX, 62, { align: "center" });

    // Landline Number
    doc.setFont("helvetica", "normal");
    doc.text(landlineNum, centerX, 74, { align: "center" });
    doc.setTextColor(0, 0, 0);
  };

  const drawWatermark = () => {
    if (!watermark) return;

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

  drawWatermark();
  drawHeader();
  const sectionY = 120;

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 30,
    head: [columns],
    body: data,
    margin: { left: paddingX, right: paddingX },

    styles: {
      fontSize: 10,
      textColor: [26, 26, 26],
      overflow: "linebreak", // Wrap long text
      cellPadding: 2,
      lineWidth: 0.1,          // Border thickness
      lineColor: [0, 0, 0],    // Black border
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center"
    },

    columnStyles: {
    0: {cellWidth: 45, halign:"center"}, // First column
    1: {cellWidth: 60, halign:"center"}, // Second column
    2: {cellWidth: 150}, // Third column
    3: {cellWidth: 71, halign:"center"}, // Fourth column
    4: {cellWidth: 71, halign:"center"}
  },

    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },

    didDrawPage: (dataArg) => {
      if (dataArg.pageNumber > 1) {
        drawHeader();
      }
    }
  });

  const totalY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: totalY,
    body: [[
      "Total",
      `${Number(totalPrice).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    ]],

    margin: {
      left: pageWidth - paddingX - 107,
      right: paddingX
    },

    tableWidth: 100, theme: "grid",

    styles: {
      fontSize: 10,
      fontStyle: "bold",
      textColor: [0, 0, 0],
      cellPadding: 2,
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      valign: "middle",
    },

    columnStyles: {
      0: {cellWidth: 35,halign: "center"},
      1: {cellWidth: 70,halign: "center",fillColor: [245, 245, 245]}
    },
  });

    // ================= SIGNATURE LINES =================
  const signatureY = doc.lastAutoTable.finalY + 45;

  const signatureLabels = [
    "Prepared By",
    "Checked By",
    "Approved By",
    "Received By"
  ];

  const sectionWidth = pageWidth / 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  signatureLabels.forEach((label, index) => {
    const centerX = sectionWidth * index + sectionWidth / 2;
    const lineWidth = 80;

    // Signature line
    doc.line(
      centerX - lineWidth / 2,
      signatureY,
      centerX + lineWidth / 2,
      signatureY
    );

    // Label
    doc.text(
      label,
      centerX,
      signatureY + 14,
      { align: "center" }
    );
  });

  // ================= PAGE NUMBERS =================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 70,
      pageHeight - 20
    );
  }
  // ================= SAVE FILE =================
  doc.save(filename);
};