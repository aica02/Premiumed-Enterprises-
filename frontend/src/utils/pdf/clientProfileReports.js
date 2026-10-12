import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import watermark from "../../assets/Premiumed-Watermark.png";

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
  const doc = new jsPDF("p", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const paddingX = 30;
  const headerHeight = 100;
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
      "FAST"
    );
  };
  
  drawWatermark();
  drawHeader();

  let y = headerHeight + 35;

  const drawSection = (title) => {
    doc.setFont("helvetica","bold");
    doc.setFontSize(14);

    doc.text(title,paddingX,y);

    doc.setDrawColor(212,175,55);
    doc.line(paddingX,y+8,pageWidth-paddingX,y+8);

    y += 28;
  };

  const drawField = (label,value) => {
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.text(label,paddingX,y);

    doc.setFont("helvetica","normal");
    doc.text(value || "N/A",paddingX+160,y);

    y += 18;
  };

  const sectionY = headerHeight + 35;
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

  // ================= FACILITY INFO =================
  drawSection("Facility Information");

  drawField("Center Name",client.fullName);
  drawField("Facility Type",client.facilityType);
  drawField("Year Established",client.yearEstablished);
  drawField("Registration No.",client.registrationNumber);
  drawField("No. of Machines",client.machines);
  drawField("Mobile No.",client.phoneNumber);
  drawField("Landline",client.landline);
  drawField("Address",client.address);
  drawField("Email Address",client.email);

  y += 10;

  // ================= OWNERSHIP =================
  drawSection("Ownership & Personnel");

  drawField("Ownership",client.ownership);
  drawField("Owner Name",client.ownerName);
  drawField("Medical Director",client.medicalDirector);
  drawField("Nephrologist",client.nephrologist);
  drawField("Unit Manager",client.unitManager);

  y += 10;

  // ================= PROCUREMENT =================
  drawSection("Procurement & Accounts");

  drawField("Purchasing Contact",client.purchasingContact);
  drawField("Designation",client.designation);
  drawField("Procurement Mobile",client.procurementMobile);
  drawField("Procurement Email",client.procurementEmail);

  y += 10;

  // ================= SYSTEM DETAILS =================
  drawSection("System Details");

  drawField("Username",client.username);
  drawField("Account Status",client.status);

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

export const generateClientDirectoryReport = ({
  title = "Client Directory Report",
  companyName = "Company",
  sectionTitle = "Client Directory Report",
  companyAddress = "",
  ceo = "",
  vatReg = "",
  landlineNum = "",
  columns = [],
  data = [],
  logo,
  filename = "Client Directory Report.pdf",
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
  doc.text("Date:", pageWidth - 133, sectionY);

  //date value
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(formattedDate, pageWidth - 95, sectionY);

  // gold divider line
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.line(paddingX,sectionY + 8,pageWidth - paddingX,sectionY + 8);

  // ================= TOTAL RECORDS =================
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Total Records: ${data.length}`,paddingX,sectionY + 28);

  // ================= TABLE =================
  autoTable(doc, {
    startY: sectionY + 42,
    head: [columns],
    body: data,
    margin: {top: 125, left: paddingX, right: paddingX},

    styles: {
      fontSize: 12,
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

    columnStyles:{
      0: {cellWidth: 170,halign: "left"},
      1: {cellWidth: 190,halign: "left"},
      2: {cellWidth: 110,halign: "left"},
      3: {cellWidth: 65,halign: "center"},
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