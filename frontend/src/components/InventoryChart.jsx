import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { FaArrowUpRightFromSquare, FaDownload } from "react-icons/fa6";
import { FaTimes } from "react-icons/fa";
import ExcelJS from "exceljs";
import "../styles/Dashboard.css";
import EmptyState from "./EmptyState";
import logReportPrinted from "../utils/logReportPrinted";

import logo from "../assets/Premiumed logo.png";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const mergeChartData = ({ delivered = [], toShip = [] } = {}) => {
  const merged = new Map();

  [...delivered, ...toShip].forEach((item) => {
    const existing = merged.get(item.name);
    if (existing) {
      existing.value += item.value;
    } else {
      merged.set(item.name, { ...item });
    }
  });

  return Array.from(merged.values()).sort((a, b) => b.value - a.value);
};

const InventoryChart = () => {
  const [chartData, setChartData] = useState([]);
  const [clients, setClients] = useState([]);
  const [activeFilter, setActiveFilter] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedClient, setSelectedClient] = useState("");
  const [showExcel, setShowExcel] = useState(false);
  const [excelData, setExcelData] = useState([]);

  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const currentYear = new Date().getFullYear();

  const years = Array.from(
    { length: currentYear - 2016 + 1 },
    (_, i) => 2016 + i,
  );

  const fullMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const getFullMonthName = (month) => {
    const index = months.indexOf(month);
    return index !== -1 ? fullMonths[index] : month;
  };

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/dashboard/clients`);
        setClients(res.data);
      } catch (err) {
        console.error("Error fetching clients", err);
      }
    };

    fetchClients();
  }, []);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const params = new URLSearchParams();

        if (selectedDay) {
          params.append("day", selectedDay);
        }

        if (selectedMonth) {
          const monthIndex = months.indexOf(selectedMonth) + 1;
          params.append("month", monthIndex);
        }

        if (selectedYear) {
          params.append("year", selectedYear);
        }

        if (selectedClient) {
          params.append("client", selectedClient);
        }

        const res = await axios.get(
          `${API_BASE_URL}/api/dashboard/chart-data?${params.toString()}`,
        );

        setChartData(mergeChartData(res.data));
      } catch (err) {
        console.error("Error fetching chart data", err);
      }
    };

    fetchChartData();
  }, [selectedDay, selectedMonth, selectedYear, selectedClient]);

  const fetchExcelData = async () => {
    try {
      const params = new URLSearchParams();

      if (selectedDay) {
        params.append("day", selectedDay);
      }

      if (selectedMonth) {
        const monthIndex = months.indexOf(selectedMonth) + 1;
        params.append("month", monthIndex);
      }

      if (selectedYear) {
        params.append("year", selectedYear);
      }

      if (selectedClient) {
        params.append("client", selectedClient);
      }

      const res = await axios.get(
        `${API_BASE_URL}/api/dashboard/chart-data?${params.toString()}`,
      );

      setExcelData(mergeChartData(res.data));
      setShowExcel(true);
    } catch (err) {
      console.error("Error fetching Excel data", err);
    }
  };

  const getBase64Image = async (url) => {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;

      reader.readAsDataURL(blob);
    });
  };

  const downloadExcel = async () => {
    if (!excelData || excelData.length === 0) {
      alert("No inventory data available to download.");
      return;
    }

    const clientName = selectedClient || "All Clients";

    const dateParts = [];

    if (selectedMonth) {
      dateParts.push(getFullMonthName(selectedMonth));
    }

    if (selectedDay) {
      dateParts.push(selectedDay);
    }

    let dateFilter = dateParts.join(" ");

    if (selectedYear) {
      dateFilter = dateFilter
        ? `${dateFilter}, ${selectedYear}`
        : `${selectedYear}`;
    }

    if (!dateFilter) {
      dateFilter = "All Dates";
    }

    const formattedData = excelData.map((item) => ({
      supplyName: item.name || "Unnamed Supply",
      unitType: item.unitType || "N/A",
      quantity: Number(item.value) || 0,
    }));

    const totalQuantity = formattedData.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    const darkBlue = "01203F";
    const gold = "D4AF37";
    const lightGold = "F8F1D7";
    const lightBlue = "EAF2F8";
    const white = "FFFFFF";
    const black = "222222";
    const borderColor = "D9D9D9";

    const thinBorder = {
      top: {
        style: "thin",
        color: { argb: borderColor },
      },
      bottom: {
        style: "thin",
        color: { argb: borderColor },
      },
      left: {
        style: "thin",
        color: { argb: borderColor },
      },
      right: {
        style: "thin",
        color: { argb: borderColor },
      },
    };

    const workbook = new ExcelJS.Workbook();

    const worksheet = workbook.addWorksheet("Inventory Trend Report");

    worksheet.columns = [{ width: 34 }, { width: 20 }, { width: 14 }];

    worksheet.mergeCells("A1:C1");
    worksheet.mergeCells("A2:C2");
    worksheet.mergeCells("A4:C4");
    worksheet.mergeCells("A5:C5");

    worksheet.getCell("A1").value = "PREMIUMED ENTERPRISES";
    worksheet.getCell("A2").value = "Inventory Trend Report";

    worksheet.getCell("A4").value = `Client: ${clientName}`;
    worksheet.getCell("A5").value = `Date: ${dateFilter}`;

    worksheet.getCell("A7").value = "Supply Name";
    worksheet.getCell("B7").value = "Unit Type";
    worksheet.getCell("C7").value = "Quantity";

    formattedData.forEach((item, index) => {
      const rowNumber = 8 + index;

      worksheet.getCell(`A${rowNumber}`).value = item.supplyName;
      worksheet.getCell(`B${rowNumber}`).value = item.unitType;
      worksheet.getCell(`C${rowNumber}`).value = item.quantity;

      worksheet.getRow(rowNumber).height = 26;
    });

    const totalRow = 8 + formattedData.length + 1;

    worksheet.mergeCells(`A${totalRow}:B${totalRow}`);

    worksheet.getCell(`A${totalRow}`).value = "TOTAL INVENTORY:";
    worksheet.getCell(`C${totalRow}`).value = totalQuantity;

    worksheet.getRow(1).height = 45;
    worksheet.getRow(2).height = 28;
    worksheet.getRow(3).height = 10;
    worksheet.getRow(4).height = 25;
    worksheet.getRow(5).height = 25;
    worksheet.getRow(6).height = 10;
    worksheet.getRow(7).height = 28;
    worksheet.getRow(totalRow - 1).height = 10;
    worksheet.getRow(totalRow).height = 30;

    worksheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: darkBlue },
    };

    worksheet.getCell("A1").font = {
      name: "Arial",
      size: 16,
      bold: true,
      color: { argb: white },
    };

    worksheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
      // indent: 5,
    };

    worksheet.getCell("A2").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: gold },
    };

    worksheet.getCell("A2").font = {
      name: "Arial",
      size: 12,
      bold: true,
      color: { argb: darkBlue },
    };

    worksheet.getCell("A2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getCell("A4").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: lightGold },
    };

    worksheet.getCell("A4").font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: darkBlue },
    };

    worksheet.getCell("A4").alignment = {
      horizontal: "left",
      vertical: "middle",
    };

    worksheet.getCell("A5").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: lightGold },
    };

    worksheet.getCell("A5").font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: darkBlue },
    };

    worksheet.getCell("A5").alignment = {
      horizontal: "left",
      vertical: "middle",
    };

    worksheet.getCell("A7").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: darkBlue },
    };

    worksheet.getCell("A7").font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: white },
    };

    worksheet.getCell("A7").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getCell("B7").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: darkBlue },
    };

    worksheet.getCell("B7").font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: white },
    };

    worksheet.getCell("B7").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getCell("C7").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: darkBlue },
    };

    worksheet.getCell("C7").font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: white },
    };

    worksheet.getCell("C7").alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    for (let index = 0; index < formattedData.length; index++) {
      const rowNumber = 8 + index;

      const supplyCell = worksheet.getCell(`A${rowNumber}`);
      const unitTypeCell = worksheet.getCell(`B${rowNumber}`);
      const quantityCell = worksheet.getCell(`C${rowNumber}`);

      supplyCell.font = {
        name: "Arial",
        size: 10,
        color: { argb: black },
      };

      supplyCell.alignment = {
        horizontal: "left",
        vertical: "middle",
        wrapText: true,
      };

      unitTypeCell.font = {
        name: "Arial",
        size: 10,
        color: { argb: black },
      };

      unitTypeCell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };

      quantityCell.font = {
        name: "Arial",
        size: 10,
        color: { argb: black },
      };

      quantityCell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

      quantityCell.numFmt = "#,##0";

      supplyCell.border = thinBorder;
      unitTypeCell.border = thinBorder;
      quantityCell.border = thinBorder;

      if (index % 2 === 0) {
        supplyCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: lightBlue },
        };

        unitTypeCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: lightBlue },
        };

        quantityCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: lightBlue },
        };
      }
    }

    worksheet.getCell(`A${totalRow}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: gold },
    };

    worksheet.getCell(`A${totalRow}`).font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: darkBlue },
    };

    worksheet.getCell(`A${totalRow}`).alignment = {
      horizontal: "right",
      vertical: "middle",
    };

    worksheet.getCell(`A${totalRow}`).border = thinBorder;

    worksheet.getCell(`C${totalRow}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: darkBlue },
    };

    worksheet.getCell(`C${totalRow}`).font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: white },
    };

    worksheet.getCell(`C${totalRow}`).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    worksheet.getCell(`C${totalRow}`).numFmt = "#,##0";
    worksheet.getCell(`C${totalRow}`).border = thinBorder;

    for (let row = 7; row <= totalRow; row++) {
      for (let col = 1; col <= 3; col++) {
        const cell = worksheet.getCell(row, col);

        if (row >= 8 && row < totalRow) {
          cell.border = thinBorder;
        }
      }
    }

    try {
      const logoBase64 = await getBase64Image(logo);

      const imageId = workbook.addImage({
        base64: logoBase64,
        extension: "png",
      });

      worksheet.addImage(imageId, {
        tl: {
          col: 0.8,
          row: 0,
        },
        ext: {
          width: 60,
          height: 60,
        },
      });
    } catch (error) {
      console.error("Error adding logo to Excel:", error);
    }

    worksheet.views = [
      {
        state: "frozen",
        ySplit: 7,
      },
    ];

    worksheet.pageSetup = {
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };

    const safeClientName = clientName
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "_");

    const safeDateFilter = dateFilter
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "_");

    const fileName = `Premiumed_Inventory_Trend_Report_${safeClientName}_${safeDateFilter}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    window.URL.revokeObjectURL(url);
    void logReportPrinted("Inventory Trends Excel", "Dashboard");
  };

  const toggleFilter = (filterName) => {
    setActiveFilter(activeFilter === filterName ? null : filterName);
  };

  const clearChartFilters = () => {
    setSelectedClient("");
    setSelectedDay(null);
    setSelectedMonth(null);
    setSelectedYear(currentYear);
    setActiveFilter(null);
  };

  const hasActiveChartFilters =
    Boolean(selectedClient || selectedDay || selectedMonth) ||
    selectedYear !== currentYear;

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-title-row">
          <h3>Inventory Trends</h3>

          <FaArrowUpRightFromSquare
            className="view-excel-data-icon"
            title="View Excel Data"
            onClick={fetchExcelData}
          />
        </div>

        <div className="filters-column">
          <select
            className="filters-select clients-name"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="">All Clients</option>

            {clients.map((client, index) => (
              <option key={index} value={client}>
                {client}
              </option>
            ))}
          </select>

          <div className="filters-date">
            <div className="custom-dropdown">
              <button
                type="button"
                className="filters-select"
                onClick={() => toggleFilter("day")}
              >
                {selectedDay ? `Day: ${selectedDay}` : "Day"}
              </button>

              {activeFilter === "day" && (
                <div className="calendar-panel grid-7">
                  <div
                    className="calendar-item"
                    onClick={() => {
                      setSelectedDay(null);
                      setActiveFilter(null);
                    }}
                  >
                    All
                  </div>

                  {days.map((day) => (
                    <div
                      key={day}
                      className={`calendar-item ${
                        selectedDay === day ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedDay(day);
                        setActiveFilter(null);
                      }}
                    >
                      {day}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="custom-dropdown">
              <button
                type="button"
                className="filters-select"
                onClick={() => toggleFilter("month")}
              >
                {selectedMonth ? `Month: ${selectedMonth}` : "Month"}
              </button>

              {activeFilter === "month" && (
                <div className="calendar-panel grid-4">
                  <div
                    className="calendar-item"
                    onClick={() => {
                      setSelectedMonth(null);
                      setActiveFilter(null);
                    }}
                  >
                    All
                  </div>

                  {months.map((month) => (
                    <div
                      key={month}
                      className={`calendar-item ${
                        selectedMonth === month ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedMonth(month);
                        setActiveFilter(null);
                      }}
                    >
                      {month}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="custom-dropdown">
              <button
                type="button"
                className="filters-select"
                onClick={() => toggleFilter("year")}
              >
                {selectedYear ? `Year: ${selectedYear}` : "Year"}
              </button>

              {activeFilter === "year" && (
                <div className="calendar-panel grid-2">
                  {years.map((year) => (
                    <div
                      key={year}
                      className={`calendar-item ${
                        selectedYear === year ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedYear(year);
                        setActiveFilter(null);
                      }}
                    >
                      {year}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="inventory-trends-chart-area">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} className="bar-chart">
              <CartesianGrid strokeDasharray="3 3" vertical={false} />

              <XAxis dataKey="name" tick={{ fontSize: 12 }} />

              <YAxis tick={{ fontSize: 12 }} />

              <Tooltip cursor={{ fill: "#f5f5f5" }} />

              <Bar dataKey="value" fill="#f5b700" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            title={
              hasActiveChartFilters
                ? "No matching inventory trends"
                : "No inventory trends"
            }
            message={
              hasActiveChartFilters
                ? "We couldn't find inventory trends that match your current filters."
                : "Inventory trend data will appear here once activity is available."
            }
            buttonText={
              hasActiveChartFilters ? "Clear Search & Filters" : undefined
            }
            onButtonClick={
              hasActiveChartFilters ? clearChartFilters : undefined
            }
          />
        )}
      </div>

      {showExcel && (
        <div className="excel-modal">
          <div className="excel-content">
            <div className="excel-header">
              <h3>Inventory Trends</h3>

              <div className="header-actions">
                <button
                  className="download-button"
                  onClick={downloadExcel}
                  title="Download Inventory"
                >
                  <FaDownload />
                </button>

                <button
                  className="cancel-button"
                  onClick={() => setShowExcel(false)}
                  title="Close"
                >
                  <FaTimes />
                </button>
              </div>
            </div>

            <div className="excel-info">
              <div>
                <strong>Client:</strong> {selectedClient || "All Clients"}
              </div>

              <div>
                <strong>Date:</strong>{" "}
                {selectedMonth || selectedDay
                  ? `${selectedMonth ? getFullMonthName(selectedMonth) : ""}${
                      selectedDay ? ` ${selectedDay}` : ""
                    }${selectedYear ? `, ${selectedYear}` : ""}`
                  : selectedYear
                    ? selectedYear
                    : "All Dates"}
              </div>
            </div>

            <div className="excel-table-wrapper">
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Supply Name</th>
                    <th>Unit Type</th>
                    <th>Quantity</th>
                  </tr>
                </thead>

                <tbody>
                  {excelData.length > 0 ? (
                    excelData.map((row, index) => (
                      <tr key={index}>
                        <td>{row.name}</td>
                        <td>{row.unitType || "N/A"}</td>
                        <td>{row.value}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3">No inventory data available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryChart;
