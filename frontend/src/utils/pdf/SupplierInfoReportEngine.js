import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import watermark from "../../assets/Premiumed-Watermark.png";

export const generateSupplyFilteredReport = ({
  title = "Supply Report",
  companyName = "Company",
  companyAddress = "",
  ceo = "",
  vatReg = "",
  landlineNum = "",
  columns = [],
  data = [],
  logo,
  reportType = "purchase",
  filename = "Supply Report.pdf",
}) => {
  const doc = new jsPDF("p", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 100;
  const paddingX = 30;
  const formattedDate = new Date().toLocaleDateString("en-PH", {
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

  // ================= REPORT TITLE =================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(title, paddingX, sectionY);

  // ================= DATE =================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);

  doc.text("Date:", pageWidth - 140, sectionY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(formattedDate, pageWidth - 102, sectionY);

  // ================= DIVIDER =================
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.line(paddingX, sectionY + 8, pageWidth - paddingX, sectionY + 8);

  // ================= TOTAL RECORDS =================
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Total Records: ${data.length}`, paddingX + 86, sectionY + 28, {
    align: "right",
  });

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
      valign: "middle",
    },

    headStyles: {
      fillColor: [246, 239, 215],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },

    columnStyles:
      reportType === "suppliers"
        ? {
            // SUPPLIERS REPORT
            0: { cellWidth: 50, halign: "center" }, // Supplier ID
            1: { cellWidth: 95, halign: "left" }, // Supplier Name
            2: { cellWidth: 85, halign: "left" }, // Contact Person
            3: { cellWidth: 45, halign: "center" }, // Status
            4: { cellWidth: 100, halign: "left" }, // Address
            5: { cellWidth: 70, halign: "left" }, // Phone
            6: { cellWidth: 90, halign: "left" }, // Email
          }
        : {
            // PURCHASE BATCHES REPORT
            0: { cellWidth: 65, halign: "center" }, // Batch number
            1: { cellWidth: 80, halign: "left" }, // Item Name
            2: { cellWidth: 50, halign: "center" }, // Unit Type
            3: { cellWidth: 80, halign: "left" }, // Supplier Name
            4: { cellWidth: 55, halign: "center" }, // Status
            5: { cellWidth: 55, halign: "center" }, // Location
            6: { cellWidth: 55, halign: "center" }, // Quantity
            7: { cellWidth: 95, halign: "center" }, // Expiration Date
          },

    alternateRowStyles: { fillColor: [245, 245, 245] },
    willDrawPage: (dataArg) => {
      if (dataArg.pageNumber > 1) {
        drawWatermark();
        drawHeader();
      }
    },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - paddingX,
      pageHeight - 20,
      { align: "right" },
    );
  }
  doc.save(filename);
};
