import React, { useState, useEffect, useMemo } from "react";
import {
  FaSearch,
  FaCheck,
  FaTimes,
  FaUserAlt,
  FaPen,
  FaFilter,
  FaPrint,
  FaExchangeAlt,
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
import { formatReportDate } from "../utils/pdf/pdfLayout";
import logReportPrinted from "../utils/logReportPrinted";
import usePolling from "../hooks/usePolling";

const ClientsOrder = () => {
  const [activeModal, setActiveModal] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const [partialQuantities, setPartialQuantities] = useState({});
  const [isPartialMode, setIsPartialMode] = useState(false);

  const [showInvalidPartialModal, setShowInvalidPartialModal] = useState(false);
  const [invalidPartialItem, setInvalidPartialItem] = useState("");

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

  // Brand change: the order line being changed, the products that can
  // replace it, and the admin's offer.
  const [brandLine, setBrandLine] = useState(null);
  const [brandOptions, setBrandOptions] = useState([]);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandForm, setBrandForm] = useState({
    toItemCode: "",
    replaceQuantity: "",
    newQuantity: "",
    newOrderMode: "piece",
    reason: "",
  });

  const [isStockSufficient, setIsStockSufficient] = useState(true);
  const [insufficientItems, setInsufficientItems] = useState([]);
  const [checkingStock, setCheckingStock] = useState(false);
  const [productStockLevels, setProductStockLevels] = useState({});

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

  const checkStockAvailability = async (order) => {
    if (order.status !== "PENDING") {
      setIsStockSufficient(true);
      setInsufficientItems([]);
      setProductStockLevels({});
      return;
    }

    setCheckingStock(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/orders/check-stock`,
        {
          items: order.items.map((item) => ({
            itemCode: item.itemCode,
            quantity: item.quantity,
          })),
        },
      );

      // Add each item's unit so the warning says "72 Boxes", not "72 pcs".
      const insufficient = (response.data.insufficientItems || []).map(
        (entry) => ({
          ...entry,
          unitType:
            order.items.find((item) => item.itemCode === entry.itemCode)
              ?.unitType || entry.unitType,
        }),
      );
      setInsufficientItems(insufficient);
      const sufficient = insufficient.length === 0;
      setIsStockSufficient(sufficient);

      const stockLevels = {};
      response.data.stockLevels?.forEach((item) => {
        stockLevels[item.itemCode] = item.available;
      });
      setProductStockLevels(stockLevels);

      if (!sufficient) {
        showInsufficientStockToast(insufficient);
      }

      return insufficient;
    } catch (error) {
      console.error("Error checking stock:", error);
      setIsStockSufficient(true);
      setInsufficientItems([]);
      setProductStockLevels({});
      return [];
    } finally {
      setCheckingStock(false);
    }
  };

  const showInsufficientStockToast = (items) => {
    toast(
      <div>
        {items.length > 0 ? (
          items.map((item, index) => (
            <div
              key={item.itemCode || index}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <IoIosInformationCircleOutline
                style={{
                  color: "red",
                  fontSize: "40px",
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ marginBottom: "5px" }}>
                  <strong>
                    Insufficient Stock for{" "}
                    {item.productName || "Unknown Product"}
                  </strong>
                </div>
                <div>
                  Available: {item.available ?? 0}{" "}
                  {unitLabel(item.available ?? 0, item.unitType)}
                </div>
                <div style={{ marginTop: "5px", fontWeight: "600" }}>
                  Partial delivery is recommended.
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <IoIosInformationCircleOutline
              style={{
                color: "red",
                fontSize: "40px",
                flexShrink: 0,
              }}
            />
            <div>
              <div>There is not enough stock to approve this order.</div>
              <div style={{ marginTop: "5px", fontWeight: "600" }}>
                Partial delivery is recommended.
              </div>
            </div>
          </div>
        )}
      </div>,
      { duration: 8000 },
    );
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
    setIsPartialMode(false);

    const initialQuantities = {};
    order.items.forEach((item) => {
      initialQuantities[item.productId] = 0;
    });
    setPartialQuantities(initialQuantities);
    setIsEditingDate(false);
    setEditReason("");

    const existingDate = order.notes?.split(": ")[1] || "";
    setEditedDate(existingDate);

    setIsStockSufficient(true);
    setInsufficientItems([]);
    setProductStockLevels({});

    await checkStockAvailability(order);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setIsStockSufficient(true);
    setInsufficientItems([]);
    setIsPartialMode(false);
    setProductStockLevels({});
  };
  //approve ni admin
  const updateOrderStatus = async (orderId, newStatus) => {
    if (!isStockSufficient) {
      showInsufficientStockToast(insufficientItems);
      return;
    }

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
      if (err.response?.status === 409) {
        const data = err.response.data || {};
        const insufficientItems = (
          Array.isArray(data.insufficientItems) ? data.insufficientItems : []
        ).map((entry) => ({
          ...entry,
          unitType: selectedOrder?.items?.find(
            (item) => item.itemCode === entry.itemCode,
          )?.unitType,
        }));

        showInsufficientStockToast(insufficientItems);
        return;
      }

      toast.error(err.response?.data?.message || "Update failed", {
        id: toastId,
      });
    }
  };

  const handlePartialInputChange = (productId, value, maxQty, itemCode) => {
    if (value === "") {
      setPartialQuantities((prev) => ({
        ...prev,
        [productId]: "",
      }));
      return;
    }

    const val = Number(value);

    if (!Number.isFinite(val) || !Number.isInteger(val)) {
      return;
    }

    if (val < 0) {
      toast.error("Quantity cannot be negative");
      return;
    }

    const availableStock = productStockLevels[itemCode] || 0;
    if (val > availableStock) {
      toast.error(`Only ${availableStock} pcs available in stock`);
      return;
    }

    if (val > maxQty) {
      toast.error(`Maximum ordered quantity is ${maxQty}`);
      return;
    }

    setPartialQuantities((prev) => ({
      ...prev,
      [productId]: val,
    }));
  };

  const handlePartialDeliverySubmit = async () => {
    const invalidItem = selectedOrder.items.find((item) => {
      const quantity = partialQuantities[item.productId];

      return (
        quantity === "" ||
        quantity === undefined ||
        !Number.isFinite(Number(quantity)) ||
        !Number.isInteger(Number(quantity))
      );
    });

    if (invalidItem) {
      setInvalidPartialItem(invalidItem.name);
      setShowInvalidPartialModal(true);
      return;
    }

    const itemsWithQuantities = selectedOrder.items.map((item) => {
      const deliveredQty =
        partialQuantities[item.productId] === ""
          ? 0
          : Number(partialQuantities[item.productId] ?? 0);

      const availableStock = productStockLevels[item.itemCode] || 0;

      if (deliveredQty > availableStock) {
        toast.error(
          `Not enough stock for ${item.name}. Available: ${availableStock} ${unitLabel(availableStock, item.unitType)}`,
        );
        return null;
      }

      return {
        productId: item.productId,
        itemCode: item.itemCode,
        name: item.name,
        category: item.category,
        unitType: item.unitType,
        price: item.price,
        image: item.image,
        deliveredQty: deliveredQty,
        originalQty: item.quantity,
      };
    });

    if (itemsWithQuantities.includes(null)) {
      return;
    }

    const hasAnyDelivery = itemsWithQuantities.some(
      (item) => item.deliveredQty > 0,
    );

    if (!hasAnyDelivery) {
      toast.error("Please set at least one item quantity to deliver");
      return;
    }

    const toastId = toast.loading("Processing Partial...");

    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/orders/${selectedOrder.orderId}/partial`,
        { items: itemsWithQuantities },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );

      if (response.data.success) {
        toast.success(`Order split successfully!`, { id: toastId });
        handleCloseModal();
        setPartialQuantities({});
        fetchOrders();
      }
    } catch (err) {
      console.error("Partial delivery error:", err);
      toast.error(err.response?.data?.message || "Partial delivery failed", {
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

  const closeBrandChange = () => {
    setBrandLine(null);
    setBrandOptions([]);
    setBrandSearch("");
    setBrandSaving(false);
  };

  const openBrandChange = async (item) => {
    setBrandLine(item);
    setBrandOptions([]);
    setBrandSearch("");
    // Start with only the missing amount, so the client keeps what is in stock.
    const inStock = productStockLevels[item.itemCode] ?? 0;
    const shortfall = item.quantity - inStock;
    setBrandForm({
      toItemCode: "",
      replaceQuantity: String(
        shortfall > 0 && shortfall < item.quantity ? shortfall : item.quantity,
      ),
      newQuantity: "",
      newOrderMode: "piece",
      reason: "",
    });
    setBrandLoading(true);
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/orders/${encodeURIComponent(selectedOrder.orderId)}/brand-alternatives/${item._id}`,
      );
      setBrandOptions(response.data.alternatives || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load other brands");
    } finally {
      setBrandLoading(false);
    }
  };

  const selectedBrandOption = brandOptions.find(
    (option) => option.itemCode === brandForm.toItemCode,
  );

  // Suggests enough of the new brand to cover the pieces being replaced:
  // whole boxes in box mode, the same count in piece mode.
  const suggestNewQuantity = (option, replaceQuantity, mode) => {
    const pieces = Number(replaceQuantity) || 0;
    if (!option || pieces <= 0) return "";
    if (mode === "box" && option.quantityPerBox > 0) {
      return String(Math.ceil(pieces / option.quantityPerBox));
    }
    return String(pieces);
  };

  // The new brand is offered in the same unit as the line it replaces
  // (90 Boxes replaces 90 Boxes), so both fields count the same thing.
  // Pack sizes differ between brands, so cases are only shown as a hint.
  const handlePickBrand = (option) => {
    const mode = "piece";
    setBrandForm((prev) => ({
      ...prev,
      toItemCode: option.itemCode,
      newOrderMode: mode,
      newQuantity: suggestNewQuantity(option, prev.replaceQuantity, mode),
    }));
  };

  const brandNewPieces = (() => {
    const count = Number(brandForm.newQuantity) || 0;
    if (!selectedBrandOption) return 0;
    return brandForm.newOrderMode === "box"
      ? count * selectedBrandOption.quantityPerBox
      : count;
  })();

  const handleProposeBrand = async () => {
    const replaceQuantity = Number(brandForm.replaceQuantity);
    const newQuantity = Number(brandForm.newQuantity);
    if (!selectedBrandOption) {
      toast.error("Please pick the new brand");
      return;
    }
    if (
      !Number.isInteger(replaceQuantity) ||
      replaceQuantity < 1 ||
      replaceQuantity > brandLine.quantity
    ) {
      toast.error(`Quantity to replace must be 1 to ${brandLine.quantity}`);
      return;
    }
    if (!Number.isInteger(newQuantity) || newQuantity < 1) {
      toast.error("Please enter the new quantity");
      return;
    }
    if (brandNewPieces > selectedBrandOption.available) {
      toast.error(
        `Only ${selectedBrandOption.available} pcs of ${selectedBrandOption.name} in stock`,
      );
      return;
    }
    if (!brandForm.reason.trim()) {
      toast.error("Please give a reason for the brand change");
      return;
    }

    setBrandSaving(true);
    const toastId = toast.loading("Sending brand change to the client...");
    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/orders/${encodeURIComponent(selectedOrder.orderId)}/propose-brand`,
        {
          lineId: brandLine._id,
          toItemCode: selectedBrandOption.itemCode,
          replaceQuantity,
          newQuantity,
          newOrderMode: brandForm.newOrderMode,
          reason: brandForm.reason.trim(),
        },
      );
      toast.success(response.data.message || "Brand change sent", {
        id: toastId,
      });
      if (response.data.order) setSelectedOrder(response.data.order);
      closeBrandChange();
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || "Brand change failed", {
        id: toastId,
      });
      setBrandSaving(false);
    }
  };

  const filteredBrandOptions = brandOptions.filter((option) =>
    `${option.name} ${option.itemCode}`
      .toLowerCase()
      .includes(brandSearch.trim().toLowerCase()),
  );

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
    if (checkingStock) return true;
    if (isLocked) return true;
    if (selectedOrder?.status === "PENDING" && !isStockSufficient) return true;
    if (selectedOrder?.status === "CANCELLED") return true;
    return false;
  };

  const getPartialButtonDisabledState = () => {
    if (isLocked) return true;
    // A PARTIAL order was already split; splitting it again would replace
    // its backorder (-P) order.
    if (["CANCELLED", "PARTIAL"].includes(selectedOrder?.status)) return true;
    return false;
  };

  const getApproveButtonDisabledReason = () => {
    if (checkingStock) return "Checking stock availability...";
    if (isLocked) return "Order is locked";
    if (selectedOrder?.status === "PENDING" && !isStockSufficient)
      return "Insufficient stock";
    return "";
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
        .map((item) => `${item.name} (${item.quantity} ${unitLabel(item.quantity, item.unitType)})`)
        .join(", ");

      const totalPrice = Number(order.total || 0);

      return [
        order.orderId,
        order.name,
        order.status,
        formatReportDate(
          order.requestedDeliveryDate ||
            order.notes?.split(":")[1]?.trim() ||
            "",
        ),
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

    const filterConditions = [];
    if (reportFilters.clientName)
      filterConditions.push(`Client: ${reportFilters.clientName}`);
    if (reportFilters.deliveryStatus)
      filterConditions.push(`Status: ${reportFilters.deliveryStatus}`);
    if (reportFilters.startDate && reportFilters.endDate)
      filterConditions.push(
        `Date Range: ${formatReportDate(reportFilters.startDate)} - ${formatReportDate(reportFilters.endDate)}`,
      );
    else if (reportFilters.startDate)
      filterConditions.push(
        `From Date: ${formatReportDate(reportFilters.startDate)}`,
      );
    else if (reportFilters.endDate)
      filterConditions.push(
        `Until Date: ${formatReportDate(reportFilters.endDate)}`,
      );


    generateFilteredReport({
      title: "Order Report",
      filters: filterConditions.length > 0 ? filterConditions.join(", ") : "None (all orders)",
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
                          {isPaymentOverdue(order) && (
                            <span
                              className="status-capsule status-cancelled"
                              style={{ marginLeft: 6 }}
                              title={`Payment was due ${formatShortDate(order.paymentDueDate)}`}
                            >
                              OVERDUE
                            </span>
                          )}
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

                <div className="modal-section-grid">
                  <div className="detail-group full title">
                    <h4>Payment &amp; Delivery</h4>
                  </div>
                  <DetailItem
                    label="Payment Status"
                    value={
                      isPaymentOverdue(selectedOrder)
                        ? `${selectedOrder.paymentStatus || "PENDING"} (OVERDUE)`
                        : selectedOrder.paymentStatus || "PENDING"
                    }
                  />
                  <DetailItem
                    label="Payment Due"
                    value={
                      selectedOrder.paymentDueDate
                        ? formatShortDate(selectedOrder.paymentDueDate)
                        : "Set when delivered"
                    }
                  />
                  <DetailItem
                    label="Delivered On"
                    value={
                      selectedOrder.deliveredDate
                        ? formatShortDate(selectedOrder.deliveredDate)
                        : "Not yet delivered"
                    }
                  />
                  <DetailItem
                    label="Delivered By"
                    value={selectedOrder.deliveredBy || "N/A"}
                  />
                  <div className="field-group full-width">
                    <label className="field-label">
                      Delivery Receipt (DR) Photo
                    </label>
                    {selectedOrder.deliveryReceipt ? (
                      <div className="dr-photo-card">
                        <a
                          className="dr-photo-thumb"
                          href={selectedOrder.deliveryReceipt}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open the full-size DR photo"
                        >
                          <img
                            src={selectedOrder.deliveryReceipt}
                            alt={`Delivery receipt for order ${selectedOrder.orderId}`}
                          />
                        </a>
                        <div className="dr-photo-meta">
                          <span className="dr-photo-title">
                            Signed delivery receipt
                          </span>
                          <span className="dr-photo-sub">
                            Taken by{" "}
                            {selectedOrder.deliveredBy || "the driver"}
                            {selectedOrder.deliveredDate
                              ? ` on ${formatShortDate(selectedOrder.deliveredDate)}`
                              : ""}
                          </span>
                          <a
                            className="dr-photo-link"
                            href={selectedOrder.deliveryReceipt}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View full size
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="field-box">No DR photo yet</div>
                    )}
                  </div>
                </div>

                <div className="detail-group full title">
                  <h4>Items Ordered</h4>
                </div>
                <div className="detail-group full">
                  <div className="order-items-table-container brand-scroll">
                    <table className="order-items-table">
                      <thead>
                        <tr>
                          <th>Supply Name</th>
                          <th>Ordered</th>
                          <th>Available for Shipment</th>
                          <th>Backorder Balance</th>
                          <th>Unit Price</th>
                          <th>Stock Available</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((item, index) => {
                          const availableStock =
                            productStockLevels[item.itemCode] ?? 0;
                          // On a PENDING order, show what stock can actually
                          // ship now, not the ordered quantity.
                          const hasStockInfo =
                            selectedOrder.status === "PENDING" &&
                            !checkingStock &&
                            item.itemCode in productStockLevels;
                          const shippableNow = hasStockInfo
                            ? Math.min(item.quantity, availableStock)
                            : item.quantity;
                          const inputQty = isPartialMode
                            ? (partialQuantities[item.productId] ?? 0)
                            : shippableNow;

                          const numericInputQty =
                            inputQty === "" ? 0 : Number(inputQty);
                          const balance = item.quantity - numericInputQty;
                          const isShort =
                            hasStockInfo && availableStock < item.quantity;

                          return (
                            <tr key={index}>
                              <td>
                                <div>{item.name}</div>
                                <BrandCell
                                  item={item}
                                  canChange={
                                    selectedOrder.status === "PENDING" &&
                                    !isPartialMode &&
                                    isShort
                                  }
                                  onChange={() => openBrandChange(item)}
                                />
                              </td>
                              <td>{item.quantity} {unitLabel(item.quantity, item.unitType)}</td>
                              <td>
                                <input
                                  type="number"
                                  className={`partial-input-field ${isPartialMode ? "editable" : "locked"}`}
                                  value={inputQty}
                                  disabled={!isPartialMode}
                                  onChange={(e) =>
                                    handlePartialInputChange(
                                      item.productId,
                                      e.target.value,
                                      item.quantity,
                                      item.itemCode,
                                    )
                                  }
                                  style={{
                                    ...(isShort && {
                                      borderColor: "#ff6b6b",
                                      backgroundColor: "#fff5f5",
                                    }),
                                  }}
                                />
                              </td>
                              <td className={balance > 0 ? "backorder-short" : ""}>
                                {balance > 0
                                  ? `${balance} ${unitLabel(balance, item.unitType)}`
                                  : "Full Delivery"}
                              </td>
                              <td> ₱{Number(item.price || 0).toFixed(2)} </td>
                              <td>{availableStock} {unitLabel(availableStock, item.unitType)}</td>
                            </tr>
                          );
                        })}
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
                ) : !isPartialMode ? (
                  <>
                    <button
                      className="btn-approve"
                      onClick={() =>
                        updateOrderStatus(selectedOrder.orderId, "APPROVED")
                      }
                      disabled={getApproveButtonDisabledState()}
                      style={
                        getApproveButtonDisabledState() ? disabledStyle : {}
                      }
                      title={getApproveButtonDisabledReason()}
                    >
                      APPROVE
                    </button>

                    <button
                      className="btn-partial"
                      onClick={() => setIsPartialMode(true)}
                      disabled={getPartialButtonDisabledState()}
                      style={
                        getPartialButtonDisabledState() ? disabledStyle : {}
                      }
                    >
                      PARTIAL
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-cancel"
                      onClick={() => {
                        setIsPartialMode(false);
                        const resetQuantities = {};
                        selectedOrder.items.forEach((item) => {
                          resetQuantities[item.productId] = 0;
                        });
                        setPartialQuantities(resetQuantities);
                      }}
                    >
                      CANCEL
                    </button>
                    <button
                      className="btn-confirm-partial"
                      onClick={handlePartialDeliverySubmit}
                    >
                      CONFIRM PARTIAL
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {brandLine && selectedOrder && (
          <div className="order-modal-overlay" style={{ zIndex: 1100 }}>
            <div className="order-modal-container brand-modal">
              <div className="order-modal-header">
                <h3>CHANGE BRAND</h3>
                <FaTimes
                  className="order-close-icon"
                  onClick={closeBrandChange}
                />
              </div>

              <div className="order-modal-body">
                {(() => {
                  const inStock = productStockLevels[brandLine.itemCode] ?? 0;
                  const short = Math.max(0, brandLine.quantity - inStock);
                  const unit = (n) => unitLabel(n, brandLine.unitType);
                  return (
                    <div className="brand-current">
                      <div className="brand-current-name">{brandLine.name}</div>
                      <div className="brand-current-line">
                        Ordered <strong>{brandLine.quantity} {unit(brandLine.quantity)}</strong>
                        {" · "}
                        {inStock} in stock
                        {short > 0 && (
                          <span className="brand-short">
                            {" · "}
                            {short} {unit(short)} short
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <section>
                  <p className="brand-step-title">1. Pick the replacement brand</p>
                  {brandOptions.length > 4 && (
                    <div className="brand-search">
                      <FaSearch />
                      <input
                        type="text"
                        className="brand-input"
                        placeholder="Search brand"
                        value={brandSearch}
                        onChange={(e) => setBrandSearch(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="brand-options">
                    {brandLoading ? (
                      <div className="brand-empty">Loading other brands...</div>
                    ) : filteredBrandOptions.length === 0 ? (
                      <div className="brand-empty">
                        {brandOptions.length === 0
                          ? "No other brand in this category has stock."
                          : "No brand matches your search."}
                      </div>
                    ) : (
                      filteredBrandOptions.map((option) => {
                        const picked = option.itemCode === brandForm.toItemCode;
                        return (
                          <button
                            type="button"
                            key={option.itemCode}
                            className={`brand-option ${picked ? "picked" : ""}`}
                            onClick={() => handlePickBrand(option)}
                            aria-pressed={picked}
                          >
                            <span className="brand-radio" aria-hidden="true" />
                            <span className="brand-option-main">
                              <span className="brand-option-name">
                                {option.name}
                              </span>
                            </span>
                            <span className="brand-option-stock">
                              {option.available} in stock
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                <section>
                  <p className="brand-step-title">2. How many</p>
                  <div className="brand-qty-grid">
                    <div>
                      <div className="brand-qty-label">
                        Replace {unitLabel(2, brandLine.unitType)}
                      </div>
                      <div className="brand-qty-row">
                        <input
                          type="number"
                          min="1"
                          max={brandLine.quantity}
                          className="brand-input"
                          value={brandForm.replaceQuantity}
                          onChange={(e) => {
                            const value = e.target.value;
                            setBrandForm((prev) => ({
                              ...prev,
                              replaceQuantity: value,
                              newQuantity: suggestNewQuantity(
                                selectedBrandOption,
                                value,
                                prev.newOrderMode,
                              ),
                            }));
                          }}
                        />
                        <span className="brand-suffix">
                          of {brandLine.quantity}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="brand-qty-label">
                        Give{" "}
                        {selectedBrandOption
                          ? unitLabel(2, selectedBrandOption.unitType)
                          : ""}{" "}
                        Of New Brand
                      </div>
                      <div className="brand-qty-row">
                        <input
                          type="number"
                          min="1"
                          className="brand-input"
                          value={brandForm.newQuantity}
                          disabled={!selectedBrandOption}
                          placeholder={selectedBrandOption ? "" : "Pick a brand first"}
                          onChange={(e) =>
                            setBrandForm((prev) => ({
                              ...prev,
                              newQuantity: e.target.value,
                            }))
                          }
                        />
                      </div>
                      {selectedBrandOption &&
                        brandNewPieces > selectedBrandOption.available && (
                          <div className="brand-hint error">
                            Only {selectedBrandOption.available} in stock
                          </div>
                        )}
                    </div>
                  </div>

                  {(() => {
                    const replace = Number(brandForm.replaceQuantity) || 0;
                    if (!selectedBrandOption || replace < 1 || brandNewPieces < 1) {
                      return null;
                    }
                    const keep = Math.max(0, brandLine.quantity - replace);
                    return (
                      <div className="brand-summary">
                        The client will receive{" "}
                        {keep > 0 && (
                          <>
                            <strong>
                              {keep} {unitLabel(keep, brandLine.unitType)}
                            </strong>{" "}
                            of {brandLine.name} and{" "}
                          </>
                        )}
                        <strong>
                          {brandNewPieces}{" "}
                          {unitLabel(brandNewPieces, selectedBrandOption.unitType)}
                        </strong>{" "}
                        of {selectedBrandOption.name}
                        {keep === 0 && ` instead of ${brandLine.name}`}.
                      </div>
                    );
                  })()}
                </section>

                <section>
                  <p className="brand-step-title">
                    3. Reason{" "}
                    <span className="brand-required" aria-label="required">
                      *
                    </span>
                  </p>
                  <select
                    className="brand-select"
                    value={brandForm.reason}
                    onChange={(e) =>
                      setBrandForm((prev) => ({ ...prev, reason: e.target.value }))
                    }
                  >
                    <option value="">Select a reason</option>
                    {BRAND_CHANGE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </section>
              </div>

              <div className="modal-action-footer">
                <button className="btn-cancel" onClick={closeBrandChange}>
                  CANCEL
                </button>
                <button
                  className="btn-approve"
                  onClick={handleProposeBrand}
                  disabled={
                    brandSaving || !selectedBrandOption || !brandForm.reason
                  }
                  style={
                    brandSaving || !selectedBrandOption || !brandForm.reason
                      ? disabledStyle
                      : {}
                  }
                >
                  {brandSaving ? "SENDING..." : "SEND TO CLIENT"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showInvalidPartialModal && (
          <div
            className="cart-modal-overlay"
            onClick={() => setShowInvalidPartialModal(false)}
          >
            <div
              className="cart-confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cart-modal-icon warning-icon">!</div>

              <h3>Invalid Quantity</h3>

              <p>
                Please enter a quantity greater than <strong>0</strong> for{" "}
                <strong>{invalidPartialItem}</strong> before confirming the
                partial delivery.
              </p>

              <button
                type="button"
                className="cart-modal-ok"
                onClick={() => setShowInvalidPartialModal(false)}
              >
                Okay
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// "1 Gallon", "5 Gallons", "3 Pieces" — orders store the product's unit.
const unitLabel = (quantity, unitType) => {
  const unit = String(unitType || "").trim() || "Piece";
  if (Number(quantity) === 1) return unit.replace(/s$/i, "") || unit;
  const lower = unit.toLowerCase();
  if (lower.endsWith("s")) return unit;
  return /(x|z|ch|sh)$/.test(lower) ? `${unit}es` : `${unit}s`;
};

// Pay-after-delivery: payment is due 30 days after delivery.
const isPaymentOverdue = (order) =>
  order?.status === "DELIVERED" &&
  Boolean(order.paymentDueDate) &&
  new Date(order.paymentDueDate) <= new Date() &&
  !["COMPLETED", "AWAITING REVIEW"].includes(order.paymentStatus);

const formatShortDate = (value) =>
  new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// Reasons the admin can give the client for a brand change.
const BRAND_CHANGE_REASONS = [
  "Out of stock",
  "Not enough stock",
  "Supplier delay",
  "Product discontinued",
  "Stock near expiry",
];

// The Brand column: the state of a brand change on this line, and the
// button that starts one. The button shows only on PENDING orders, on lines
// that do not have enough stock.
const BrandCell = ({ item, canChange, onChange }) => {
  const offer = item.brandChange || {};
  const showButton = canChange && offer.status !== "PROPOSED";
  const hasNote =
    item.originalName || ["PROPOSED", "DECLINED"].includes(offer.status);
  if (!hasNote && !showButton) return null;

  return (
    <div className="brand-cell">
      {item.originalName && (
        <span className="brand-note changed" title={`Changed from ${item.originalName}`}>
          Was {item.originalName}
        </span>
      )}
      {offer.status === "PROPOSED" && (
        <span className="brand-note waiting" title={`Offered ${offer.toName}`}>
          Waiting For Client
        </span>
      )}
      {offer.status === "DECLINED" && (
        <span className="brand-note declined" title={`Client declined ${offer.toName}`}>
          Declined
        </span>
      )}
      {showButton && (
        <button type="button" className="brand-change-btn" onClick={onChange}>
          <FaExchangeAlt aria-hidden="true" /> Change
        </button>
      )}
    </div>
  );
};

const DetailItem = ({ label, value, fullWidth }) => (
  <div className={`field-group ${fullWidth ? "full-width" : ""}`}>
    <label className="field-label">{label}</label>
    <div className="field-box">{value || "N/A"}</div>
  </div>
);

export default ClientsOrder;
