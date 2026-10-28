import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import watermark from "../../assets/Premiumed-Watermark.png";

export const generateReport = ({
  title = "Order Receipt",
  companyName = "Company",
  companyAddress = "",
  ceo = "",
  totalPrice = "",
  vatReg = "",
  sectionTitle = "Order List",
  landlineNum = "",
  orderBy = "",
  deliveryAddress = "",
  columns = [],
  data = [],
  logo,
  filename = "Order Report.pdf",
}) => {
  const doc = new jsPDF("p", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 100;
  const paddingX = 30;
  const now = new Date();
  const formattedDate = now.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // ================= HEADER =================
  const drawHeader = () => {
    // Gold accent line
    doc.setFillColor(212, 175, 55);
    doc.rect(0, headerHeight + 10, pageWidth, 2, "F");

    // company logo
    if (logo) {
      doc.addImage(
        logo,
        "PNG",
        paddingX,
        20,
        70,
        70,
        "Premiumed-Logo",
        "FAST"
      );
    }

    // ================= COMPANY NAME =================
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(15);
    doc.text(companyName, paddingX + 85, 31, { align: "left" });

    // ================= COMPANY ADDRESS =================
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(companyAddress, paddingX + 85, 46, { align: "left" });

    // ================= CEO =================
    doc.setFontSize(11);
    doc.text(ceo, paddingX + 85, 62, { align: "left" });

    // ================= VAT =================
    doc.setFontSize(10);
    doc.text(vatReg, paddingX + 85, 76, { align: "left" });

    // ================= LANDLINE =================
    doc.text(landlineNum, paddingX + 85, 90, { align: "left" });
  };

  // ================= WATERMARK =================
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
      "FAST",
    );
  };

  drawWatermark();
  drawHeader();
  const sectionY = headerHeight + 30;

  // report title
  doc.setFont("helvetica", "bold");
  doc.setTextColor(215, 175, 55);
  doc.setFontSize(12);
  doc.text(sectionTitle || title, paddingX, sectionY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(" - " + title, paddingX + 58, sectionY);

  autoTable(doc, {
    startY: sectionY + 7,
    margin: { left: paddingX, right: paddingX },
    body: [["Ordered By:", orderBy, "Date:", formattedDate]],

    theme: "plain",
    styles: {
      textColor: [0, 0, 0],
      fontSize: 12,
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
      0: { cellWidth: 75, fontStyle: "bold", textColor: [215, 175, 55] }, // ordered by
      1: { cellWidth: 361, align: "left", textColor: [0, 0, 0] },
      2: { cellWidth: 36, fontStyle: "bold", textColor: [215, 175, 55] }, // date
      3: { cellWidth: 85, textColor: [0, 0, 0] },
    },
  });

  // Address label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);
  doc.text("Address: ", paddingX, sectionY + 36);

  // Address value
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(deliveryAddress, paddingX + 57, sectionY + 36);

  // gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.line(paddingX, sectionY + 48, pageWidth - paddingX, sectionY + 48);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(sectionTitle, paddingX, sectionY + 70);

  // total records
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`- Total Records: ${data.length}`, paddingX + 75, sectionY + 70);

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 85,
    head: [columns],
    body: data,
    margin: { left: paddingX, right: paddingX },

    styles: {
      fontSize: 10,
      textColor: [26, 26, 26],
      overflow: "linebreak", // Wrap long text
      cellPadding: 4,
      lineWidth: 0.1, // Border thickness
      lineColor: [0, 0, 0], // Black border
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },

    columnStyles: {
      0: { cellWidth: 60, halign: "center" }, // First column
      1: { cellWidth: 85, halign: "center" }, // Second column
      2: { cellWidth: 295, halign: "left" }, // Third column
      3: { cellWidth: 95, halign: "center" }, // Fourth column
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

  const totalY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: totalY,
    didDrawPage: () => {
      drawHeader();
    },

    body: [
      [
        "Total",
        `${Number(totalPrice).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
    ],

    margin: {
      left: pageWidth - paddingX - 145,
      right: paddingX,
    },

    tableWidth: 100,
    theme: "grid",
    styles: {
      fontSize: 10,
      fontStyle: "bold",
      textColor: [0, 0, 0],
      cellPadding: 4,
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      valign: "middle",
    },

    columnStyles: {
      0: { cellWidth: 50, halign: "center" },
      1: { cellWidth: 95, halign: "center", fillColor: [245, 245, 245] },
    },
  });

  // ================= PAGE NUMBERS =================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 70, pageHeight - 20);
  }
  // ================= SAVE FILE =================
  doc.save(filename);
};

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
  const doc = new jsPDF("p", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 125;
  const paddingX = 20;
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
    doc.rect(0, headerHeight + 40, pageWidth, 2, "F");

    // report title
    doc.setFont("helvetica", "bold");
    doc.setTextColor(215, 175, 55);
    doc.setFontSize(12);
    doc.text("Delivery Receipt - ", paddingX, 120);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text(title, paddingX + 104, 120);

    autoTable(doc, {
      startY: 125,
      margin: { left: paddingX, right: paddingX },
      body: [["Delivered To:", deliveredTo, "Date:", formattedDate]],

      theme: "plain",
      styles: {
        textColor: [255, 255, 255],
        fontSize: 12,
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
        0: { cellWidth: 80, fontStyle: "bold", textColor: [215, 175, 55] }, // delivered to
        1: { cellWidth: 380, align: "left", textColor: [0, 0, 0] },
        2: { cellWidth: 32, fontStyle: "bold", textColor: [215, 175, 55] }, // date
        3: { cellWidth: 65, textColor: [0, 0, 0] },
      },
    });

    // Address label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(212, 175, 55);
    doc.text("Address:", paddingX, 154);

    // Address value
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(deliveryAddress, paddingX + 55, 154);

    const centerX = pageWidth / 2;

    // company name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(16);
    doc.text(companyName, centerX, 27, { align: "center" });

    // company address
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.text(companyAddress, centerX, 44, { align: "center" });

    // CEO name
    doc.setFont("helvetica", "normal");
    doc.text(ceo, centerX, 58, { align: "center" });

    // VAT Registration
    doc.setFont("helvetica", "normal");
    doc.text(vatReg, centerX, 72, { align: "center" });

    // Landline Number
    doc.setFont("helvetica", "normal");
    doc.text(landlineNum, centerX, 86, { align: "center" });
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
      "FAST",
    );
  };

  drawWatermark();
  drawHeader();
  const sectionY = 150;

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 30,
    head: [columns],
    body: data,
    margin: { left: paddingX, right: paddingX },

    styles: {
      fontSize: 12,
      textColor: [26, 26, 26],
      overflow: "linebreak", // Wrap long text
      cellPadding: 2,
      lineWidth: 0.1, // Border thickness
      lineColor: [0, 0, 0], // Black border
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },

    columnStyles: {
      0: { cellWidth: 65, halign: "center" }, // First column
      1: { cellWidth: 210 }, // Supply name
      2: { cellWidth: 80, halign: "center" }, // Unit type
      3: { cellWidth: 100, halign: "center" }, // Fourth column
      4: { cellWidth: 100, halign: "center" },
    },

    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },

    didDrawPage: (dataArg) => {
      if (dataArg.pageNumber > 1) {
        drawHeader();
      }
    },
  });

  const totalY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: totalY,
    body: [
      [
        "Total",
        `${Number(totalPrice).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
    ],

    margin: {
      left: pageWidth - paddingX - 155,
      right: paddingX,
    },

    tableWidth: 100,
    theme: "grid",

    styles: {
      fontSize: 12,
      fontStyle: "bold",
      textColor: [0, 0, 0],
      cellPadding: 2,
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      valign: "middle",
    },

    columnStyles: {
      0: { cellWidth: 55, halign: "center" },
      1: { cellWidth: 100, halign: "center", fillColor: [245, 245, 245] },
    },
  });

  // ================= SIGNATURE LINES =================
  const signatureY = doc.lastAutoTable.finalY + 75;

  const signatureLabels = [
    "Prepared By",
    "Checked By",
    "Approved By",
    "Received By",
  ];

  const sectionWidth = pageWidth / 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  signatureLabels.forEach((label, index) => {
    const centerX = sectionWidth * index + sectionWidth / 2;
    const lineWidth = 80;

    // Signature line
    doc.line(
      centerX - lineWidth / 2,
      signatureY,
      centerX + lineWidth / 2,
      signatureY,
    );

    // Label
    doc.text(label, centerX, signatureY + 14, { align: "center" });
  });

  // ================= PAGE NUMBERS =================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 70, pageHeight - 20);
  }
  // ================= SAVE FILE =================
  doc.save(filename);
};

export const generateFilteredReport = ({
  companyName = "Company",
  companyAddress = "",
  ceo = "",
  totalPrice = "",
  vatReg = "",
  landlineNum = "",
  columns = [],
  data = [],
  logo,
  filename = "Order Report.pdf",
}) => {
  const doc = new jsPDF("p", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 100;
  const paddingX = 30;
  const now = new Date();
  const formattedDate = now.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // ================= HEADER =================
  const drawHeader = () => {
    // Gold accent line
    doc.setFillColor(212, 175, 55);
    doc.rect(0, headerHeight + 10, pageWidth, 2, "F");

    // company logo
    if (logo) {
      doc.addImage(
        logo,
        "PNG",
        paddingX,
        20,
        70,
        70,
        "Premiumed-Logo",
        "FAST"
      );
    }

    // ================= COMPANY NAME =================
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(15);
    doc.text(companyName, paddingX + 85, 31, { align: "left" });

    // ================= COMPANY ADDRESS =================
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(companyAddress, paddingX + 85, 46, { align: "left" });

    // ================= CEO =================
    doc.setFontSize(11);
    doc.text(ceo, paddingX + 85, 62, { align: "left" });

    // ================= VAT =================
    doc.setFontSize(10);
    doc.text(vatReg, paddingX + 85, 76, { align: "left" });

    // ================= LANDLINE =================
    doc.text(landlineNum, paddingX + 85, 90, { align: "left" });
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
      "FAST",
    );
  };

  drawWatermark();
  drawHeader();
  const sectionY = headerHeight + 35;

  // report title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Order Report", paddingX, sectionY);

  //date:
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);
  doc.text("Date:", pageWidth - 133, sectionY);

  //date value
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(formattedDate, pageWidth - 95, sectionY);

  // gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.line(paddingX, sectionY + 8, pageWidth - paddingX, sectionY + 8);

  // ================= TOTAL RECORDS =================
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Total Records: ${data.length}`, paddingX, sectionY + 28);

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 42,
    head: [columns],
    body: data,
    margin: { top: 130, left: paddingX, right: paddingX },

    styles: {
      fontSize: 10,
      textColor: [26, 26, 26],
      overflow: "linebreak", // Wrap long text
      cellPadding: 4,
      lineWidth: 0.1, // Border thickness
      lineColor: [0, 0, 0], // Black border
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },

    columnStyles: {
      0: { cellWidth: 70 }, // Order ID
      1: { cellWidth: 78, halign: "center" }, // Client
      2: { cellWidth: 75 }, // Status
      3: { cellWidth: 76, halign: "center" }, // Delivery Date
      4: { cellWidth: 50, halign: "center" }, // Total Items
      5: { cellWidth: 125 }, // Items
      6: { cellWidth: 62 }, // total cost per row
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

  const totalY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: totalY,
    body: [
      [
        "Total",
        `${Number(totalPrice).toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
    ],

    margin: {
      left: pageWidth - paddingX - 125,
      right: paddingX,
    },

    tableWidth: 100,
    theme: "grid",
    styles: {
      fontSize: 10,
      fontStyle: "bold",
      textColor: [0, 0, 0],
      cellPadding: 4,
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      valign: "middle",
    },

    columnStyles: {
      0: { cellWidth: 40, halign: "left" },
      1: { cellWidth: 85, halign: "center" },
    },
  });

  // ================= PAGE NUMBERS =================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 70, pageHeight - 20);
  }
  // ================= SAVE FILE =================
  doc.save(filename);
};

export const generateInventoryReport = ({
  title = "Inventory Report",
  companyName = "Company",
  sectionTitle = "",
  companyAddress = "",
  ceo = "",
  vatReg = "",
  totalValue = 0,
  landlineNum = "",
  columns = [],
  data = [],
  logo,
  filename = "Inventory Report.pdf",
  type = "full",
}) => {
  const doc = new jsPDF("p", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 100;
  const paddingX = 30;
  const now = new Date();
  const formattedDate = now.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // ================= HEADER =================
  const drawHeader = () => {
    // Gold accent line
    doc.setFillColor(212, 175, 55);
    doc.rect(0, headerHeight + 10, pageWidth, 2, "F");

    // company logo
    if (logo) {
      doc.addImage(
        logo,
        "PNG",
        paddingX,
        20,
        70,
        70,
        "Premiumed-Logo",
        "FAST"
      );
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(15);
    doc.text(companyName, paddingX + 85, 31, { align: "left" });

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(companyAddress, paddingX + 85, 46, { align: "left" });

    doc.setFontSize(11);
    doc.text(ceo, paddingX + 85, 62, { align: "left" });

    doc.setFontSize(10);
    doc.text(vatReg, paddingX + 85, 76, { align: "left" });

    doc.text(landlineNum, paddingX + 85, 90, { align: "left" });
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
      "FAST",
    );
  };

  drawWatermark();
  drawHeader();
  const sectionY = headerHeight + 35;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(sectionTitle, paddingX, sectionY);

  //date:
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);
  doc.text("Date:", pageWidth - 133, sectionY);

  //date value
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(formattedDate, pageWidth - 95, sectionY);

  // gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.line(paddingX, sectionY + 8, pageWidth - paddingX, sectionY + 8);

  // ================= TOTAL RECORDS =================
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Total Records: ${data.length}`, paddingX, sectionY + 28);

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 42,
    head: [columns],
    body: data,
    margin: { top: 125, left: paddingX, right: paddingX },

    styles: {
      fontSize: 10,
      textColor: [26, 26, 26],
      overflow: "linebreak",
      cellPadding: 4,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },

    columnStyles:
      type === "disposed"
        ? {
            // DISPOSED INVENTORY REPORT
            0: { cellWidth: 80, halign: "left", valign: "middle" },
            1: { cellWidth: 45, halign: "center", valign: "middle" },
            2: { cellWidth: 135, halign: "left", valign: "middle" },
            3: { cellWidth: 35, halign: "center", valign: "middle" },
            4: { cellWidth: 50, halign: "center", valign: "middle" },
            5: { cellWidth: 65, halign: "center", valign: "middle" },
            6: { cellWidth: 65, halign: "center", valign: "middle" },
            7: { cellWidth: 60, halign: "center", valign: "middle" }, // Price
          }
        : {
            // FULL INVENTORY REPORT
            0: { cellWidth: 90, halign: "left", valign: "middle" },
            1: { cellWidth: 55, halign: "center", valign: "middle" },
            2: { cellWidth: 80, halign: "left", valign: "middle" },
            3: { cellWidth: 40, halign: "center", valign: "middle" },
            4: { cellWidth: 55, halign: "center", valign: "middle" },
            5: { cellWidth: 70, halign: "center", valign: "middle" },
            6: { cellWidth: 65, halign: "center", valign: "middle" },
            7: { cellWidth: 75, halign: "center", valign: "middle" },
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

  if (type === "disposed") {
    const totalY = doc.lastAutoTable.finalY + 20;
    autoTable(doc, {
      startY: totalY,
      body: [
        [
          type === "disposed" ? "Total Disposed Value" : "Total Inventory Value",
          `${Number(totalValue).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
        ],
      ],

      margin: {
        left: pageWidth - paddingX - 171,
        right: paddingX,
      },

      tableWidth: 100,
      theme: "grid",

      styles: {
        fontSize: 10,
        fontStyle: "bold",
        textColor: [0, 0, 0],
        cellPadding: 5,
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        valign: "middle",
      },

      columnStyles: {
        0: { cellWidth: 110, halign: "left" },
        1: { cellWidth: 60, halign: "center" },
      },
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 70, pageHeight - 20);
  }
  doc.save(filename);
};
