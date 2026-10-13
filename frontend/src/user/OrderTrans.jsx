import { useState, useMemo, useEffect, useRef } from "react";
import {
  FaCheck,
  FaExclamationCircle,
  FaLongArrowAltLeft,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import { MdOutlineExitToApp, MdRefresh } from "react-icons/md";
import axios from "axios";
import "../stylesClient/ordertrans.css";
import "../styles/capsules.css";
import "../styles/ConfirmModal.css";
import { BACKEND_URL } from "../config";
import { Toaster, toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import EmptyState from "../components/EmptyState";

export default function OrderTrans() {
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [dateFilter, setDateFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showRemarksDetails, setShowRemarksDetails] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cancelOrderData, setCancelOrderData] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const [depositSlipData, setDepositSlipData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const hasDepositSlipSent = (order) => {
    return order?.paymentSlip && order?.paymentStatus === "COMPLETED";
  };

  const hasDepositSlipRejected = (order) => {
    if (!order) return false;
    return (
      order.paymentStatus === "REJECTED" || order.paymentRejectedAt != null
    );
  };

  const fetchOrders = async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);

    try {
      const storedUser = localStorage.getItem("username");
      if (!storedUser) {
        console.log("No username found in localStorage");
        return;
      }

      const cleanUser = storedUser.replace(/['"]+/g, "").trim();

      const res = await axios.get(
        `${BACKEND_URL}/api/orders/user/${encodeURIComponent(cleanUser)}`,
        {
          headers: {
            "X-Username": cleanUser,
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "User",
          },
        },
      );

      let data = Array.isArray(res.data) ? res.data : [];

      const sortedData = data.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      setOrders(sortedData);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(true);

    const interval = setInterval(() => {
      fetchOrders(false);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const id = (order.orderId || order.id || "").toString();
      const name = (order.items && order.items[0]?.name) || order.name || "";
      const status = (order.status || "").toUpperCase();

      const matchesSearch =
        id.toLowerCase().includes(search.toLowerCase()) ||
        name.toLowerCase().includes(search.toLowerCase());

      const orderDate = new Date(order.createdAt || 0);
      const now = new Date();

      let matchesDate = true;
      if (dateFilter === "DAY") {
        matchesDate = orderDate.toDateString() === now.toDateString();
      } else if (dateFilter === "WEEK") {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        matchesDate = orderDate >= weekAgo;
      } else if (dateFilter === "MONTH") {
        matchesDate =
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear();
      }

      const matchesStatus = statusFilter === "ALL" || status === statusFilter;

      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [search, orders, dateFilter, statusFilter]);

  const handleSlipUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file || !selectedOrder) {
      return;
    }

    setDepositSlipData({
      file: file,
      order: selectedOrder,
    });

    setConfirmAction("UPLOAD_DEPOSIT_SLIP");
    setShowConfirmModal(true);
  };

  const executeDepositSlipUpload = async () => {
    if (!depositSlipData?.file || !depositSlipData?.order) {
      return;
    }

    try {
      setIsProcessing(true);

      const formData = new FormData();

      formData.append("orderSlip", depositSlipData.file);
      formData.append(
        "orderId",
        depositSlipData.order.orderId || depositSlipData.order.id,
      );

      const response = await axios.post(
        `${BACKEND_URL}/api/orders/upload-slip`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "User",
          },
        },
      );

      toast.success("Payment slip uploaded successfully!");

      if (response.data.order) {
        setSelectedOrder(response.data.order);
        await fetchOrders();
      }

      closeConfirmModal();
    } catch (error) {
      console.error("Upload failed:", error);

      toast.error(
        error.response?.data?.message || "Failed to upload payment slip.",
      );
    } finally {
      setIsProcessing(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleApproveReturnedOrder = () => {
    if (!selectedOrder) return;

    if (selectedOrder.status !== "RETURNED") {
      return;
    }

    setCancelOrderData(selectedOrder);
    setConfirmAction("APPROVE");
    setShowConfirmModal(true);
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "N/A";

    if (dateStr.includes("|")) {
      const parts = dateStr.split("|");
      const datePart = parts.find((p) => p.includes("New Date"));
      if (datePart) {
        return datePart.split(":")[1]?.trim() || "N/A";
      }
    }

    return dateStr;
  };

  const handleClientDecision = async (newStatus) => {
    const actionText =
      newStatus === "PENDING" ? "Approving Date" : "Cancelling Order";
    const toastId = toast.loading(`${actionText}...`);

    try {
      const idToUse = selectedOrder.orderId;
      const response = await axios.patch(
        `${BACKEND_URL}/api/orders/${idToUse}/status`,
        {
          status: newStatus,
        },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "User",
          },
        },
      );

      if (response.data) {
        toast.success(`Order updated successfully!`, { id: toastId });
        fetchOrders();
        setSelectedOrder(response.data.order);
      }
    } catch (err) {
      toast.error("Failed to update order.", { id: toastId });
    }
  };

  // Open confirmation modal for cancellation
  const handleCancelOrder = () => {
    if (!selectedOrder) return;

    const cancelableStatuses = ["PENDING", "RETURNED"];
    if (!cancelableStatuses.includes(selectedOrder.status)) {
      toast.error("This order cannot be cancelled at its current status.");
      return;
    }

    setCancelOrderData(selectedOrder);
    setConfirmAction("CANCEL");
    setShowConfirmModal(true);
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setCancelOrderData(null);
    setDepositSlipData(null);
    setConfirmAction(null);
    setIsCancelling(false);
    setIsProcessing(false);
  };

  const executeConfirmedAction = async () => {
    if (confirmAction === "UPLOAD_DEPOSIT_SLIP") {
      await executeDepositSlipUpload();
      return;
    }

    if (!cancelOrderData || !confirmAction) return;

    if (confirmAction === "CANCEL") {
      await executeCancelOrder();
      return;
    }

    if (confirmAction === "APPROVE") {
      setIsCancelling(true);

      const toastId = toast.loading("Approving new delivery date...");

      try {
        const idToUse = cancelOrderData.orderId || cancelOrderData.id;

        const response = await axios.patch(
          `${BACKEND_URL}/api/orders/${idToUse}/status`,
          {
            status: "PENDING",
          },
          {
            headers: {
              "X-Username": localStorage.getItem("username") || "",
              "X-User-Id": localStorage.getItem("userId") || "",
              "X-Role": localStorage.getItem("role") || "User",
            },
          },
        );

        if (response.data) {
          toast.success("New delivery date approved!", {
            id: toastId,
          });

          fetchOrders();
          setSelectedOrder(response.data.order);
          closeConfirmModal();
        }
      } catch (err) {
        console.error("Approve error:", err);

        toast.error(
          err.response?.data?.message ||
            "Failed to approve the new delivery date.",
          {
            id: toastId,
          },
        );
      } finally {
        setIsCancelling(false);
      }
    }
  };

  const executeCancelOrder = async () => {
    if (!cancelOrderData) return;

    setIsCancelling(true);
    const toastId = toast.loading("Cancelling order...");

    try {
      const orderId = cancelOrderData.orderId || cancelOrderData.id;

      const response = await axios.patch(
        `${BACKEND_URL}/api/orders/${orderId}/cancel`,
        {
          cancelledBy: "user",
          cancellationReason: "Cancelled by customer",
        },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "User",
          },
        },
      );

      if (response.data) {
        toast.success("Order cancelled successfully!", {
          id: toastId,
        });

        await fetchOrders();

        setSelectedOrder(response.data.order);
        closeConfirmModal();
      }
    } catch (err) {
      console.error("Cancel error:", err);
      console.error("Cancel response:", err.response?.data);

      toast.error(err.response?.data?.message || "Failed to cancel order.", {
        id: toastId,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const renderFormattedNotes = (text) => {
    if (!text) return null;

    let processedText = text;
    if (text.includes("|")) {
      processedText = text
        .split("|")
        .map((item) => item.trim())
        .join("\n");
    }

    const lines = processedText.split("\n").filter(Boolean);

    return (
      <div className="notes-list">
        {lines.map((line, index) => {
          if (line.toLowerCase().startsWith("requested delivery date:")) {
            return null;
          }

          if (line.trim() === "---") {
            return <hr key={index} className="notes-divider" />;
          }

          const colonIndex = line.indexOf(":");

          if (colonIndex !== -1) {
            const label = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();

            return (
              <div key={index} className="notes-row">
                <span className="notes-label">{label}:</span>
                <span
                  className={`notes-value ${
                    value === "Not yet sent" ||
                    value.toUpperCase().includes("REJECTED")
                      ? "text-danger"
                      : ""
                  }`}
                >
                  {value}
                </span>
              </div>
            );
          }

          return (
            <div key={index} className="notes-plain-text">
              {line}
            </div>
          );
        })}
      </div>
    );
  };

  const navigate = useNavigate();
  const goToShopping = () => navigate("/");

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <section className="main">
        <div className="go-back-action">
          <button className="back-link" onClick={goToShopping}>
            <FaLongArrowAltLeft />
            <span>Back to Shopping</span>
          </button>
        </div>

        <h1 className="title">ORDERS & TRANSACTIONS</h1>

        <div className="search-wrapper">
          <span className="search-icon">
            <FaSearch />
          </span>
          <input
            className="search-input"
            type="text"
            placeholder="Search by ID or Supply Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="table-card enhanced-table">
          <div className="order-filters">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="ALL">All Dates</option>
              <option value="DAY">Today</option>
              <option value="WEEK">This Week</option>
              <option value="MONTH">This Month</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="DELIVERED">Delivered</option>
              <option value="RETURNED">Returned</option>
              <option value="PARTIAL">Partial</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="TO SHIP">To Ship</option>
            </select>
          </div>

          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="col-order-id">ID</th>
                  <th className="col-status">DELIVERY STATUS</th>
                  <th className="col-partial">PARTIAL DELIVERY</th>
                  <th className="col-date">DATE</th>
                  <th className="col-action">ACTION</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>Loading orders...</td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-orders-cell">
                      <EmptyState
                        title={
                          search ||
                          dateFilter !== "ALL" ||
                          statusFilter !== "ALL"
                            ? "No matching orders"
                            : "No orders yet"
                        }
                        message={
                          search ||
                          dateFilter !== "ALL" ||
                          statusFilter !== "ALL"
                            ? "We couldn't find any orders that match your current search or filters."
                            : "Your orders will appear here once you place your first order."
                        }
                        buttonText={
                          search ||
                          dateFilter !== "ALL" ||
                          statusFilter !== "ALL"
                            ? "Clear Search & Filters"
                            : undefined
                        }
                        onButtonClick={
                          search ||
                          dateFilter !== "ALL" ||
                          statusFilter !== "ALL"
                            ? () => {
                                setSearch("");
                                setDateFilter("ALL");
                                setStatusFilter("ALL");
                              }
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.orderId || order.id}>
                      <td className="col-order-id">
                        {order.orderId || order.id}
                      </td>

                      <td className="col-status">
                        <span
                          className={`status-capsule status-${(
                            order.status || "PENDING"
                          )
                            .replace(/\s+/g, "-")
                            .toLowerCase()}`}
                        >
                          {order.status || "PENDING"}
                        </span>
                      </td>

                      <td className="col-partial">
                        <span
                          className={
                            order.status === "PARTIAL" || order.partialDelivery
                              ? "check-active"
                              : "cross-inactive"
                          }
                        >
                          {order.status === "PARTIAL" ||
                          order.partialDelivery ? (
                            <FaCheck />
                          ) : (
                            <FaTimes />
                          )}
                        </span>
                      </td>

                      <td className="col-date">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString()
                          : "N/A"}
                      </td>

                      <td className="col-action">
                        <button
                          className="view-btn"
                          onClick={() => setSelectedOrder(order)}
                        >
                          VIEW
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {selectedOrder && (
        <div
          className="ordertrans-receipt-overlay"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="ordertrans-receipt-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="receipt-header">
              <h2>RECEIPT</h2>
              <button
                className="ordertrans-receipt-close"
                onClick={() => setSelectedOrder(null)}
              >
                <MdOutlineExitToApp />
              </button>
              <p>Medical Supplies Delivery</p>
            </div>

            <div className="receipt-divider" />

            <div className="receipt-row">
              <span>Order ID:</span>
              <span>{selectedOrder.orderId || selectedOrder.id}</span>
            </div>

            <div className="receipt-row">
              <span>Initial Delivery Date:</span>
              <span>
                {formatDateDisplay(selectedOrder.requestedDeliveryDate)}
              </span>
            </div>

            {selectedOrder.dateNote && (
              <>
                <div className="receipt-row">
                  <span>Requested Delivery Date of Admin:</span>
                  <span>{selectedOrder.newDate}</span>
                </div>
              </>
            )}

            <div className="receipt-divider" />

            {/* Payment slip rejected banner */}
            {hasDepositSlipRejected(selectedOrder) && (
              <div className="deposit-rejected-banner">
                <FaExclamationCircle />
                <div>
                  <strong>Payment Slip Rejected</strong>
                  <p>
                    Your submitted payment slip was reviewed and could not be
                    accepted. Please upload a new, valid payment slip to
                    continue.
                  </p>
                </div>
              </div>
            )}

            <div className="receipt-section">
              <span className="remarks-header">REMARKS:</span>
              {renderFormattedNotes(
                (() => {
                  let remarks = "";

                  if (hasDepositSlipSent(selectedOrder)) {
                    remarks += "Payment Slip: Sent to Accountant\n";
                  } else if (hasDepositSlipRejected(selectedOrder)) {
                    remarks += "Payment Slip: REJECTED — please re-upload\n";
                  } else {
                    remarks += "Payment Slip: Not yet sent\n";
                  }

                  if (
                    selectedOrder.status === "RETURNED" &&
                    selectedOrder.dateNote
                  ) {
                    remarks += `Proposed Date: ${selectedOrder.newDate}\nReason: ${selectedOrder.dateNote}\n\nPlease review and approve or cancel this order.`;
                  } else if (
                    selectedOrder.status === "PENDING" &&
                    selectedOrder.newDate
                  ) {
                    remarks += `You have approved the new delivery date. Please wait for admin confirmation.\n\nNew Date: ${selectedOrder.newDate}\nReason: ${selectedOrder.dateNote || "No reason provided"}`;
                  } else {
                    remarks += selectedOrder.notes || "No remarks yet.";
                  }

                  return remarks;
                })(),
              )}
            </div>

            <div className="receipt-divider" />

            <div className="receipt-section">
              <h4>CUSTOMER INFORMATION</h4>
              <p>
                <strong>Name:</strong>{" "}
                {selectedOrder.customerName || selectedOrder.name}
              </p>
              <p>
                <strong>Address:</strong>{" "}
                {selectedOrder.deliveryAddress || selectedOrder.shippingAddress}
              </p>
            </div>

            <div className="receipt-divider" />

            <div className="receipt-section">
              <h4>Order Supplies</h4>
              {selectedOrder.items?.map((item, index) => {
                const isBox = item.orderMode === "box";
                const unitType = item.unitType || "N/A";
                const packageLabel =
                  String(unitType).trim().toLowerCase() === "box"
                    ? "Case"
                    : "Box";
                const orderLabel = isBox ? packageLabel : unitType;
                const orderCount = isBox
                  ? Number(item.boxes) || 0
                  : item.quantity;
                const pluralizeLabel = (label) => {
                  const text = String(label);
                  const lastCharacter = text.trimEnd().slice(-1).toLowerCase();
                  if (!lastCharacter || lastCharacter === "s") return text;
                  return `${text}${lastCharacter === "e" ? "s" : "es"}`;
                };
                const pluralOrderLabel =
                  Number(orderCount) > 1
                    ? pluralizeLabel(orderLabel)
                    : orderLabel;
                const orderCountLabel = pluralOrderLabel;
                const unitCountLabel =
                  Number(item.quantity) > 1
                    ? pluralizeLabel(unitType)
                    : unitType;

                return (
                  <div key={index} className="receipt-item">
                    <div className="item-top">
                      <span className="item-name">{item.name}</span>
                    </div>
                    <div className="item-bottom">
                      {/* <span>{item.description || item.category || "N/A"}</span> */}
                      <span>
                        Ordered by {orderLabel}: {orderCount} {orderCountLabel}
                        {isBox && Number(item.quantityPerBox) > 0 && (
                          <>
                            {" "}
                            ({item.quantity} {unitCountLabel})
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="receipt-divider" />

            <div className="receipt-status-box">
              Order Status:{" "}
              <span>{(selectedOrder.status || "PENDING").toUpperCase()}</span>
            </div>

            {selectedOrder.status === "RETURNED" && (
              <div className="client-decision-group">
                <button
                  className="btn-approve-proposal"
                  onClick={handleApproveReturnedOrder}
                >
                  APPROVE NEW DATE
                </button>

                <button
                  className="btn-cancel-order"
                  onClick={handleCancelOrder}
                >
                  CANCEL ORDER
                </button>
              </div>
            )}

            {/* Payment slip submit / re-upload button */}
            {(() => {
              const sent = hasDepositSlipSent(selectedOrder);
              const rejected = hasDepositSlipRejected(selectedOrder);
              const isToShip = selectedOrder.status === "TO SHIP";

              const buttonClass = sent
                ? "deposit-sent"
                : rejected
                  ? "deposit-rejected"
                  : isToShip
                    ? "enabled"
                    : "disabled";

              const buttonLabel = sent
                ? "PAYMENT SLIP SENT ✓"
                : rejected
                  ? "RE-UPLOAD PAYMENT SLIP"
                  : isProcessing
                    ? "UPLOADING..."
                    : "SUBMIT PAYMENT SLIP";

              const isDisabled =
                sent || (!isToShip && !rejected) || isProcessing;

              return (
                <button
                  className={`submit-slip-btn ${buttonClass}`}
                  disabled={isDisabled}
                  onClick={() => {
                    if (sent) {
                      toast.info("Payment slip has already been sent");
                      return;
                    }

                    if (rejected) {
                      fileInputRef.current?.click();
                      return;
                    }

                    if (isToShip) {
                      fileInputRef.current?.click();
                    } else {
                      toast.info(
                        "Please wait for the order to be in 'TO SHIP' status",
                      );
                    }
                  }}
                >
                  {buttonLabel}
                </button>
              );
            })()}

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleSlipUpload}
            />

            {/* Cancel Order Button */}
            {selectedOrder.status !== "RETURNED" && (
              <button
                className="receipt-close-btn"
                onClick={handleCancelOrder}
                disabled={
                  selectedOrder.status === "CANCELLED" ||
                  selectedOrder.status === "DELIVERED" ||
                  selectedOrder.status === "TO SHIP" ||
                  selectedOrder.status === "APPROVED"
                }
              >
                {selectedOrder.status === "CANCELLED"
                  ? "ORDER CANCELLED"
                  : selectedOrder.status === "DELIVERED"
                    ? "ORDER DELIVERED"
                    : selectedOrder.status === "TO SHIP"
                      ? "CANNOT CANCEL - TO SHIP"
                      : selectedOrder.status === "APPROVED"
                        ? "CANNOT CANCEL - APPROVED"
                        : "CANCEL ORDER"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal-card">
            <div
              className="confirm-modal-icon"
              style={{
                color:
                  confirmAction === "APPROVE"
                    ? "#28a745"
                    : confirmAction === "UPLOAD_DEPOSIT_SLIP"
                      ? "#d4af37"
                      : "#dc3545",
              }}
            >
              <FaExclamationCircle />
            </div>

            <h3 className="confirm-modal-title">
              {confirmAction === "APPROVE" && "Approve New Delivery Date?"}

              {confirmAction === "CANCEL" && "Cancel Order?"}

              {confirmAction === "UPLOAD_DEPOSIT_SLIP" &&
                (hasDepositSlipRejected(depositSlipData?.order)
                  ? "Re-upload Payment Slip?"
                  : "Send Payment Slip?")}
            </h3>

            <p className="confirm-modal-message">
              {confirmAction === "APPROVE" &&
                "Are you sure you want to approve the proposed new delivery date? This action cannot be undone."}

              {confirmAction === "CANCEL" &&
                (cancelOrderData?.status === "RETURNED"
                  ? "Are you sure you want to cancel this returned order? This action cannot be undone."
                  : "Are you sure you want to cancel this order? This action cannot be undone.")}

              {confirmAction === "UPLOAD_DEPOSIT_SLIP" && (
                <>
                  <span>
                    {hasDepositSlipRejected(depositSlipData?.order)
                      ? "Are you sure you want to re-upload this payment slip and send it to the accountant?"
                      : "Are you sure you want to send this payment slip to the accountant?"}
                  </span>

                  <strong className="confirm-file-name">
                    {depositSlipData?.file?.name}
                  </strong>
                </>
              )}
            </p>

            <div className="confirm-modal-footer">
              <button
                type="button"
                className="confirm-modal-btn confirm-modal-btn-cancel"
                onClick={closeConfirmModal}
                disabled={isCancelling || isProcessing}
              >
                {confirmAction === "APPROVE"
                  ? "Keep Reviewing"
                  : confirmAction === "UPLOAD_DEPOSIT_SLIP"
                    ? "Cancel"
                    : "Keep Order"}
              </button>

              <button
                type="button"
                className="confirm-modal-btn confirm-modal-btn-confirm"
                onClick={executeConfirmedAction}
                disabled={isCancelling || isProcessing}
                style={{
                  background:
                    confirmAction === "APPROVE"
                      ? "#28a745"
                      : confirmAction === "UPLOAD_DEPOSIT_SLIP"
                        ? "#d4af37"
                        : "#dc3545",
                  borderColor:
                    confirmAction === "APPROVE"
                      ? "#28a745"
                      : confirmAction === "UPLOAD_DEPOSIT_SLIP"
                        ? "#d4af37"
                        : "#dc3545",
                }}
              >
                {isCancelling || isProcessing
                  ? "Processing..."
                  : confirmAction === "APPROVE"
                    ? "Yes, Approve Date"
                    : confirmAction === "UPLOAD_DEPOSIT_SLIP"
                      ? "Yes, Proceed"
                      : "Yes, Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
