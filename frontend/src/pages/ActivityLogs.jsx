import React, { useEffect, useState } from "react";
import "../styles/InformationLayout.css";
import "../styles/ActivityLogs.css";
import { FaPlusCircle, FaPrint, FaSearch, FaTimes } from "react-icons/fa";
import { generateActivityReport } from "../utils/pdf/ActivityLogReport";
import { Toaster, toast } from "react-hot-toast";
import EmptyState from "../components/EmptyState";

const API_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const displayRole = (role) => (role === "User" ? "Client" : role);

const ActivityLogs = () => {
  const [activityLogs, setActivityLogs] = useState([]);
  const [allLogsForReport, setAllLogsForReport] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  // table filters
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");

  // print modal
  const [showLogsFilters, setShowLogsFilters] = useState(false);
  const [printRole, setPrintRole] = useState("");
  const [printModule, setPrintModule] = useState("");
  const [printStartDate, setPrintStartDate] = useState("");
  const [printEndDate, setPrintEndDate] = useState("");
  const [includeArchivedLogs, setIncludeArchivedLogs] = useState(true);

  const fetchActivityLogs = async (includeArchived = true) => {
    try {
      const response = await fetch(
        `${API_URL}/api/activitylogs?includeArchived=${includeArchived}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch activity logs");
      }

      const data = await response.json();
      setAllLogsForReport(data);
      setActivityLogs(data.filter((log) => log.source !== "Archived"));
    } catch (error) {
      console.error("Error fetching activity logs:", error);
    }
  };

  useEffect(() => {
    fetchActivityLogs(true);
  }, []);

  const users = [...new Set(activityLogs.map((log) => displayRole(log.role)))];
  const modules = [...new Set(activityLogs.map((log) => log.module))];
  const reportRoles = [
    ...new Set(allLogsForReport.map((log) => displayRole(log.role))),
  ];
  const reportModules = [...new Set(allLogsForReport.map((log) => log.module))];

  const generateLogReport = () => {
    const sourceLogs = includeArchivedLogs
      ? allLogsForReport
      : allLogsForReport.filter((log) => log.source !== "Archived");

    const filteredLogs = sourceLogs.filter((log) => {
      const logRole = displayRole(log.role);
      const matchesRole = !printRole || logRole === printRole;
      const matchesModule = !printModule || log.module === printModule;

      const logDate = new Date(log.createdAt);
      const startDate = printStartDate
        ? new Date(`${printStartDate}T00:00:00`)
        : null;
      const endDate = printEndDate
        ? new Date(`${printEndDate}T23:59:59`)
        : null;

      const matchesStartDate = !startDate || logDate >= startDate;
      const matchesEndDate = !endDate || logDate <= endDate;

      return matchesRole && matchesModule && matchesStartDate && matchesEndDate;
    });

    if (filteredLogs.length === 0) {
      alert("No logs match the selected filters.");
      return;
    }

    const columns = ["Role", "Action", "Module", "Description", "Date", "Time"];

    const rows = filteredLogs.map((log) => [
      displayRole(log.role),
      log.action,
      log.module,
      log.description || "-",
      new Date(log.createdAt).toLocaleDateString("en-PH"),
      new Date(log.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    ]);

    let sectionTitle = "Activity Log List";
    const filterConditions = [];

    if (printRole) {
      filterConditions.push(`Role: ${printRole}`);
    }

    if (printModule) {
      filterConditions.push(`Module: ${printModule}`);
    }

    if (printStartDate) {
      filterConditions.push(
        `From: ${new Date(printStartDate).toLocaleDateString("en-PH")}`,
      );
    }

    if (printEndDate) {
      filterConditions.push(
        `To: ${new Date(printEndDate).toLocaleDateString("en-PH")}`,
      );
    }

    if (includeArchivedLogs) {
      filterConditions.push("Including Archived");
    } else {
      filterConditions.push("Excluding Archived");
    }

    if (filterConditions.length > 0) {
      sectionTitle += ` (${filterConditions.join(", ")})`;
    }

    // ================= GENERATE PDF =================
    generateActivityReport({
      title: "Activity Log Report",
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      vatReg: "VAT REG. TIN: 000-000-000",
      landlineNum: "(044) 812-2280",
      columns,
      data: rows,
      filename: `Activity-Log-Report-${Date.now()}.pdf`,
    });
    toast.success(
      `Activity Log Report generated successfully with ${rows.length} record${
        rows.length !== 1 ? "s" : ""
      }.`,
    );
    setShowLogsFilters(false);
  };

  const filteredLogs = activityLogs.filter((log) => {
    const search = searchTerm.toLowerCase();
    const logRole = displayRole(log.role);

    const matchesSearch =
      log.username.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search) ||
      log.description.toLowerCase().includes(search) ||
      log.module.toLowerCase().includes(search) ||
      logRole.toLowerCase().includes(search);

    const matchesUser = selectedUser === "" || logRole === selectedUser;

    const matchesModule =
      selectedModule === "" || log.module === selectedModule;

    const today = new Date();
    const logDate = new Date(log.createdAt);

    let matchesDate = true;

    switch (selectedDate) {
      case "today":
        matchesDate = logDate.toDateString() === today.toDateString();
        break;

      case "30days":
        const last30Days = new Date();
        last30Days.setDate(today.getDate() - 30);

        matchesDate = logDate >= last30Days;
        break;

      case "year":
        matchesDate = logDate.getFullYear() === today.getFullYear();
        break;

      default:
        matchesDate = true;
    }

    return matchesSearch && matchesUser && matchesModule && matchesDate;
  });

  return (
    <>
      <div className="users-header">
        <div className="search-wrapper-large">
          <FaSearch className="search-icon-gold" />
          <input
            type="text"
            placeholder="Search by Role, Action, Description, Module..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          className="print-logs-btn"
          onClick={() => setShowLogsFilters(true)}
        >
          <FaPrint className="print-logs-icon" /> PRINT LOGS
        </button>
      </div>

      {showLogsFilters && (
        <div className="order-modal-overlay">
          <div className="order-modal-container" style={{ maxWidth: "500px" }}>
            <div className="order-modal-header">
              <h3>Filter Reports</h3>
              <FaTimes
                className="order-close-icon"
                onClick={() => setShowLogsFilters(false)}
              />
            </div>
            <div className="order-modal-body">
              <div className="modal-section-grid">
                <div className="field-group">
                  <label className="field-label">Filter by Role</label>
                  <select
                    className="field-box filter-select"
                    value={printRole}
                    onChange={(e) => setPrintRole(e.target.value)}
                  >
                    <option value="">All Roles</option>
                    {reportRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">Filter by Module</label>
                  <select
                    className="field-box filter-select"
                    value={printModule}
                    onChange={(e) => setPrintModule(e.target.value)}
                  >
                    <option value="">All Modules</option>
                    {reportModules.map((module) => (
                      <option key={module} value={module}>
                        {module}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">Start Date</label>
                  <input
                    type="date"
                    className="field-box"
                    value={printStartDate}
                    onChange={(e) => setPrintStartDate(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">End Date</label>
                  <input
                    type="date"
                    className="field-box"
                    value={printEndDate}
                    onChange={(e) => setPrintEndDate(e.target.value)}
                  />
                </div>

                <div className="field-group include-archived-group">
                  <label className="include-archived-label">
                    <input
                      type="checkbox"
                      checked={includeArchivedLogs}
                      onChange={(e) => setIncludeArchivedLogs(e.target.checked)}
                    />
                    <span>Include archived logs</span>
                  </label>
                </div>
              </div>

              <div className="modal-action-footer">
                <button
                  className="btn-cancel"
                  onClick={() => setShowLogsFilters(false)}
                >
                  CANCEL
                </button>
                <button className="btn-approve" onClick={generateLogReport}>
                  GENERATE REPORT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="info-card activities-table">
        <div className="activity-filters">
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">All Users</option>
            {users.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>

          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
          >
            <option value="">All Modules</option>
            {modules.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>

          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="30days">Last 30 Days</option>
            <option value="year">This Year</option>
          </select>
        </div>
        <div className="activities-table-wrapper">
          <table className="info-table table-logs">
            <thead className="fixed-table-row">
              <tr>
                <th>#</th>
                <th>Role</th>
                <th>Action</th>
                <th>Description</th>
                <th>Module</th>
                <th>Date</th>
                <th>Time</th>
              </tr>
            </thead>

            <tbody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, index) => (
                  <tr key={log._id}>
                    <td>{index + 1}</td>
                    <td>{displayRole(log.role)}</td>
                    <td>{log.action}</td>
                    <td className="logs-description">{log.description}</td>
                    <td>{log.module}</td>
                    <td>{new Date(log.createdAt).toLocaleDateString()}</td>
                    <td>
                      {new Date(log.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-order-cell">
                    <EmptyState
                      title={
                        searchTerm ||
                        selectedUser ||
                        selectedModule ||
                        selectedDate !== "all"
                          ? "No matching activity logs"
                          : "No activity logs yet"
                      }
                      message={
                        searchTerm ||
                        selectedUser ||
                        selectedModule ||
                        selectedDate !== "all"
                          ? "We couldn't find any logs that match your current search or filters."
                          : "Activity logs will appear here once actions are recorded in the system."
                      }
                      buttonText={
                        searchTerm ||
                        selectedUser ||
                        selectedModule ||
                        selectedDate !== "all"
                          ? "Clear Search & Filters"
                          : undefined
                      }
                      onButtonClick={
                        searchTerm ||
                        selectedUser ||
                        selectedModule ||
                        selectedDate !== "all"
                          ? () => {
                              setSearchTerm("");
                              setSelectedUser("");
                              setSelectedModule("");
                              setSelectedDate("all");
                            }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default ActivityLogs;
