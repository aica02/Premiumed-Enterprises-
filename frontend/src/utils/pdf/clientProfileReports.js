import watermark from "../../assets/Premiumed-Watermark.png";
import {
  PADDING_X,
  addPageNumbers,
  createReportDoc,
  drawDataTable,
  drawMetaLine,
  drawTitleRow,
} from "./pdfLayout.js";

// ===================== CLIENT PROFILE (one client) =====================
export const generateClientProfilePDF = ({
  companyName = "Premiumed Enterprises",
  companyAddress = "",
  title = "Client Profile",
  ceo = "",
  vatReg = "",
  landlineNum = "",
  client = {},
  logo = null,
  filename = "Client Profile.pdf",
}) => {
  const ctx = createReportDoc({
    company: { companyName, companyAddress, ceo, vatReg, landlineNum },
    logo,
    watermark,
  });
  const { doc, pageHeight, right, drawPageChrome } = ctx;
  const valueX = PADDING_X + 160;

  let y = drawTitleRow(ctx, title) + 30;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 40) {
      doc.addPage();
      drawPageChrome();
      y = 145;
    }
  };

  const drawSection = (sectionTitle) => {
    ensureSpace(50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(sectionTitle, PADDING_X, y);
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.75);
    doc.line(PADDING_X, y + 6, right, y + 6);
    y += 24;
  };

  // Long values (addresses, emails) wrap inside the value column.
  const drawField = (label, value) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(value || "N/A"), right - valueX);
    ensureSpace(lines.length * 13 + 5);
    doc.setFont("helvetica", "bold");
    doc.text(label, PADDING_X, y);
    doc.setFont("helvetica", "normal");
    doc.text(lines, valueX, y);
    y += lines.length * 13 + 5;
  };

  drawSection("Facility Information");
  drawField("Center Name", client.fullName);
  drawField("Facility Type", client.facilityType);
  drawField("Year Established", client.yearEstablished);
  drawField("Registration No.", client.registrationNumber);
  drawField("No. of Machines", client.machines);
  drawField("Mobile No.", client.phoneNumber);
  drawField("Landline", client.landline);
  drawField("Address", client.address);
  drawField("Email Address", client.email);
  y += 12;

  drawSection("Ownership & Personnel");
  drawField("Ownership", client.ownership);
  drawField("Owner Name", client.ownerName);
  drawField("Medical Director", client.medicalDirector);
  drawField("Nephrologist", client.nephrologist);
  drawField("Unit Manager", client.unitManager);
  y += 12;

  drawSection("Procurement & Accounts");
  drawField("Purchasing Contact", client.purchasingContact);
  drawField("Designation", client.designation);
  drawField("Procurement Mobile", client.procurementMobile);
  drawField("Procurement Email", client.procurementEmail);
  y += 12;

  drawSection("System Details");
  drawField("Username", client.username);
  drawField("Account Status", client.status);

  addPageNumbers(ctx);
  doc.save(filename);
};

// ===================== CLIENT DIRECTORY (many clients) =====================
// Columns: Client Name | Email Address | Phone | Status
export const generateClientDirectoryReport = ({
  title = "Client Directory Report",
  companyName = "Company",
  companyAddress = "",
  ceo = "",
  vatReg = "",
  landlineNum = "",
  columns = [],
  data = [],
  logo,
  filename = "Client Directory Report.pdf",
}) => {
  const ctx = createReportDoc({
    company: { companyName, companyAddress, ceo, vatReg, landlineNum },
    logo,
    watermark,
  });
  let y = drawTitleRow(ctx, title);
  y = drawMetaLine(ctx, `Total Records: ${data.length}`, y + 20);

  drawDataTable(ctx, {
    columns,
    data,
    startY: y + 2,
    columnStyles: {
      0: { cellWidth: 170, halign: "left" }, // Client Name
      1: { cellWidth: "auto", halign: "left" }, // Email Address
      2: { cellWidth: 110, halign: "left" }, // Phone
      3: { cellWidth: 65, halign: "center" }, // Status
    },
  });

  addPageNumbers(ctx);
  ctx.doc.save(filename);
};
