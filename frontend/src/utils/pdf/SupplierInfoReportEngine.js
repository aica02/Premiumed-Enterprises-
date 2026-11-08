import watermark from "../../assets/Premiumed-Watermark.png";
import {
  addPageNumbers,
  createReportDoc,
  drawDataTable,
  drawMetaLine,
  drawTitleRow,
} from "./pdfLayout.js";

// reportType "suppliers": Supplier ID | Supplier Name | Contact Person | Status |
//                         Address | Phone | Email
// reportType "purchase":  Batch No. | Item Name | Unit Type | Supplier Name |
//                         Status | Location | Quantity | Expiration Date
export const generateSupplyFilteredReport = ({
  title = "Supply Report",
  filters = "",
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
  const ctx = createReportDoc({
    company: { companyName, companyAddress, ceo, vatReg, landlineNum },
    logo,
    watermark,
  });
  let y = drawTitleRow(ctx, title);
  y += 20;
  if (filters) y = drawMetaLine(ctx, `Filters: ${filters}`, y, { muted: true });
  y = drawMetaLine(ctx, `Total Records: ${data.length}`, y);

  drawDataTable(ctx, {
    columns,
    data,
    startY: y + 2,
    columnStyles:
      reportType === "suppliers"
        ? {
            0: { cellWidth: 50, halign: "center" }, // Supplier ID
            1: { cellWidth: 90, halign: "left" }, // Supplier Name
            2: { cellWidth: 75, halign: "left" }, // Contact Person
            3: { cellWidth: 45, halign: "center" }, // Status
            4: { cellWidth: "auto", halign: "left" }, // Address
            5: { cellWidth: 80, halign: "left" }, // Phone
            6: { cellWidth: 100, halign: "left" }, // Email
          }
        : {
            0: { cellWidth: 110, halign: "center" }, // Batch number (fits 17 characters)
            1: { cellWidth: "auto", halign: "left" }, // Item Name
            2: { cellWidth: 45, halign: "center" }, // Unit Type
            3: { cellWidth: 75, halign: "left" }, // Supplier Name
            4: { cellWidth: 45, halign: "center" }, // Status
            5: { cellWidth: 50, halign: "center" }, // Location
            6: { cellWidth: 50, halign: "center" }, // Quantity
            7: { cellWidth: 75, halign: "center" }, // Expiration Date
          },
  });

  addPageNumbers(ctx);
  ctx.doc.save(filename);
};
