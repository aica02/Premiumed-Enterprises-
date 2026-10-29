import React, { useState, useEffect, useMemo } from "react";
import {
  FaSearch,
  FaCheck,
  FaTimes,
  FaUserAlt,
  FaPen,
  FaFilter,
  FaPrint,
} from "react-icons/fa";
import { IoIosInformationCircleOutline } from "react-icons/io";
import axios from "axios";
import { BACKEND_URL } from "../config";
import "../styles/InformationLayout.css";
import "../styles/Modals.css";
import "../styles/capsules.css";
import { Toaster, toast } from "react-hot-toast";
import logo from "../assets/Premiumed logo.png";
import EmptyState from "../components/EmptyState";
import {
  generateReport,
  generateOrderReceipt,
  generateFilteredReport,
} from "../utils/pdf/reportEngine";
import logReportPrinted from "../utils/logReportPrinted";
import usePolling from "../hooks/usePolling";

const ClientsOrder = () => {
  const [activeModal, setActiveModal] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editedDate, setEditedDate] = useState("");
  const [editReason, setEditReason] = useState("");

  const [urgencyThreshold, setUrgencyThreshold] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");

  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("All");
  const [urgencyFilter, setUrgencyFilter] = useState("All");

  const [showReportFilters, setShowReportFilters] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    clientId: "",
    clientName: "",
    startDate: "",
    endDate: "",
    deliveryStatus: "",
  });
  const [clients, setClients] = useState([]);

  const isOrderUrgent = (dateStr, threshold) => {
    if (!dateStr) return false;
    const cleanDate = dateStr.includes(":")
      ? dateStr.split(":")[1].trim()
      : dateStr;
    const deliveryDate = new Date(cleanDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = deliveryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= threshold;
  };

  const fetchOrders = async () => {
    try {
      const [ordersRes, settingsRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/orders`),
        axios.get(`${BACKEND_URL}/api/settings`),
      ]);

      const threshold = settingsRes.data.urgencyThreshold || 0;
      setUrgencyThreshold(threshold);

      const sortedOrders = ordersRes.data.sort((a, b) => {
        const aUrgent = isOrderUrgent(
          a.notes || a.requestedDeliveryDate,
          threshold,
        );
        const bUrgent = isOrderUrgent(
          b.notes || b.requestedDeliveryDate,
          threshold,
        );

        if (aUrgent && !bUrgent) return -1;
        if (!aUrgent && bUrgent) return 1;
        return 0;
      });

      const uniqueClients = [];
      const clientMap = new Map();
      ordersRes.data.forEach((order) => {
        if (order.name && !clientMap.has(order.name)) {
          clientMap.set(order.name, {
            id: order.clientId || order._id,
            name: order.name,
          });
          uniqueClients.push({
            id: order.clientId || order._id,
            name: order.name,
          });
        }
      });
      setClients(uniqueClients);

      setOrders(sortedOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);
  usePolling(fetchOrders);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const lowerSearch = searchTerm.toLowerCase();

        const orderIdMatch = order.orderId
          ?.toString()
          .toLowerCase()
          .includes(lowerSearch);

        const nameMatch = order.name?.toLowerCase().includes(lowerSearch);

        const matchesSearch = orderIdMatch || nameMatch;

        const matchesDeliveryStatus =
          deliveryStatusFilter === "All"
            ? true
            : order.status === deliveryStatusFilter;

        const urgent = isOrderUrgent(
          order.notes || order.requestedDeliveryDate,
          urgencyThreshold,
        );

        const matchesUrgency =
          urgencyFilter === "All"
            ? true
            : urgencyFilter === "Urgent"
              ? urgent
              : !urgent;

        return matchesSearch && matchesDeliveryStatus && matchesUrgency;
      })
      .sort((a, b) => {
        const getOrderPriority = (order) => {
          const status = order.status;
          const urgent = isOrderUrgent(
            order.notes || order.requestedDeliveryDate,
            urgencyThreshold,
          );

          if (status === "PENDING" && urgent) return 1;
          if (status === "PENDING" && !urgent) return 2;
          if (
            status !== "PENDING" &&
            status !== "DELIVERED" &&
            status !== "CANCELLED" &&
            urgent
          )
            return 3;
          if (
            status !== "PENDING" &&
            status !== "DELIVERED" &&
            status !== "CANCELLED" &&
            !urgent
          )
            return 4;
          if (status === "DELIVERED" || status === "CANCELLED") return 5;

          return 4;
        };

        const priorityA = getOrderPriority(a);
        const priorityB = getOrderPriority(b);

        return priorityA - priorityB;
      });
  }, [
    orders,
    searchTerm,
    urgencyThreshold,
    deliveryStatusFilter,
    urgencyFilter,
  ]);

  const handleViewOrder = async (order) => {
    setSelectedOrder(order);
    setActiveModal("order");
    setIsEditingDate(false);
    setEditReason("");

    const existingDate = order.notes?.split(": ")[1] || "";
    setEditedDate(existingDate);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
  };

  //approve ni admin
  const updateOrderStatus = async (orderId, newStatus) => {
    const toastId = toast.loading(`Processing...`);
    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/orders/${orderId}/status`,
        { status: newStatus },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );

      toast.success(
        response.data.message || `Order ${newStatus} successfully!`,
        {
          id: toastId,
        },
      );

      handleCloseModal();
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || "Update failed", {
        id: toastId,
      });
    }
  };

  const handleSaveDate = async () => {
    if (!editReason) {
      toast.error("Please select a reason for changing the delivery date");
      return;
    }

    if (!editedDate) {
      toast.error("Please select a new delivery date");
      return;
    }

    const toastId = toast.loading("Saving new delivery date...");
    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/orders/${selectedOrder.orderId}/edit-date`,
        {
          newDate: editedDate,
          reason: editReason,
        },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );

      if (response.data.success) {
        setIsEditingDate(false);
        setEditReason("");
        toast.success("Date updated successfully!", { id: toastId });

        const updatedOrder = response.data.order;
        setSelectedOrder(updatedOrder);

        fetchOrders();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update date", {
        id: toastId,
      });
    }
  };

  const isLocked =
    selectedOrder?.status === "APPROVED" ||
    selectedOrder?.status === "TO SHIP" ||
    selectedOrder?.status === "DELIVERED" ||
    selectedOrder?.status === "RETURNED";

  const disabledStyle = {
    backgroundColor: "gray",
    color: "white",
    cursor: "not-allowed",
    opacity: 0.8,
  };

  const getApproveButtonDisabledState = () => {
    if (isLocked) return true;
    if (selectedOrder?.status === "CANCELLED") return true;
    return false;
  };

  const handlePrintOrder = (order) => {
    const columns = ["QTY", "Unit Type", "Supplies", "Price"];
    const tableData = order.items.map((item) => [
      item.quantity,
      item.unitType || item.unit || "N/A",
      item.name,
      `${Number(item.price).toFixed(2)}`,
    ]);
    generateReport({
      title: `${order.orderId}`,
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      orderBy: order.name,
      vatReg: "VAT REG. TIN: 275-357-338-00000",
      landlineNum: "(044) 812-2280",
      totalPrice: order.total,
      deliveryAddress: order.shippingAddress,
      columns,
      logo,
      data: tableData,
      filename: `Order-${order.orderId}.pdf`,
    });
    void logReportPrinted(`Order ${order.orderId}`, "Order Management");
    toast.success(`Print ${order.name} order successfully.`);
  };

  const handlePrintOR = (selectedOrder) => {
    const columns = ["QTY", "Supply Name", "Unit Type", "Price", "Subtotal"];
    const tableData = selectedOrder.items.map((item) => {
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const subtotal = quantity * price;
      const unitType = String(item.unitType || item.unit || "").trim() || "N/A";

      return [
        quantity,
        item.name,
        unitType,
        price.toFixed(2),
        subtotal.toFixed(2),
      ];
    });
    generateOrderReceipt({
      title: `${selectedOrder.orderId}`,
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      deliveredTo: selectedOrder.name,
      vatReg: "VAT REG. TIN: 275-357-338-00000",
      landlineNum: "(044) 812-2280",
      totalPrice: selectedOrder.total,
      deliveryAddress: selectedOrder.shippingAddress,
      columns,
      logo,
      data: tableData,
      filename: `Delivery-${selectedOrder.orderId}.pdf`,
    });
    void logReportPrinted(
      `Order receipt ${selectedOrder.orderId}`,
      "Order Management",
    );
    toast.success(`Print OR for ${selectedOrder.name} successfully.`);
  };

  const handlePrintFilteredReport = () => {
    const filteredOrdersForReport = orders.filter((order) => {
      const matchesClient = reportFilters.clientId
        ? order.clientId === reportFilters.clientId ||
          order.name === reportFilters.clientName
        : true;

      const matchesStatus = reportFilters.deliveryStatus
        ? order.status === reportFilters.deliveryStatus
        : true;

      let matchesDate = true;
      if (reportFilters.startDate && reportFilters.endDate) {
        const orderDate = new Date(
          order.requestedDeliveryDate || order.createdAt,
        );
        const startDate = new Date(reportFilters.startDate);
        const endDate = new Date(reportFilters.endDate);
        endDate.setHours(23, 59, 59, 999);
        matchesDate = orderDate >= startDate && orderDate <= endDate;
      } else if (reportFilters.startDate) {
        const orderDate = new Date(
          order.requestedDeliveryDate || order.createdAt,
        );
        const startDate = new Date(reportFilters.startDate);
        matchesDate = orderDate >= startDate;
      } else if (reportFilters.endDate) {
        const orderDate = new Date(
          order.requestedDeliveryDate || order.createdAt,
        );
        const endDate = new Date(reportFilters.endDate);
        endDate.setHours(23, 59, 59, 999);
        matchesDate = orderDate <= endDate;
      }

      return matchesClient && matchesStatus && matchesDate;
    });

    if (filteredOrdersForReport.length === 0) {
      toast.error("No orders found matching the selected filters");
      return;
    }
    const columns = [
      "Order ID",
      "Client Name",
      "Delivery Status",
      "Requested Delivery Date",
      "Total Items",
      "Items",
      "Total Price",
    ];
    const tableData = filteredOrdersForReport.map((order) => {
      const totalItems = order.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const itemsList = order.items
        .map((item) => `${item.name} (${item.quantity} pcs)`)
        .join(", ");

      const totalPrice = Number(order.total || 0);

      return [
        order.orderId,
        order.name,
        order.status,
        order.requestedDeliveryDate ||
          order.notes?.split(":")[1]?.trim() ||
          "N/A",
        `${totalItems} pcs`,
        itemsList,
        `${totalPrice.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ];
    });

    const totalPrice = filteredOrdersForReport.reduce(
      (sum, order) => sum + Number(order.total || 0),
      0,
    );

    let filterDescription = "Filtered Orders Report";
    const filterConditions = [];
    if (reportFilters.clientName)
      filterConditions.push(`Client: ${reportFilters.clientName}`);
    if (reportFilters.deliveryStatus)
      filterConditions.push(`Status: ${reportFilters.deliveryStatus}`);
    if (reportFilters.startDate && reportFilters.endDate)
      filterConditions.push(
        `Date Range: ${new Date(reportFilters.startDate).toLocaleDateString()} - ${new Date(reportFilters.endDate).toLocaleDateString()}`,
      );
    else if (reportFilters.startDate)
      filterConditions.push(
        `From Date: ${new Date(reportFilters.startDate).toLocaleDateString()}`,
      );
    else if (reportFilters.endDate)
      filterConditions.push(
        `Until Date: ${new Date(reportFilters.endDate).toLocaleDateString()}`,
      );

    if (filterConditions.length > 0) {
      filterDescription += ` (${filterConditions.join(", ")})`;
    }

    generateFilteredReport({
      title: `Orders Report`,
      sectionTitle: filterDescription,
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      vatReg: "VAT REG. TIN: 275-357-338-00000",
      landlineNum: "(044) 812-2280",
      totalPrice: totalPrice,
      columns: columns,
      data: tableData,
      logo,
      filename: `Orders-Report-${new Date().getTime()}.pdf`,
    });
    void logReportPrinted("Orders", "Order Management");

    toast.success(
      `Generated report with ${filteredOrdersForReport.length} orders`,
    );
    setShowReportFilters(false);
    setReportFilters({
      clientId: "",
      clientName: "",
      startDate: "",
      endDate: "",
      deliveryStatus: "",
    });
  };

  const handleFilterChange = (field, value) => {
    setReportFilters((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} autoClose={3000} />
      <div className="info-container">
        <div className="info-search-wrapper">
          <div className="search-input-container from-clients-order">
            <FaSearch className="search-icon-gold" />
            <input
              type="text"
              placeholder="Search by ID or Client Name..."
              className="info-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            className="generate-all-btn"
            onClick={() => setShowReportFilters(true)}
          >
            <FaPrint className="print-icon" /> PRINT REPORTS
          </button>
        </div>

        <div className="info-card orders-table">
          <div className="filters-select-container">
            <select
              className="filter-select"
              value={deliveryStatusFilter}
              onChange={(e) => setDeliveryStatusFilter(e.target.value)}
            >
              <option value="All">All Delivery Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="TO SHIP">To Ship</option>
              <option value="PARTIAL">Partial</option>
              <option value="DELIVERED">Delivered</option>
              <option value="RETURNED">Returned</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              className="filter-select"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value="All">All Urgencies</option>
              <option value="Urgent">Urgent</option>
              <option value="NotUrgent">Not Urgent</option>
            </select>
          </div>

          <div className="orders-table-wrapper">
            <table className="info-table">
              <thead className="fixed-table-row">
                <tr>
                  <th>ID</th>
                  <th>CLIENT'S NAME</th>
                  <th>DELIVERY STATUS</th>
                  <th>URGENT ORDER</th>
                  <th className="action-header">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => {
                    const isUrgent = isOrderUrgent(
                      order.notes || order.requestedDeliveryDate,
                      urgencyThreshold,
                    );
                    return (
                      <tr
                        key={order._id}
                        className={isUrgent ? "urgent-highlight" : ""}
                      >
                        <td>{order.orderId}</td>
                        <td>{order.name}</td>
                        <td>
                          <span
                            className={`status-capsule status-${order.status.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isUrgent ? (
                            <FaCheck color="#d4af37" />
                          ) : (
                            <FaTimes color="#ccc" />
                          )}
                        </td>
                        <td className="action-buttons">
                          <button
                            className="view-orders-btn"
                            onClick={() => handleViewOrder(order)}
                          >
                            VIEW
                          </button>
                          <button
                            className="generate-btn"
                            onClick={() =>
                              order.status === "DELIVERED"
                                ? handlePrintOR(order)
                                : order.status === "TO SHIP"
                                  ? handlePrintOR(order)
                                  : handlePrintOrder(order)
                            }
                          >
                            PRINT
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-order-cell">
                      <EmptyState
                        title={
                          searchTerm ||
                          deliveryStatusFilter !== "All" ||
                          urgencyFilter !== "All"
                            ? "No matching orders"
                            : "No orders yet"
                        }
                        message={
                          searchTerm ||
                          deliveryStatusFilter !== "All" ||
                          urgencyFilter !== "All"
                            ? "We couldn't find any orders that match your current search or filters."
                            : "Your client orders will appear here once they are created."
                        }
                        buttonText={
                          searchTerm ||
                          deliveryStatusFilter !== "All" ||
                          urgencyFilter !== "All"
                            ? "Clear Search & Filters"
                            : undefined
                        }
                        onButtonClick={
                          searchTerm ||
                          deliveryStatusFilter !== "All" ||
                          urgencyFilter !== "All"
                            ? () => {
                                setSearchTerm("");
                                setDeliveryStatusFilter("All");
                                setUrgencyFilter("All");
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

        {showReportFilters && (
          <div className="order-modal-overlay">
            <div
              className="order-modal-container"
              style={{ maxWidth: "500px" }}
            >
              <div className="order-modal-header">
                <h3>Filter Reports</h3>
                <FaTimes
                  className="order-close-icon"
                  onClick={() => setShowReportFilters(false)}
                />
              </div>
              <div className="order-modal-body">
                <div className="modal-section-grid">
                  <div className="field-group">
                    <label className="field-label">Filter by Client</label>
                    <select
                      className="field-box filter-select"
                      value={reportFilters.clientName}
                      onChange={(e) => {
                        const selectedClient = clients.find(
                          (c) => c.name === e.target.value,
                        );
                        handleFilterChange("clientName", e.target.value);
                        handleFilterChange(
                          "clientId",
                          selectedClient?.id || "",
                        );
                      }}
                    >
                      <option value="">All Clients</option>
                      {clients.map((client, index) => (
                        <option key={index} value={client.name}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label">
                      Filter by Delivery Status
                    </label>
                    <select
                      className="field-box filter-select"
                      value={reportFilters.deliveryStatus}
                      onChange={(e) =>
                        handleFilterChange("deliveryStatus", e.target.value)
                      }
                    >
                      <option value="">All Statuses</option>
                      <option value="APPROVED">Approved</option>
                      <option value="PENDING">Pending</option>
                      <option value="TO SHIP">To Ship</option>
                      <option value="PARTIAL">Partial</option>
                      <option value="DELIVERED">Delivered</option>
                      <option value="RETURNED">Returned</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Start Date</label>
                    <input
                      type="date"
                      className="field-box"
                      value={reportFilters.startDate}
                      onChange={(e) =>
                        handleFilterChange("startDate", e.target.value)
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">End Date</label>
                    <input
                      type="date"
                      className="field-box"
                      value={reportFilters.endDate}
                      onChange={(e) =>
                        handleFilterChange("endDate", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="modal-action-footer">
                  <button
                    className="btn-cancel"
                    onClick={() => setShowReportFilters(false)}
                  >
                    CANCEL
                  </button>
                  <button
                    className="btn-approve"
                    onClick={handlePrintFilteredReport}
                  >
                    GENERATE REPORT
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeModal === "order" && selectedOrder && (
          <div className="order-modal-overlay">
            <div className="order-modal-container">
              <div className="order-modal-header">
                <h3>ORDER DETAILS: {selectedOrder.orderId}</h3>
                <FaTimes
                  className="order-close-icon"
                  onClick={handleCloseModal}
                />
              </div>

              <div className="order-modal-body">
                <div className="modal-section-grid">
                  <div className="detail-group full title">
                    <h4>Client Information</h4>
                  </div>
                  <DetailItem label="Client" value={selectedOrder.name} />
                  <DetailItem
                    label="Current Status"
                    value={selectedOrder.status?.toLowerCase()}
                    className="order-status-detail"
                  />
                  <DetailItem
                    label="Address"
                    value={selectedOrder.shippingAddress}
                    fullWidth
                  />

                  <div className="field-group full-width">
                    <label className="field-label">
                      {selectedOrder.status === "PENDING" &&
                      selectedOrder.newDate
                        ? "Approved Delivery Date"
                        : selectedOrder.status === "RETURNED" &&
                            selectedOrder.newDate
                          ? "Proposed New Delivery Date"
                          : "Requested Delivery Date"}
                    </label>

                    <div className="field-box-button">
                      {isEditingDate ? (
                        <div className="editing-date">
                          <input
                            type="date"
                            className="edit-date-input"
                            value={editedDate}
                            onChange={(e) => setEditedDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                          />

                          <select
                            className="edit-reason-select"
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                          >
                            <option value="">Select Reason</option>

                            <option value="Supplier Delay">
                              Supplier Delay
                            </option>

                            <option value="Weather Conditions">
                              Weather Conditions
                            </option>

                            <option value="Vehicle Breakdown">
                              Vehicle Breakdown
                            </option>

                            <option value="Warehouse Issue">
                              Warehouse Issue
                            </option>
                          </select>

                          <button
                            className="btn-save-date-gold"
                            onClick={handleSaveDate}
                          >
                            SAVE DATE
                          </button>
                        </div>
                      ) : (
                        <div className="field-box">
                          <div className="editing-date">
                            <div className="date-display">
                              <span>
                                {(() => {
                                  if (
                                    selectedOrder.status === "PENDING" &&
                                    selectedOrder.newDate
                                  ) {
                                    const displayDate =
                                      selectedOrder.newDate.includes(":")
                                        ? selectedOrder.newDate
                                            .split(":")[1]
                                            ?.trim()
                                        : selectedOrder.newDate;

                                    return displayDate || selectedOrder.newDate;
                                  }

                                  if (
                                    selectedOrder.status === "RETURNED" &&
                                    selectedOrder.newDate
                                  ) {
                                    const displayDate =
                                      selectedOrder.newDate.includes(":")
                                        ? selectedOrder.newDate
                                            .split(":")[1]
                                            ?.trim()
                                        : selectedOrder.newDate;

                                    return displayDate || selectedOrder.newDate;
                                  }

                                  return (
                                    selectedOrder.requestedDeliveryDate || "N/A"
                                  );
                                })()}
                              </span>

                              {selectedOrder.newDate && (
                                <small
                                  style={{
                                    color: "#d4af37",
                                    fontSize: "12px",
                                  }}
                                >
                                  (Original Date:{" "}
                                  {selectedOrder.requestedDeliveryDate || "N/A"}
                                  {selectedOrder.dateNote &&
                                    ` - Reason: ${selectedOrder.dateNote}`}
                                  )
                                </small>
                              )}

                              {selectedOrder.dateNote &&
                                !selectedOrder.newDate && (
                                  <small
                                    style={{
                                      color: "#ff6b6b",
                                      fontSize: "12px",
                                      marginTop: "2px",
                                    }}
                                  >
                                    Note: {selectedOrder.dateNote}
                                  </small>
                                )}
                            </div>

                            {!isEditingDate &&
                              (selectedOrder.status === "PENDING" ||
                                selectedOrder.status === "PARTIAL" ||
                                selectedOrder.status === "APPROVED") && (
                                <FaPen
                                  className={`edit-date-icon ${
                                    isLocked ? "locked" : ""
                                  }`}
                                  title="Edit delivery date"
                                  onClick={() =>
                                    !isLocked && setIsEditingDate(true)
                                  }
                                />
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="detail-group full title">
                  <h4>Items Ordered</h4>
                </div>
                <div className="detail-group full">
                  <div className="order-items-table-container">
                    <table className="order-items-table">
                      <thead>
                        <tr>
                          <th>Supply Name</th>
                          <th>Ordered</th>
                          <th>Unit Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item, index) => (
                          <tr key={index}>
                            <td>{item.name}</td>
                            <td>{item.quantity} pcs</td>
                            <td> ₱{Number(item.price || 0).toFixed(2)} </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <span className="detail-group total-amount">
                    TOTAL: ₱ {Number(selectedOrder.total || 0).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="modal-action-footer">
                {selectedOrder.status === "TO SHIP" ? (
                  <button
                    className="btn-print-or"
                    onClick={() => handlePrintOR(selectedOrder)}
                  >
                    <FaPrint className="print-icon" /> PRINT ORDER RECEIPT
                  </button>
                ) : (
                  <button
                    className="btn-approve"
                    onClick={() =>
                      updateOrderStatus(selectedOrder.orderId, "APPROVED")
                    }
                    disabled={getApproveButtonDisabledState()}
                    style={getApproveButtonDisabledState() ? disabledStyle : {}}
                  >
                    APPROVE
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const DetailItem = ({ label, value, fullWidth, className = "" }) => (
  <div className={`field-group ${fullWidth ? "full-width" : ""} ${className}`}>
    <label className="field-label">{label}</label>
    <div className="field-box">{value || "N/A"}</div>
  </div>
);

export default ClientsOrder;
