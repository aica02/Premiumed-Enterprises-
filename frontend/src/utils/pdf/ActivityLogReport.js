import watermark from "../../assets/Premiumed-Watermark.png";
import {
  addPageNumbers,
  createReportDoc,
  drawDataTable,
  drawMetaLine,
  drawTitleRow,
} from "./pdfLayout.js";

// Columns: Role | Action | Module | Description | Date | Time
export const generateActivityReport = ({
  title = "Activity Log Report",
  filters = "",
  companyName = "Company",
  companyAddress = "",
  ceo = "",
  vatReg = "",
  landlineNum = "",
  columns = [],
  logo,
  data = [],
  filename = "Activity Log Report.pdf",
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
    columnStyles: {
      0: { cellWidth: 60, halign: "center" }, // Role
      1: { cellWidth: 80, halign: "left" }, // Action
      2: { cellWidth: 75, halign: "left" }, // Module
      3: { cellWidth: "auto", halign: "left" }, // Description
      4: { cellWidth: 68, halign: "center" }, // Date
      5: { cellWidth: 55, halign: "center" }, // Time
    },
  });

  addPageNumbers(ctx);
  ctx.doc.save(filename);
};
