import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import watermark from "../../assets/Premiumed-Watermark.png";

export const generateReport = ({
  title = "Delivery Receipt",
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

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(15);
    doc.text(companyName, paddingX, 31, {align: "left" });

    // Company address
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(companyAddress, paddingX, 46,{align: "left" });

    // CEO
    doc.setFontSize(11);
    doc.text(ceo, paddingX, 62,{align: "left" });

    // VAT Registration
    doc.setFontSize(10);
    doc.text(vatReg, paddingX, 76,{align: "left" });

    // Landline
    doc.text(landlineNum, paddingX, 90, {align: "left" });
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
      "FAST"
    );
  };

  drawWatermark();
  drawHeader();
  const sectionY = headerHeight + 30;

  // report title
  doc.setFont("helvetica", "bold");
  doc.setTextColor(215, 175, 55);
  doc.setFontSize(12);
  doc.text("Order Report", paddingX, sectionY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(" - " + title, paddingX + 75, sectionY);

  autoTable(doc, {
    startY: sectionY + 7,
    margin: {left: paddingX, right: paddingX,},
    body: [
      [
        "Ordered By:", orderBy,
        "Date:", formattedDate,
      ],
    ],

    theme: "plain",
    styles: {
      textColor: [0,0,0],
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
      1: { cellWidth: 351, align: "left",  textColor: [0,0,0]},
      2: { cellWidth: 36, fontStyle: "bold", textColor: [215, 175, 55] }, // date
      3: { cellWidth: 85,  textColor: [0,0,0] },
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
  doc.text(deliveryAddress, paddingX + 60, sectionY + 36);

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
  doc.text(`- Total Records: ${data.length}`,paddingX + 75,sectionY + 70);

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
    0: {cellWidth: 60, halign: "center" }, // First column
    1: {cellWidth: 85, halign: "center" }, // Second column
    2: {cellWidth: 295, halign: "left" }, // Third column
    3: {cellWidth: 95, halign: "center" }, // Fourth column
  },

    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },

    willDrawPage: (dataArg) => {
      if (dataArg.pageNumber > 1) {
        drawWatermark();
        drawHeader();
      }
    }
  });

  const totalY = doc.lastAutoTable.finalY + 10;
  autoTable(doc, {
    startY: totalY,
    didDrawPage: () => {
      drawHeader();
    },

    body: [[
      "Total",
      `${Number(totalPrice).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    ]],

    margin: {
      left: pageWidth - paddingX - 145,
      right: paddingX
    },

    tableWidth: 100, theme: "grid",
    styles: {
      fontSize: 12,
      fontStyle: "bold",
      textColor: [0, 0, 0],
      cellPadding: 4,
      lineWidth: 0.5,
      lineColor: [0, 0, 0],
      valign: "middle",
    },

    columnStyles: {
      0: {cellWidth: 50,halign: "left"},
      1: {cellWidth: 95,halign: "center", fillColor: [245, 245, 245]}
    },
  });

  // ================= PAGE NUMBERS =================
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 70, pageHeight - 20
    );
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

  // ================= HEADER =================
  const drawHeader = () => {
    const rowwY = 145;

    // black header background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, headerHeight + 10, "F");

    // gold accent line
    doc.setFillColor(212, 175, 55);
    doc.rect(0, headerHeight + 10, pageWidth, 2, "F");

    // report title
    doc.setFont("helvetica", "bold");
    doc.setTextColor(215, 175, 55);
    doc.setFontSize(9);
    doc.text("Delivery Receipt - ", paddingX, 95);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(title, paddingX + 80, 95);

    autoTable(doc, {
      startY: 100,
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
        fontSize: 9,
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
        0: { cellWidth: 60, fontStyle: "bold", textColor: [215, 175, 55] }, // delivered to
        1: { cellWidth: 140, align: "left",  textColor: [0, 0, 0]},
        2: { cellWidth: 25, fontStyle: "bold", textColor: [215, 175, 55] }, // date
        3: { cellWidth: 65,  textColor: [0, 0, 0] },
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
    doc.text(deliveryAddress, paddingX + 45,123);

    const centerX = pageWidth / 2;

    // company name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(12);
    doc.text(companyName, centerX, 25, { align: "center" });

    // company address
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(companyAddress, centerX, 38, { align: "center" });

    // CEO name
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(ceo, centerX, 50, { align: "center" });

    // VAT Registration
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(vatReg, centerX, 62, { align: "center" });

    // Landline Number
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
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
    startY: sectionY + 25,
    head: [columns],
    body: data,
    margin: { left: paddingX, right: paddingX },

    styles: {
      fontSize: 8,
      textColor: [26, 26, 26],
      overflow: "linebreak", // Wrap long text
      cellPadding: 2,
      lineWidth: 0.1,          // Border thickness
      lineColor: [0, 0, 0],    // Black border
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold"
    },

    columnStyles: {
    0: { cellWidth: 35 }, // First column
    1: { cellWidth: 50 }, // Second column
    2: { cellWidth: 140 }, // Third column
    3: { cellWidth: 51 }, // Fourth column
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
      left: pageWidth - paddingX - 87,
      right: paddingX
    },

    tableWidth: 100, theme: "grid",

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
      0: {cellWidth: 35,halign: "left"},
      1: {cellWidth: 50,halign: "left",fillColor: [245, 245, 245]},
    },
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

export const generateFilteredReport = ({
  title = "Client Order Report",
  companyName = "Company",
  sectionTitle ="",
  companyAddress = "",
  ceo = "",
  totalPrice = "",
  vatReg = "",
  landlineNum = "",
  columns = [],
  data = [],
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

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(15);
    doc.text(companyName, paddingX, 31, {align: "left" });

    // Company address
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(companyAddress, paddingX, 46,{align: "left" });

    // CEO
    doc.setFontSize(11);
    doc.text(ceo, paddingX, 62,{align: "left" });

    // VAT Registration
    doc.setFontSize(10);
    doc.text(vatReg, paddingX, 76,{align: "left" });

    // Landline
    doc.text(landlineNum, paddingX, 90, {align: "left" });
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
  const sectionY = headerHeight + 35;

  // report title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Order Report", paddingX, sectionY);

  //date:
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);
  doc.text("Date:", pageWidth - 140, sectionY);

  //date value
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0,0,0);
  doc.text(formattedDate, pageWidth - 102, sectionY);

  // gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.line(paddingX,sectionY + 8,pageWidth - paddingX,sectionY + 8);

  // ================= TOTAL RECORDS =================
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    `Total Records: ${data.length}`,
    paddingX,
    sectionY + 28
  );

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 42,
    head: [columns],
    body: data,
    margin: {top: 130, left: paddingX, right: paddingX },

    styles: {
      fontSize: 10,
      textColor: [26, 26, 26],
      overflow: "linebreak", // Wrap long text
      cellPadding: 4,
      lineWidth: 0.1,          // Border thickness
      lineColor: [0, 0, 0],    // Black border
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      valign: "middle"
    },

    columnStyles: {
      0: {cellWidth: 70 },   // Order ID
      1: {cellWidth: 78, halign: "center" },   // Client
      2: {cellWidth: 75 },   // Status
      3: {cellWidth: 76, halign: "center"},  // Delivery Date
      4: {cellWidth: 50, halign: "center" },   // Total Items
      5: {cellWidth: 125 },  // Items
      6: {cellWidth: 62}// total cost per row
    },

    alternateRowStyles: {
      fillColor: [245, 245, 245]
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
    body: [[
      "Total",
      `${Number(totalPrice).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    ]],

    margin: {
      left: pageWidth - paddingX - 125,
      right: paddingX
    },

    tableWidth: 100, theme: "grid",
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
      0: {cellWidth: 40, halign: "left"},
      1: {cellWidth: 85,halign: "center"},
    },
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

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(15);
    doc.text(companyName, paddingX, 31, {align: "left" });

    // Company address
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(companyAddress, paddingX, 46,{align: "left" });

    // CEO
    doc.setFontSize(11);
    doc.text(ceo, paddingX, 62,{align: "left" });

    // VAT Registration
    doc.setFontSize(10);
    doc.text(vatReg, paddingX, 76,{align: "left" });

    // Landline
    doc.text(landlineNum, paddingX, 90, {align: "left" });
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
  const sectionY = headerHeight + 35;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(sectionTitle, paddingX, sectionY);

  //date:
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);
  doc.text("Date:", pageWidth - 140, sectionY);

  //date value
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0,0,0);
  doc.text(formattedDate, pageWidth - 102, sectionY);

  // gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.line(paddingX,sectionY + 8,pageWidth - paddingX,sectionY + 8);

  // ================= TOTAL RECORDS =================
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    `Total Records: ${data.length}`,
    paddingX,
    sectionY + 28
  );

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 42,
    head: [columns],
    body: data,
    margin: {top: 125, left: paddingX, right: paddingX},

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
            0: {cellWidth: 115,halign: "left"},
            1: {cellWidth: 90,halign: "center"},
            2: {cellWidth: 190,halign: "left"},
            3: {cellWidth: 65,halign: "center"},
            4: {cellWidth: 75,halign: "center"},
          }
        : {
            0: {cellWidth: 90,halign: "left",valign:"middle"},
            1: {cellWidth: 65,halign: "center",valign:"middle"},
            2: {cellWidth: 95,halign: "left",valign:"middle"},
            3: {cellWidth: 40,halign: "center",valign:"middle"},
            4: {cellWidth: 55,halign: "center",valign:"middle"},
            5: {cellWidth: 75,halign: "center",valign:"middle"},
            6: {cellWidth: 55,halign: "center",valign:"middle"},
            7: {cellWidth: 60,halign: "center",valign:"middle"}
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

  const totalY = doc.lastAutoTable.finalY + 20;
  autoTable(doc, {
    startY: totalY,
    body: [[
      type === "disposed" ? "Total Disposed Value" : "Total Inventory Value",
      `${Number(totalValue).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`
    ]],

    margin: {
      left: pageWidth - paddingX - 186,
      right: paddingX
    },

    tableWidth: 100, theme: "grid",

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
      0: {cellWidth: 110, halign: "left",},
      1: {cellWidth: 75, halign: "center",}
    },
  });

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
  doc.save(filename);
};