import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaTimes,
  FaPlusCircle,
  FaSave,
  FaEdit,
  FaEye,
  FaPrint,
  FaFilter,
  FaUserCheck,
  FaUserTimes,
} from "react-icons/fa";
import axios from "axios";
import "../styles/InformationLayout.css";
import "../styles/capsules.css";
import "../styles/ConfirmModal.css";
import { Toaster, toast } from "react-hot-toast";
import logo from "../assets/Premiumed logo.png";
import EmptyState from "../components/EmptyState";
import { generateSupplyFilteredReport } from "../utils/pdf/SupplierInfoReportEngine";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");
const API_URL = `${BACKEND_URL}/api/suppliers`;
const BATCH_API = `${BACKEND_URL}/api/putaway/all`;
const ITEMS_API = `${BACKEND_URL}/api/products`;

const SuppliersInformation = () => {
  const [activeTab, setActiveTab] = useState("purchases");
  const [activeModal, setActiveModal] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [suppliersData, setSuppliersData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchesData, setBatchesData] = useState([]);
  const [itemsData, setItemsData] = useState([]);
  const [allSuppliersList, setAllSuppliersList] = useState([]);
  const [allItemsList, setAllItemsList] = useState([]);

  const [confirmModal, setConfirmModal] = useState(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState("All");

  // Print filter states
  const [showPrintFilters, setShowPrintFilters] = useState(false);
  const [printFilters, setPrintFilters] = useState({
    status: "",
    name: "",
    itemId: "",
    itemName: "",
    supplierId: "",
    supplierName: "",
    dateFrom: "",
    dateTo: "",
  });

  const initialSupplier = {
    name: "",
    role: "",
    contact: "",
    phone: "",
    email: "",
    address: "",
    location: "",
    status: "Active",
    tinNumber: "",
    notes: "",
  };

  const handlePrintSuppliers = () => {
    const columns = ["Name", "Address", "Tin Number"];

    const tableData = suppliersData.map((s) => [
      s.name,
      s.address,
      s.tinNumber,
    ]);

    generateReport({
      title: "Suppliers Report",
      companyName: "Premiumed Enterprises",
      columns,
      data: tableData,
      filename: "Suppliers-Report.pdf",
      logo,
    });
  };

  // New function for filtered printing
  const handlePrintWithFilters = () => {
    let dataToPrint = [];
    let columns = [];
    let title = "";

    if (activeTab === "suppliers") {
      // Filter suppliers data
      let filteredSuppliers = [...suppliersData];

      if (printFilters.status && printFilters.status !== "All") {
        filteredSuppliers = filteredSuppliers.filter(
          (s) => s.status === printFilters.status,
        );
      }

      if (printFilters.supplierName) {
        filteredSuppliers = filteredSuppliers.filter((s) =>
          s.name
            .toLowerCase()
            .includes(printFilters.supplierName.toLowerCase()),
        );
      }

      if (filteredSuppliers.length === 0) {
        toast.error("No suppliers found matching the selected filters");
        return;
      }

      columns = [
        "Supplier ID",
        "Supplier Name",
        "Contact Person",
        "Status",
        "Address",
        "Phone",
        "Email",
      ];
      title = "Suppliers Report";

      dataToPrint = filteredSuppliers.map((s) => [
        (s.id || s._id).toString().slice(-7),
        s.name,
        s.contactPerson || s.contact || "N/A",
        s.status,
        s.address || "N/A",
        s.phone || "N/A",
        s.email || "N/A",
      ]);

      // Create filter description
      let filterDescription = "Filtered Suppliers List";
      const filterConditions = [];
      if (printFilters.status && printFilters.status !== "All")
        filterConditions.push(`Status: ${printFilters.status}`);
      if (printFilters.supplierName)
        filterConditions.push(`Name contains: ${printFilters.supplierName}`);
      if (filterConditions.length > 0) {
        filterDescription += ` (${filterConditions.join(", ")})`;
      }

      generateSupplyFilteredReport({
        title: "Supply Report",
        sectionTitle: filterDescription,
        companyName: "PREMIUMED ENTERPRISES",
        companyAddress:
          "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
        ceo: "ROSE ANN P. ORTIZ - Prop",
        vatReg: "VAT REG. TIN: 000-000-000",
        landlineNum: "(044) 812-2280",
        columns,
        data: dataToPrint,
        logo,
        reportType: "suppliers",
        filename: `Supplier Information.pdf`,
      });
      toast.success(
        `Generated Supplier Information Report with ${dataToPrint.length} records`,
      );
    } else {
      // Filter batches data
      let filteredBatches = [...batchesData];

      console.log("Total batches:", filteredBatches.length);
      console.log("Print filters:", printFilters);

      // Filter by supplier - check multiple possible fields
      if (printFilters.supplierId) {
        filteredBatches = filteredBatches.filter((b) => {
          // Check various possible supplier field names
          const batchSupplierId =
            b.supplier?._id || b.supplierId || b.supplier?.id;
          const batchSupplierName = (
            b.supplier?.name ||
            b.supplierName ||
            ""
          ).toLowerCase();
          const selectedSupplier = allSuppliersList.find(
            (s) => s.id === printFilters.supplierId,
          );
          const selectedSupplierName =
            selectedSupplier?.name?.toLowerCase() || "";

          return (
            batchSupplierId === printFilters.supplierId ||
            batchSupplierName === selectedSupplierName
          );
        });
        console.log("After supplier filter:", filteredBatches.length);
      }

      // Filter by item - check multiple possible fields
      if (printFilters.itemId) {
        filteredBatches = filteredBatches.filter((b) => {
          // Check various possible item field names
          const batchItemId = b.itemCode?._id || b.itemId || b.itemCode?.id;
          const batchItemName = (
            b.itemName ||
            b.itemCode?.name ||
            ""
          ).toLowerCase();
          const selectedItem = allItemsList.find(
            (i) => i.id === printFilters.itemId,
          );
          const selectedItemName = selectedItem?.name?.toLowerCase() || "";

          return (
            batchItemId === printFilters.itemId ||
            batchItemName === selectedItemName
          );
        });
      }

      // Filter by status
      if (printFilters.status && printFilters.status !== "All") {
        filteredBatches = filteredBatches.filter((b) => {
          const batchStatus = (b.status || "pending").toLowerCase();
          return batchStatus === printFilters.status.toLowerCase();
        });
      }

      // Filter by date range
      if (printFilters.dateFrom || printFilters.dateTo) {
        filteredBatches = filteredBatches.filter((b) => {
          const batchDate = b.createdAt ? new Date(b.createdAt) : null;
          if (!batchDate) return true;

          if (
            printFilters.dateFrom &&
            new Date(printFilters.dateFrom) > batchDate
          )
            return false;
          if (printFilters.dateTo) {
            const endDate = new Date(printFilters.dateTo);
            endDate.setHours(23, 59, 59, 999);
            if (endDate < batchDate) return false;
          }
          return true;
        });
      }

      if (filteredBatches.length === 0) {
        toast.error("No purchase records found matching the selected filters");
        return;
      }

      columns = [
        "Batch Number",
        "Item Name",
        "Supplier Name",
        "Status",
        "Location",
        "Quantity",
        "Expiration Date",
      ];
      title = "Purchase Batches Report";

      dataToPrint = filteredBatches.map((batch) => [
        batch.batchCode || "N/A",
        batch.itemName || "N/A",
        batch.supplier?.name || batch.supplierName || "N/A",
        batch.status || "Pending",
        batch.storageLocation || "N/A",
        batch.quantity || "N/A",
        batch.expirationDate
          ? new Date(batch.expirationDate).toLocaleDateString()
          : "N/A",
      ]);

      // Create filter description
      let filterDescription = "Filtered Purchase Batches List";
      const filterConditions = [];
      if (printFilters.supplierName)
        filterConditions.push(`Supplier: ${printFilters.supplierName}`);
      if (printFilters.itemName)
        filterConditions.push(`Item: ${printFilters.itemName}`);
      if (printFilters.status && printFilters.status !== "All")
        filterConditions.push(`Status: ${printFilters.status}`);
      if (printFilters.dateFrom)
        filterConditions.push(
          `From: ${new Date(printFilters.dateFrom).toLocaleDateString()}`,
        );
      if (printFilters.dateTo)
        filterConditions.push(
          `To: ${new Date(printFilters.dateTo).toLocaleDateString()}`,
        );
      if (filterConditions.length > 0) {
        filterDescription += ` (${filterConditions.join(", ")})`;
      }

      generateSupplyFilteredReport({
        title: "Supply Report",
        sectionTitle: filterDescription,
        companyName: "PREMIUMED ENTERPRISES",
        companyAddress:
          "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
        ceo: "ROSE ANN P. ORTIZ - Prop",
        vatReg: "VAT REG. TIN: 000-000-000",
        landlineNum: "(044) 812-2280",
        columns,
        data: dataToPrint,
        reportType: "purchase",
        logo,
        filename: `Supply Information.pdf`,
      });

      toast.success(
        `Generated Supply Purchase report with ${dataToPrint.length} records`,
      );
    }

    setShowPrintFilters(false);
    // Reset filters
    setPrintFilters({
      status: "",
      name: "",
      itemId: "",
      itemName: "",
      supplierId: "",
      supplierName: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const handlePrintFilterChange = (field, value) => {
    setPrintFilters((prev) => ({ ...prev, [field]: value }));
  };

  const [newSupplier, setNewSupplier] = useState(initialSupplier);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  useEffect(() => {
    fetchSuppliers();
    fetchBatches();
    fetchItems();
    fetchAllSuppliers();
    fetchAllItems();
  }, []);

  // Reset filter when changing tabs
  useEffect(() => {
    setStatusFilter("All");
    setPrintFilters({
      status: "",
      name: "",
      itemId: "",
      itemName: "",
      supplierId: "",
      supplierName: "",
      dateFrom: "",
      dateTo: "",
    });
  }, [activeTab]);

  const fetchSuppliers = async () => {
    try {
      const res = await axios.get(API_URL);
      setSuppliersData(res.data);
    } catch (err) {
      console.error("Fetch error", err);
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await axios.get(BATCH_API);
      setBatchesData(res.data);
    } catch (err) {
      console.error("Batch Fetch error", err);
    }
  };

  const fetchItems = async () => {
    try {
      const res = await axios.get(ITEMS_API);
      const items = Array.isArray(res.data) ? res.data : res.data.items || [];
      setItemsData(items);
    } catch (err) {
      console.error("Items Fetch error", err);
      setItemsData([]);
    }
  };

  const fetchAllSuppliers = async () => {
    try {
      const res = await axios.get(API_URL);
      // Create a unique list of all suppliers for the dropdown
      const uniqueSuppliers = [];
      const supplierMap = new Map();

      res.data.forEach((supplier) => {
        if (supplier.name && !supplierMap.has(supplier.name)) {
          supplierMap.set(supplier.name, {
            id: supplier._id || supplier.id,
            name: supplier.name,
          });
          uniqueSuppliers.push({
            id: supplier._id || supplier.id,
            name: supplier.name,
          });
        }
      });

      setAllSuppliersList(uniqueSuppliers);
    } catch (err) {
      console.error("Fetch all suppliers error", err);
      // Fallback: extract from batches if suppliers API fails
      if (batchesData.length > 0) {
        const uniqueFromBatches = [];
        const batchSupplierMap = new Map();

        batchesData.forEach((batch) => {
          const supplierName = batch.supplier?.name || batch.supplierName;
          if (supplierName && !batchSupplierMap.has(supplierName)) {
            batchSupplierMap.set(supplierName, {
              id:
                batch.supplier?._id ||
                batch.supplierId ||
                `supplier_${uniqueFromBatches.length}`,
              name: supplierName,
            });
            uniqueFromBatches.push({
              id:
                batch.supplier?._id ||
                batch.supplierId ||
                `supplier_${uniqueFromBatches.length}`,
              name: supplierName,
            });
          }
        });

        setAllSuppliersList(uniqueFromBatches);
      }
    }
  };

  const fetchAllItems = async () => {
    try {
      const res = await axios.get(ITEMS_API);
      const items = Array.isArray(res.data) ? res.data : res.data.items || [];

      // Create a unique list of all items for the dropdown
      const uniqueItems = [];
      const itemMap = new Map();

      items.forEach((item) => {
        const itemName = item.name || item.itemName;
        if (itemName && !itemMap.has(itemName)) {
          itemMap.set(itemName, {
            id: item._id || item.id,
            name: itemName,
          });
          uniqueItems.push({
            id: item._id || item.id,
            name: itemName,
          });
        }
      });

      setAllItemsList(uniqueItems);
    } catch (err) {
      console.error("Fetch all items error, using batches data", err);
      // Fallback: extract from batches if items API fails
      if (batchesData.length > 0) {
        const uniqueFromBatches = [];
        const batchItemMap = new Map();

        batchesData.forEach((batch) => {
          const itemName = batch.itemName;
          if (itemName && !batchItemMap.has(itemName)) {
            batchItemMap.set(itemName, {
              id:
                batch.itemCode?._id ||
                batch.itemId ||
                `item_${uniqueFromBatches.length}`,
              name: itemName,
            });
            uniqueFromBatches.push({
              id:
                batch.itemCode?._id ||
                batch.itemId ||
                `item_${uniqueFromBatches.length}`,
              name: itemName,
            });
          }
        });

        setAllItemsList(uniqueFromBatches);
      }
    }
  };

  const handleSaveSupplier = async () => {
    const dataToSave = isEditing ? selectedSupplier : newSupplier;
    if (!dataToSave.name || !dataToSave.contact) {
      return toast.error("Please fill in Supplier Name and Contact Person.");
    }
    try {
      const actorHeaders = {
        "X-Username": localStorage.getItem("username") || "",
        "X-User-Id": localStorage.getItem("userId") || "",
        "X-Role": localStorage.getItem("role") || "Admin",
      };

      if (isEditing) {
        await axios.put(
          `${API_URL}/${selectedSupplier.id || selectedSupplier._id}`,
          selectedSupplier,
          { headers: actorHeaders },
        );
        toast.success("Supplier updated successfully!");
      } else {
        await axios.post(API_URL, newSupplier, { headers: actorHeaders });
        toast.success("New supplier added!");
      }
      fetchSuppliers();
      fetchAllSuppliers(); // Refresh the suppliers dropdown
      closeModal();
    } catch (err) {
      toast.error(err.response?.data?.error || "Error saving data");
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    try {
      await axios.patch(
        `${API_URL}/${id}`,
        { status: newStatus },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );
      fetchSuppliers();
      toast.success(
        `Supplier ${newStatus === "Active" ? "activated" : "deactivated"} successfully!`,
      );
    } catch (err) {
      console.error("Status update error", err);
      toast.error("Failed to update status.");
    }
  };

  const openStatusConfirmation = (supplier) => {
    const action = supplier.status === "Active" ? "deactivate" : "activate";

    setConfirmModal({
      supplier,
      action,
    });
  };

  const closeStatusConfirmation = () => {
    setConfirmModal(null);
  };

  const handleConfirmedStatusChange = async () => {
    if (!confirmModal?.supplier) return;

    const { supplier } = confirmModal;

    closeStatusConfirmation();

    await handleToggleStatus(supplier._id || supplier.id, supplier.status);
  };

  const closeModal = () => {
    setActiveModal(null);
    setNewSupplier(initialSupplier);
    setSelectedSupplier(null);
    setIsEditing(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewSupplier((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setSelectedSupplier((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} autoClose={3000} />
      <div className="info-container">
        <div className="info-tabs">
          <button
            className={`tab-btn ${activeTab === "purchases" ? "active" : ""}`}
            onClick={() => setActiveTab("purchases")}
          >
            SUPPLY PURCHASES
          </button>
          <div className="tab-separator">|</div>
          <button
            className={`tab-btn ${activeTab === "suppliers" ? "active" : ""}`}
            onClick={() => setActiveTab("suppliers")}
          >
            SUPPLIER'S INFORMATION
          </button>
        </div>

        <div className="info-search-wrapper suppliers">
          <div className="search-input-container suppliers">
            <FaSearch className="search-icon-gold" />
            <input
              type="text"
              placeholder={
                activeTab === "suppliers"
                  ? "Search Supplier Name..."
                  : "Search Batch Number or Item Name..."
              }
              className="info-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {activeTab === "suppliers" && (
            <>
              <button
                className="add-supplier-btn"
                onClick={() => setActiveModal("add-supplier")}
              >
                <FaPlusCircle className="add-supplier-icon" /> ADD NEW SUPPLIER
              </button>
              <button
                className="print-supplier-btn"
                onClick={() => setShowPrintFilters(true)}
              >
                <FaPrint className="print-supplier-icon" /> PRINT REPORTS
              </button>
            </>
          )}
          {activeTab === "purchases" && (
            <button
              className="print-supplier-btn"
              onClick={() => setShowPrintFilters(true)}
            >
              <FaPrint className="print-supplier-icon" /> PRINT REPORTS
            </button>
          )}
        </div>

        <div className="info-card suppliers-table">
          <div className="filters-select-container">
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Status</option>
              {activeTab === "suppliers" ? (
                <>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </>
              ) : (
                <>
                  <option value="pending">Pending</option>
                  <option value="stored">Stored</option>
                  <option value="for disposal">For Disposal</option>
                  <option value="disposed">Disposed</option>
                </>
              )}
            </select>
          </div>

          <div className="suppliers-table-wrapper">
            <table className="info-table">
              <thead className="fixed-table-row">
                {activeTab === "suppliers" ? (
                  <tr>
                    <th>SUPPLIER ID</th>
                    <th>SUPPLIER NAME</th>
                    <th>CONTACT PERSON</th>
                    <th>STATUS</th>
                    <th className="action-header supplier-info">ACTION</th>
                  </tr>
                ) : (
                  <tr>
                    <th>BATCH NUMBER</th>
                    <th>SUPPLIER NAME</th>
                    <th>ITEM NAME</th>
                    <th>STATUS</th>
                    <th className="action-header purchase">ACTION</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeTab === "suppliers" ? (
                  suppliersData.filter((s) => {
                    const matchesSearch = s.name
                      .toLowerCase()
                      .includes(searchTerm.toLowerCase());
                    const matchesFilter =
                      statusFilter === "All" || s.status === statusFilter;
                    return matchesSearch && matchesFilter;
                  }).length > 0 ? (
                    suppliersData
                      .filter((s) => {
                        const matchesSearch = s.name
                          .toLowerCase()
                          .includes(searchTerm.toLowerCase());
                        const matchesFilter =
                          statusFilter === "All" || s.status === statusFilter;
                        return matchesSearch && matchesFilter;
                      })
                      .map((item) => (
                        <tr key={item._id || item.id}>
                          <td>{(item.id || item._id).toString().slice(-7)}</td>
                          <td className="font-bold">{item.name}</td>
                          <td>{item.contactPerson || item.contact}</td>
                          <td>
                            <span
                              className={`status-capsule status-${item.status.replace(/\s+/g, "-").toLowerCase()}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="action-buttons">
                            <button
                              className="view-profile-btn"
                              onClick={() => {
                                setSelectedSupplier(item);
                                setActiveModal("supplier");
                              }}
                            >
                              VIEW
                            </button>
                            <button
                              className={`deact-btn ${
                                item.status !== "Active" ? "activate-mode" : ""
                              }`}
                              onClick={() => openStatusConfirmation(item)}
                            >
                              {item.status === "Active"
                                ? "Deactivate"
                                : "Activate"}
                            </button>
                          </td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="empty-order-cell">
                        <EmptyState
                          title={
                            searchTerm || statusFilter !== "All"
                              ? "No matching suppliers"
                              : "No suppliers yet"
                          }
                          message={
                            searchTerm || statusFilter !== "All"
                              ? "We couldn't find any suppliers that match your current search or filters."
                              : "Supplier records will appear here once they are added to the system."
                          }
                          buttonText={
                            searchTerm || statusFilter !== "All"
                              ? "Clear Search & Filters"
                              : undefined
                          }
                          onButtonClick={
                            searchTerm || statusFilter !== "All"
                              ? () => {
                                  setSearchTerm("");
                                  setStatusFilter("All");
                                }
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  )
                ) : batchesData.filter((b) => {
                    const searchLower = searchTerm.toLowerCase();
                    const matchesSearch =
                      b.batchCode?.toLowerCase().includes(searchLower) ||
                      (b.itemName || "").toLowerCase().includes(searchLower) ||
                      (b.itemCode?.name || "")
                        .toLowerCase()
                        .includes(searchLower) ||
                      (b.itemCode || "").toLowerCase().includes(searchLower);

                    const matchesFilter =
                      statusFilter === "All" ||
                      b.status?.toLowerCase() === statusFilter.toLowerCase();

                    return matchesSearch && matchesFilter;
                  }).length > 0 ? (
                  batchesData
                    .filter((b) => {
                      const searchLower = searchTerm.toLowerCase();
                      const matchesSearch =
                        b.batchCode?.toLowerCase().includes(searchLower) ||
                        (b.itemName || "")
                          .toLowerCase()
                          .includes(searchLower) ||
                        (b.itemCode?.name || "")
                          .toLowerCase()
                          .includes(searchLower) ||
                        (b.itemCode || "").toLowerCase().includes(searchLower);

                      const matchesFilter =
                        statusFilter === "All" ||
                        b.status?.toLowerCase() === statusFilter.toLowerCase();

                      return matchesSearch && matchesFilter;
                    })
                    .map((batch) => (
                      <tr key={batch._id}>
                        <td className="font-bold">{batch.batchCode}</td>
                        <td>
                          {batch.supplier?.name ||
                            batch.supplierName ||
                            "Supplier A"}
                        </td>
                        <td>{batch.itemName || "N/A"}</td>
                        <td>
                          <span
                            className={`status-capsule status-${batch.status?.toLowerCase() || "pending"}`}
                          >
                            {batch.status || "Pending"}
                          </span>
                        </td>
                        <td className="action-buttons">
                          <button
                            className="view-profile-btn"
                            onClick={() => {
                              setSelectedBatch(batch);
                              setActiveModal("view-batch");
                            }}
                          >
                            VIEW
                          </button>
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-order-cell">
                      <EmptyState
                        title={
                          searchTerm || statusFilter !== "All"
                            ? "No matching purchases"
                            : "No purchases yet"
                        }
                        message={
                          searchTerm || statusFilter !== "All"
                            ? "We couldn't find any purchase records that match your current search or filters."
                            : "Supply purchase batches will appear here once inventory is received."
                        }
                        buttonText={
                          searchTerm || statusFilter !== "All"
                            ? "Clear Search & Filters"
                            : undefined
                        }
                        onButtonClick={
                          searchTerm || statusFilter !== "All"
                            ? () => {
                                setSearchTerm("");
                                setStatusFilter("All");
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

        {confirmModal && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal-card">
              <div
                className="confirm-modal-icon"
                style={{
                  color:
                    confirmModal.action === "deactivate"
                      ? "#ff3131"
                      : "#22a06b",
                }}
              >
                {confirmModal.action === "deactivate" ? (
                  <FaUserTimes />
                ) : (
                  <FaUserCheck />
                )}
              </div>

              <h3 className="confirm-modal-title">
                {confirmModal.action === "deactivate"
                  ? "Deactivate Supplier?"
                  : "Activate Supplier?"}
              </h3>

              <p className="confirm-modal-message">
                {confirmModal.action === "deactivate" ? (
                  <>
                    The account of <strong>{confirmModal.supplier.name}</strong>{" "}
                    will be deactivated and they will no longer be able to
                    access the system.
                  </>
                ) : (
                  <>
                    The account of <strong>{confirmModal.supplier.name}</strong>{" "}
                    will be activated and they will regain access to the system.
                  </>
                )}
              </p>

              <div className="confirm-modal-footer">
                <button
                  className="confirm-modal-btn confirm-modal-btn-cancel"
                  onClick={closeStatusConfirmation}
                >
                  Cancel
                </button>

                <button
                  className="confirm-modal-btn confirm-modal-btn-confirm"
                  onClick={handleConfirmedStatusChange}
                  style={{
                    background:
                      confirmModal.action === "activate"
                        ? "#22a06b"
                        : "#ff3131",
                    borderColor:
                      confirmModal.action === "activate"
                        ? "#22a06b"
                        : "#ff3131",
                  }}
                >
                  {confirmModal.action === "deactivate"
                    ? "Deactivate"
                    : "Activate"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Print Filters Modal */}
        {showPrintFilters && (
          <div className="filters-modal-overlay">
            <div className="filter-modal-container">
              <div className="filters-modal-header">
                <h3>
                  Filter Report -{" "}
                  {activeTab === "suppliers" ? "Suppliers" : "Purchase Batches"}
                </h3>
                <FaTimes
                  className="filters-close-icon"
                  onClick={() => setShowPrintFilters(false)}
                />
              </div>
              <div className="filters-modal-body">
                <div className="modal-section-grid">
                  {activeTab === "purchases" && (
                    <>
                      <div className="field-group">
                        <label className="field-label">
                          Filter by Supplier
                        </label>
                        <select
                          className="field-box filter-select"
                          value={printFilters.supplierId}
                          onChange={(e) => {
                            const selectedSupplier = allSuppliersList.find(
                              (s) => s.id === e.target.value,
                            );
                            handlePrintFilterChange(
                              "supplierId",
                              e.target.value,
                            );
                            handlePrintFilterChange(
                              "supplierName",
                              selectedSupplier?.name || "",
                            );
                          }}
                        >
                          <option value="">All Suppliers</option>
                          {allSuppliersList.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field-group">
                        <label className="field-label">
                          Filter by Supply Name
                        </label>
                        <select
                          className="field-box filter-select"
                          value={printFilters.itemId}
                          onChange={(e) => {
                            const selectedItem = allItemsList.find(
                              (i) => i.id === e.target.value,
                            );
                            handlePrintFilterChange("itemId", e.target.value);
                            handlePrintFilterChange(
                              "itemName",
                              selectedItem?.name || "",
                            );
                          }}
                          style={{ width: "100%", padding: "8px" }}
                        >
                          <option value="">All Items</option>
                          {allItemsList.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {activeTab === "suppliers" && (
                    <div className="field-group">
                      <label className="field-label">
                        Filter by Supplier Name
                      </label>
                      <select
                        className="field-box filter-select"
                        value={printFilters.supplierName}
                        onChange={(e) =>
                          handlePrintFilterChange(
                            "supplierName",
                            e.target.value,
                          )
                        }
                      >
                        <option value="">All Suppliers</option>
                        {allSuppliersList.map((supplier) => (
                          <option key={supplier.id} value={supplier.name}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="field-group">
                    <label className="field-label">Filter by Status</label>
                    <select
                      className="field-box filter-select"
                      value={printFilters.status}
                      onChange={(e) =>
                        handlePrintFilterChange("status", e.target.value)
                      }
                    >
                      <option value="">All Statuses</option>
                      {activeTab === "suppliers" ? (
                        <>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </>
                      ) : (
                        <>
                          <option value="pending">Pending</option>
                          <option value="stored">Stored</option>
                        </>
                      )}
                    </select>
                  </div>

                  {activeTab === "purchases" && (
                    <>
                      <div className="field-group">
                        <label className="field-label">Date From</label>
                        <input
                          type="date"
                          className="field-box"
                          value={printFilters.dateFrom}
                          onChange={(e) =>
                            handlePrintFilterChange("dateFrom", e.target.value)
                          }
                        />
                      </div>

                      <div className="field-group">
                        <label className="field-label">Date To</label>
                        <input
                          type="date"
                          className="field-box"
                          value={printFilters.dateTo}
                          onChange={(e) =>
                            handlePrintFilterChange("dateTo", e.target.value)
                          }
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="modal-action-footer">
                  <button
                    className="btn-cancel"
                    onClick={() => setShowPrintFilters(false)}
                  >
                    CANCEL
                  </button>
                  <button
                    className="btn-approve"
                    onClick={handlePrintWithFilters}
                  >
                    GENERATE REPORT
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: VIEW BATCH DETAILS */}
        {activeModal === "view-batch" && selectedBatch && (
          <div className="supplier-profile-modal-overlay">
            <div className="supplier-profile-modal-container">
              <div className="supplier-profile-modal-header">
                <h3>BATCH DETAILS</h3>
                <FaTimes
                  className="supplier-profile-close-icon"
                  onClick={closeModal}
                />
              </div>
              <div className="supplier-profile-modal-body">
                <div className="modal-section-grid">
                  <div className="detail-group full title">
                    <h4>Batch Information</h4>
                  </div>
                  <DetailItem
                    label="Batch Code"
                    value={selectedBatch.batchCode}
                  />
                  <DetailItem
                    label="Supply Name"
                    value={selectedBatch.itemName}
                  />
                  <DetailItem
                    label="Status"
                    value={selectedBatch.status || "Pending"}
                  />
                  <DetailItem
                    label="Location"
                    value={selectedBatch.storageLocation}
                  />
                  <DetailItem
                    label="Date Received"
                    value={
                      selectedBatch.createdAt
                        ? new Date(selectedBatch.createdAt).toLocaleDateString()
                        : "N/A"
                    }
                  />
                  <DetailItem label="Quantity" value={selectedBatch.quantity} />
                  <div className="detail-group full title">
                    <h4>Supplier Source</h4>
                  </div>
                  <DetailItem
                    label="Supplier"
                    value={selectedBatch.supplierName}
                    fullWidth
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD SUPPLIER */}
        {activeModal === "add-supplier" && (
          <div className="supplier-profile-modal-overlay">
            <div className="supplier-profile-modal-container">
              <div className="supplier-profile-modal-header">
                <h3>ADD NEW SUPPLIER</h3>
                <FaTimes
                  className="supplier-profile-close-icon"
                  onClick={closeModal}
                />
              </div>
              <div className="supplier-profile-modal-body">
                <div className="modal-section-grid">
                  <div className="detail-group full title">
                    <h4>Supplier Information</h4>
                  </div>
                  <InputItem
                    label="Supplier Name"
                    name="name"
                    value={newSupplier.name}
                    onChange={handleInputChange}
                  />
                  <InputItem
                    label="Role"
                    name="role"
                    value={newSupplier.role}
                    onChange={handleInputChange}
                  />

                  <div className="detail-group full title">
                    <h4>Contact & Location</h4>
                  </div>
                  <InputItem
                    label="Contact Person"
                    name="contact"
                    value={newSupplier.contact}
                    onChange={handleInputChange}
                  />
                  <InputItem
                    label="Phone"
                    name="phone"
                    value={newSupplier.phone}
                    onChange={handleInputChange}
                  />
                  <InputItem
                    label="Email"
                    name="email"
                    value={newSupplier.email}
                    onChange={handleInputChange}
                  />
                  <InputItem
                    label="Address"
                    name="address"
                    value={newSupplier.address}
                    onChange={handleInputChange}
                  />
                  <InputItem
                    label="Location"
                    name="location"
                    value={newSupplier.location}
                    onChange={handleInputChange}
                  />

                  <div className="detail-group full title">
                    <h4>Status & Tin Number</h4>
                  </div>
                  <InputItem
                    label="Status"
                    name="status"
                    value={newSupplier.status}
                    onChange={handleInputChange}
                  />
                  <InputItem
                    label="Tin Number"
                    name="tinNumber"
                    value={newSupplier.tinNumber}
                    onChange={handleInputChange}
                  />

                  <div className="detail-group full title">
                    <h4>Notes</h4>
                  </div>
                  <InputItem
                    // label="Notes"
                    name="notes"
                    className="supplierNote"
                    value={newSupplier.notes}
                    onChange={handleInputChange}
                    fullWidth
                  />
                </div>
              </div>
              <div className="supplier-modal-footer">
                <button className="purchase-btn" onClick={handleSaveSupplier}>
                  SAVE SUPPLIER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: SUPPLIER PROFILE */}
        {activeModal === "supplier" && selectedSupplier && (
          <div className="supplier-profile-modal-overlay">
            <div className="supplier-profile-modal-container">
              <div className="supplier-profile-modal-header">
                <h3>SUPPLIER PROFILE</h3>
                <FaTimes
                  className="supplier-profile-close-icon"
                  onClick={closeModal}
                />
              </div>
              <div className="supplier-profile-modal-body">
                <div className="modal-section-grid">
                  <div className="detail-group full title">
                    <h4>Supplier Information</h4>
                  </div>
                  <DetailItem
                    label="Supplier ID"
                    value={(selectedSupplier.id || selectedSupplier._id)
                      .toString()
                      .slice(-6)}
                  />
                  {isEditing ? (
                    <InputItem
                      label="Supplier Name"
                      name="name"
                      value={selectedSupplier.name}
                      onChange={handleEditChange}
                    />
                  ) : (
                    <DetailItem
                      label="Supplier Name"
                      value={selectedSupplier.name}
                    />
                  )}
                  {isEditing ? (
                    <>
                      <InputItem
                        label="Role"
                        name="role"
                        value={selectedSupplier.role}
                        onChange={handleEditChange}
                      />
                      <InputItem
                        label="Address"
                        name="address"
                        value={selectedSupplier.address}
                        onChange={handleEditChange}
                      />
                    </>
                  ) : (
                    <>
                      <DetailItem label="Role" value={selectedSupplier.role} />
                      <DetailItem
                        label="Address"
                        value={selectedSupplier.address}
                      />
                    </>
                  )}
                  <div className="detail-group full title">
                    <h4>Contact Person</h4>
                  </div>
                  {isEditing ? (
                    <>
                      <InputItem
                        label="Name"
                        name="contact"
                        value={selectedSupplier.contact}
                        onChange={handleEditChange}
                      />
                      <InputItem
                        label="Phone"
                        name="phone"
                        value={selectedSupplier.phone}
                        onChange={handleEditChange}
                      />
                      <InputItem
                        label="Email"
                        name="email"
                        value={selectedSupplier.email}
                        onChange={handleEditChange}
                      />
                      <InputItem
                        label="Location"
                        name="location"
                        value={selectedSupplier.location}
                        onChange={handleEditChange}
                      />
                    </>
                  ) : (
                    <>
                      <DetailItem
                        label="Contact Person"
                        value={selectedSupplier.contact}
                      />
                      <DetailItem
                        label="Phone"
                        value={selectedSupplier.phone}
                      />
                      <DetailItem
                        label="Email"
                        value={selectedSupplier.email}
                      />
                      <DetailItem
                        label="Location"
                        value={selectedSupplier.location}
                      />
                    </>
                  )}
                  <div className="detail-group full title">
                    <h4>Notes</h4>
                  </div>
                  {isEditing ? (
                    <InputItem
                      // label="Notes"
                      name="notes"
                      className="supplierNote"
                      value={selectedSupplier.notes}
                      onChange={handleEditChange}
                      fullWidth
                    />
                  ) : (
                    <DetailItem
                      // label="Notes"
                      className="supplierNote"
                      value={selectedSupplier.notes}
                      fullWidth
                    />
                  )}
                </div>
                <div className="supplier-modal-footer">
                  {isEditing ? (
                    <button
                      className="view-profile-btn"
                      onClick={handleSaveSupplier}
                    >
                      <FaSave /> SAVE CHANGES
                    </button>
                  ) : (
                    <button
                      className="view-profile-btn"
                      onClick={() => setIsEditing(true)}
                    >
                      <FaEdit /> EDIT PROFILE
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const InputItem = ({ label, name, value, onChange, fullWidth }) => (
  <div className={`field-group ${fullWidth ? "full-width" : ""}`}>
    <label className="field-label">{label}</label>
    <input
      type="text"
      name={name}
      className="field-box"
      value={value}
      onChange={onChange}
    />
  </div>
);

const DetailItem = ({ label, value, fullWidth, className = "" }) => (
  <div className={`field-group ${fullWidth ? "full-width" : ""} ${className}`}>
    <label className="field-label">{label}</label>
    <div className="field-box">{value || "N/A"}</div>
  </div>
);

export default SuppliersInformation;
