import { useState, useEffect } from "react";
import "../styles/Inventory.css";
import "../styles/InformationLayout.css";
import "../styles/Modals.css";
import "../styles/capsules.css";
import "../styles/ConfirmModal.css";
import { FaPrint, FaSearch, FaTimes, FaTrashAlt } from "react-icons/fa";
import { FaPesoSign } from "react-icons/fa6";
import { IoIosArrowDown } from "react-icons/io";
import axios from "axios";
import { Toaster, toast } from "react-hot-toast";
import logo from "../assets/Premiumed logo.png";
import { generateInventoryReport } from "../utils/pdf/reportEngine";
import { CATEGORIES } from "../components/Categories";
import EmptyState from "../components/EmptyState";
import PricingModal from "../components/PricingModal";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("A-Z");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterLocation, setFilterLocation] = useState("All");
  const [filterStock, setFilterStock] = useState("All");
  const [filterFefoMain, setFilterFefoMain] = useState("All");
  const [filterStockStatusMain, setFilterStockStatusMain] = useState("All");
  const [filterItemCode, setFilterItemCode] = useState("All");
  const [filterBatchCode, setFilterBatchCode] = useState("All");
  const [showDisposedItems, setShowDisposedItems] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [batchToDispose, setBatchToDispose] = useState(null);
  const [isDisposing, setIsDisposing] = useState(false);

  const getFefoStatus = (expirationDate) => {
    if (!expirationDate) return { label: "Safe", className: "safe" };

    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return { label: "Expired", className: "expired" };
    if (diffDays <= 30) return { label: "Near Expiry", className: "near" };
    return { label: "Safe", className: "safe" };
  };

  const getStockStatus = (quantity, reorderLevel = 50) => {
    if (quantity === 0) return { label: "Out of Stock", className: "expired" };
    if (quantity <= reorderLevel)
      return { label: "Low Stock", className: "low" };
    return { label: "Available", className: "available" };
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/inventoryPage`);
      setItems(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) {
      console.error("Backend unreachable");
    }
  };

  const handleDispose = async () => {
    if (!batchToDispose) return;

    setIsDisposing(true);
    try {
      await axios.put(
        `${BACKEND_URL}/api/putaway/disposeBatch`,
        {
          batchNumber: batchToDispose.batch.batchCode,
        },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );

      await fetchItems();
      setShowConfirmModal(false);
      setShowModal(false);
      setBatchToDispose(null);
      toast.success("Batch successfully moved to Disposal!");
    } catch (err) {
      toast.error("Failed to move the batch to Disposal. Please try again.");
    } finally {
      setIsDisposing(false);
    }
  };

  const openConfirmModal = (batchData) => {
    setBatchToDispose(batchData);
    setShowConfirmModal(true);
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setBatchToDispose(null);
  };

  const uniqueItemCodes = [...new Set(items.map((item) => item.itemCode))]
    .filter(Boolean)
    .sort();

  const availableBatchCodes = items
    .filter(
      (item) => filterItemCode === "All" || item.itemCode === filterItemCode,
    )
    .flatMap((item) => (item.batches || []).map((batch) => batch.batchCode))
    .filter(Boolean);

  const uniqueBatchCodes = [...new Set(availableBatchCodes)].sort();

  const FEFO_PRIORITY = {
    EXPIRED: 100,
    "NEAR EXPIRY": 200,
    SAFE: 300,
  };

  const STOCK_PRIORITY = {
    EXPIRED_AVAILABLE: 1,
    "EXPIRED_FOR DISPOSAL": 2,
    "EXPIRED_LOW STOCK": 3,

    "NEAR EXPIRY_FOR DISPOSAL": 1,
    "NEAR EXPIRY_AVAILABLE": 2,
    "NEAR EXPIRY_LOW STOCK": 3,

    "SAFE_LOW STOCK": 1,
    SAFE_AVAILABLE: 2,
  };

  const getPriority = (row) => {
    const fefo = getFefoStatus(row.batch?.expirationDate)?.label;

    // Get the stock status from the batch status first
    let stockLabel;
    if (
      row.batch?.status === "disposed" ||
      row.batch?.status === "for disposal"
    ) {
      stockLabel =
        row.batch.status === "for disposal" ? "FOR DISPOSAL" : "DISPOSED";
    } else {
      stockLabel = getStockStatus(
        row.batch?.quantity,
        row.item?.reorderLevel,
      )?.label;
    }

    let cleanFefo = (fefo || "").trim().toUpperCase();
    let cleanStock = (stockLabel || "").trim().toUpperCase();

    if (cleanStock === "OUT OF STOCK") {
      cleanStock = "LOW STOCK";
    }

    if (cleanFefo === "NEAR EXP") {
      cleanFefo = "NEAR EXPIRY";
    }

    // Calculate scores separately
    const fefoScore = FEFO_PRIORITY[cleanFefo] ?? 900;
    const stockScore = STOCK_PRIORITY[`${cleanFefo}_${cleanStock}`] ?? 99;

    return fefoScore + stockScore;
  };

  const filteredRows = items
    .filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .filter(
      (item) => filterCategory === "All" || item.category === filterCategory,
    )
    .filter(
      (item) => filterItemCode === "All" || item.itemCode === filterItemCode,
    )
    .flatMap((item) =>
      (item.batches || [])
        .filter(
          (batch) =>
            filterBatchCode === "All" || batch.batchCode === filterBatchCode,
        )
        .filter((batch) => {
          if (showDisposedItems) {
            return batch.status === "disposed";
          } else {
            return (
              (batch.status === "for disposal" || batch.status === "stored") &&
              batch.quantity > 0
            );
          }
        })
        .filter(
          (batch) =>
            filterLocation === "All" ||
            batch.storageLocation === filterLocation,
        )
        .filter((batch) => {
          if (filterFefoMain === "All") return true;
          return getFefoStatus(batch.expirationDate).label === filterFefoMain;
        })
        .filter((batch) => {
          if (filterStockStatusMain === "All") return true;
          if (filterStockStatusMain === "For Disposal")
            return batch.status === "for disposal";
          if (filterStockStatusMain === "LowStock") {
            const status = getStockStatus(
              batch.quantity,
              batch.reorderLevel || 50,
            ).label;
            return (
              status === "Low Stock" &&
              batch.status !== "for disposal" &&
              batch.status !== "Available"
            );
          }
          if (filterStockStatusMain === "Available") {
            const status = getStockStatus(
              batch.quantity,
              batch.reorderLevel || 50,
            ).label;
            return (
              status === "Available" &&
              status !== "Low Stock" &&
              batch.status !== "for disposal"
            );
          }
          return true;
        })
        .map((batch) => ({ item, batch })),
    )
    .sort((a, b) => {
      if (a.batch.status === "disposed" && b.batch.status !== "disposed")
        return 1;
      if (a.batch.status !== "disposed" && b.batch.status === "disposed")
        return -1;

      const priorityA = getPriority(a);
      const priorityB = getPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      if (sortOrder === "A-Z") {
        return a.item.name.localeCompare(b.item.name);
      }
      if (sortOrder === "Z-A") {
        return b.item.name.localeCompare(a.item.name);
      }

      if (filterStock === "high-low") {
        return b.batch.quantity - a.batch.quantity;
      }
      if (filterStock === "low-high") {
        return a.batch.quantity - b.batch.quantity;
      }

      const dateA = a.batch.expirationDate
        ? new Date(a.batch.expirationDate)
        : new Date(9999, 11, 31);
      const dateB = b.batch.expirationDate
        ? new Date(b.batch.expirationDate)
        : new Date(9999, 11, 31);
      return dateA - dateB;
    });

  const handlePrint = (type) => {
    let rowsToPrint;
    if (type === "disposed") {
      rowsToPrint = items.flatMap((item) =>
        (item.batches || [])
          .filter(
            (batch) =>
              batch.status === "disposed" || batch.status === "for disposal",
          )
          .map((batch) => ({
            item,
            batch,
          })),
      );
    } else {
      rowsToPrint = filteredRows;
    }

    const uniqueRows = Array.from(
      new Map(
        rowsToPrint.map(({ item, batch }) => [
          `${item._id || item.itemCode}-${batch._id || batch.batchCode}`,
          { item, batch },
        ]),
      ).values(),
    );

    const columns =
      type === "disposed"
        ? [
            "Supply Name",
            "Unit Type",
            "Category",
            "Qty",
            "Location",
            "Expiration Date",
            "FEFO Status",
            "Price",
          ]
        : [
            "Supply Name",
            "Unit Type",
            "Category",
            "Qty",
            "Location",
            "Expiration Date",
            "FEFO Status",
            "Stock Status",
          ];

    const tableData = uniqueRows.map(({ item, batch }) => {
      const expiration = batch.expirationDate
        ? new Date(batch.expirationDate).toLocaleDateString()
        : "N/A";

      const unitType = batch.unitType || item.unitType || "N/A";
      const fefo = getFefoStatus(batch.expirationDate);

      if (type === "disposed") {
        const price = Number(item.price || 0);

        return [
          item.name,
          unitType,
          item.category,
          batch.quantity,
          batch.storageLocation || "N/A",
          expiration,
          fefo.label,
          price.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        ];
      }

      // FULL INVENTORY
      const stock = getStockStatus(batch.quantity, item.reorderLevel);

      return [
        item.name,
        unitType,
        item.category,
        batch.quantity,
        batch.storageLocation || "N/A",
        expiration,
        fefo.label,
        stock.label,
      ];
    });

    const totalInventoryValue = uniqueRows.reduce(
      (sum, { item, batch }) =>
        sum + Number(item.price || 0) * Number(batch.quantity || 0),
      0,
    );

    generateInventoryReport({
      title:
        type === "disposed"
          ? "Disposed Inventory Report"
          : "Full Inventory Report",
      sectionTitle:
        type === "disposed" ? "Disposed Inventory List" : "Full Inventory List",
      companyName: "PREMIUMED ENTERPRISES",
      companyAddress:
        "52 Purok 1 Taal 3000 City of Malolos (Capital), Bulacan Philippines",
      ceo: "ROSE ANN P. ORTIZ - Prop",
      vatReg: "VAT REG. TIN: 275-357-338-00000",
      landlineNum: "(044) 812-2280",
      columns,
      data: tableData,
      type,
      totalValue: totalInventoryValue,
      logo,
      filename:
        type === "disposed"
          ? "Disposed-Inventory-Report.pdf"
          : "Full-Inventory-Report.pdf",
    });
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} autoClose={3000} />
      <div className="inventory-page">
        <div className="inventory-header">
          <div className="search-box">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by Item Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            className="btn-pricing"
            onClick={() => setShowPricingModal(true)}
          >
            <FaPesoSign className="peso-icon" />
            Set Supply Prices
          </button>

          <PricingModal
            open={showPricingModal}
            onClose={() => setShowPricingModal(false)}
            items={items}
            fetchItems={fetchItems}
          />

          <div className="print-button">
            <button
              className="btn-print"
              onClick={() => setShowPrintMenu(!showPrintMenu)}
            >
              <FaPrint className="print-icon" />
              Print Reports
              <IoIosArrowDown
                className={`arrow-down-icon ${showPrintMenu ? "rotate" : ""}`}
              />
            </button>

            {showPrintMenu && (
              <div className="print-dropdown">
                <button onClick={() => handlePrint("all")}>
                  Print All Items
                </button>
                <button onClick={() => handlePrint("disposed")}>
                  Print Disposed Items
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="info-card inventory-table">
          <div className="inventory-table-wrapper">
            <table className="inventory-table">
              <thead className="fixed-table-row">
                <tr>
                  <th className="ItemName">
                    <select
                      className="filters-select"
                      value={sortOrder}
                      onChange={(e) => {
                        setSortOrder(e.target.value);
                        setFilterStock("All");
                      }}
                    >
                      <option value="All" disabled hidden>
                        Item Name
                      </option>
                      <option value="A-Z">A → Z</option>
                      <option value="Z-A">Z → A</option>
                    </select>
                  </th>
                  <th className="BatchNumber">
                    <select
                      className="filters-select"
                      value={filterBatchCode}
                      onChange={(e) => setFilterBatchCode(e.target.value)}
                    >
                      <option value="All">All Batch Codes</option>
                      {uniqueBatchCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="Category">
                    <select
                      className="filters-select"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="All">All Categories</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="Quantity">
                    <select
                      className="filters-select"
                      value={filterStock}
                      onChange={(e) => {
                        setFilterStock(e.target.value);
                        setSortOrder("All");
                      }}
                    >
                      <option value="All">Quantity</option>
                      <option value="high-low">High → Low</option>
                      <option value="low-high">Low → High</option>
                    </select>
                  </th>
                  <th className="FEFOStatus">
                    <select
                      className="filters-select"
                      value={filterFefoMain}
                      onChange={(e) => setFilterFefoMain(e.target.value)}
                    >
                      <option value="All">All FEFO</option>
                      <option value="Near Expiry">Near Expiry</option>
                      <option value="Safe">Safe</option>
                      <option value="Expired">Expired</option>
                    </select>
                  </th>
                  <th className="StockStatus">
                    <select
                      className="filters-select"
                      value={filterStockStatusMain}
                      onChange={(e) => setFilterStockStatusMain(e.target.value)}
                    >
                      <option value="All">All Stock</option>
                      <option value="Available">Available</option>
                      <option value="LowStock">Low Stock</option>
                      <option value="For Disposal">For Disposal</option>
                    </select>
                  </th>
                  <th>
                    <button
                      className={`toggle-disposed-btn ${showDisposedItems ? "active" : ""}`}
                      onClick={() => setShowDisposedItems(!showDisposedItems)}
                    >
                      <span>{showDisposedItems ? "Hide" : "Show"}</span>
                      <span>Disposed</span>
                      <span>Supplies</span>
                    </button>
                  </th>
                </tr>
                <tr className="table-header">
                  <th>Item Name</th>
                  <th className="column batch">Batch Code</th>
                  <th className="column category">Category</th>
                  <th>Quantity</th>
                  <th className="column FEFO">FEFO Status</th>
                  <th>Stock Status</th>
                  <th className="action-header">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length > 0 ? (
                  filteredRows.map(({ item, batch }, index) => {
                    const fefo = getFefoStatus(batch.expirationDate);
                    const stock =
                      batch.status === "disposed" ||
                      batch.status === "for disposal"
                        ? { label: batch.status, className: batch.status }
                        : getStockStatus(batch.quantity, item.reorderLevel);

                    return (
                      <tr
                        key={index}
                        className={
                          fefo.label === "Expired" ||
                          stock.label === "Low Stock" ||
                          fefo.label === "Near Expiry"
                            ? "row-priority-high"
                            : ""
                        }
                      >
                        <td>{item.name}</td>
                        <td>{batch.batchCode || "N/A"}</td>
                        <td>{item.category}</td>
                        <td>{batch.quantity}</td>
                        <td>
                          <span
                            className={`status-capsule status-${fefo.className.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            {fefo.label}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`status-capsule status-${stock.className.replace(/\s+/g, "-").toLowerCase()}`}
                          >
                            {stock.label}
                          </span>
                        </td>
                        <td>
                          <button
                            className="view-batch-btn"
                            onClick={() => {
                              setSelectedBatch({ item, batch });
                              setShowModal(true);
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="empty-inventory-cell">
                      <EmptyState
                        title={
                          searchTerm ||
                          filterCategory !== "All" ||
                          filterLocation !== "All" ||
                          filterStock !== "All" ||
                          filterFefoMain !== "All" ||
                          filterStockStatusMain !== "All" ||
                          filterItemCode !== "All" ||
                          filterBatchCode !== "All" ||
                          showDisposedItems
                            ? "No matching inventory"
                            : "No inventory yet"
                        }
                        message={
                          searchTerm ||
                          filterCategory !== "All" ||
                          filterLocation !== "All" ||
                          filterStock !== "All" ||
                          filterFefoMain !== "All" ||
                          filterStockStatusMain !== "All" ||
                          filterItemCode !== "All" ||
                          filterBatchCode !== "All" ||
                          showDisposedItems
                            ? "We couldn’t find any batches that match your current search and filters."
                            : "Inventory batches will appear here once stock is added to the system."
                        }
                        buttonText={
                          searchTerm ||
                          filterCategory !== "All" ||
                          filterLocation !== "All" ||
                          filterStock !== "All" ||
                          filterFefoMain !== "All" ||
                          filterStockStatusMain !== "All" ||
                          filterItemCode !== "All" ||
                          filterBatchCode !== "All" ||
                          showDisposedItems
                            ? "Clear Filters"
                            : undefined
                        }
                        onButtonClick={
                          searchTerm ||
                          filterCategory !== "All" ||
                          filterLocation !== "All" ||
                          filterStock !== "All" ||
                          filterFefoMain !== "All" ||
                          filterStockStatusMain !== "All" ||
                          filterItemCode !== "All" ||
                          filterBatchCode !== "All" ||
                          showDisposedItems
                            ? () => {
                                setSearchTerm("");
                                setFilterCategory("All");
                                setFilterLocation("All");
                                setFilterStock("All");
                                setFilterFefoMain("All");
                                setFilterStockStatusMain("All");
                                setFilterItemCode("All");
                                setFilterBatchCode("All");
                                setShowDisposedItems(false);
                                setSortOrder("A-Z");
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

        {/* Batch Details Modal */}
        {showModal && selectedBatch && (
          <div className="inventory-modal-overlay">
            <div className="batch-modal-container">
              <div className="batch-modal-header">
                <h3>Batch Details</h3>
                <FaTimes
                  className="batch-close-icon"
                  onClick={() => setShowModal(false)}
                />
              </div>
              <div className="batch-modal-body">
                <div className="modal-section-grid">
                  <div className="detail-group full title">
                    <h4>Supply Information</h4>
                  </div>
                  <DetailItem
                    label="Item Name"
                    value={selectedBatch.item?.name}
                  />
                  <DetailItem
                    label="Item Code"
                    value={selectedBatch.item?.itemCode || "N/A"}
                  />
                  <DetailItem
                    label="Batch Code"
                    value={selectedBatch.batch.batchCode}
                  />

                  <DetailItem
                    label="Category"
                    value={selectedBatch.item?.category}
                  />
                  <DetailItem
                    label="Unit Type"
                    value={
                      selectedBatch.batch.unitType ||
                      selectedBatch.item?.unitType ||
                      "N/A"
                    }
                  />

                  <DetailItem
                    label={
                      (selectedBatch.batch.unitType ||
                        selectedBatch.item?.unitType) === "Box"
                        ? "No. of Case"
                        : "No. of Box"
                    }
                    value={selectedBatch.batch?.box || "N/A"}
                  />

                  <DetailItem
                    label={`No. of ${
                      selectedBatch.batch.unitType ||
                      selectedBatch.item?.unitType ||
                      "N/A"
                    } per ${
                      (selectedBatch.batch.unitType ||
                        selectedBatch.item?.unitType) === "Box"
                        ? "Case"
                        : "Box"
                    }`}
                    value={selectedBatch.item?.quantityPerBox}
                  />

                  <DetailItem
                    label="Status"
                    value={selectedBatch.batch.status || "N/A"}
                    className="inventory-status-detail"
                  />

                  <div className="detail-group full title">
                    <h4>Warehouse Location</h4>
                  </div>
                  <DetailItem
                    label="Location"
                    value={selectedBatch.batch.storageLocation}
                  />

                  <div className="detail-group full title">
                    <h4>Status Information</h4>
                  </div>
                  <DetailItem
                    label="Expiration Date"
                    value={
                      selectedBatch.batch.expirationDate
                        ? new Date(
                            selectedBatch.batch.expirationDate,
                          ).toLocaleDateString()
                        : "N/A"
                    }
                  />
                  <DetailItem
                    label="FEFO Status"
                    value={
                      getFefoStatus(selectedBatch.batch.expirationDate)?.label
                    }
                  />
                  <DetailItem
                    label="Stock Status"
                    value={
                      selectedBatch.batch.status === "disposed"
                        ? "Disposed"
                        : getStockStatus(
                            selectedBatch.batch.quantity,
                            selectedBatch.item.reorderLevel,
                          )?.label
                    }
                  />
                  <DetailItem
                    label="Disposed Date"
                    value={
                      selectedBatch.batch.disposedDate
                        ? new Date(
                            selectedBatch.batch.disposedDate,
                          ).toLocaleDateString()
                        : "Not disposed yet"
                    }
                  />
                </div>
              </div>
              <div className="modal-action-footer">
                {selectedBatch.batch.status === "disposed" ? (
                  <span className="btn-dispose disabled">
                    BATCH ALREADY DISPOSED
                  </span>
                ) : selectedBatch.batch.status === "for disposal" ? (
                  <span className="btn-dispose disabled">
                    WAITING FOR DISPOSAL
                  </span>
                ) : (
                  <button
                    className="btn-dispose"
                    disabled={
                      !["Expired", "Near Expiry"].includes(
                        getFefoStatus(selectedBatch.batch.expirationDate).label,
                      )
                    }
                    onClick={() => openConfirmModal(selectedBatch)}
                  >
                    DISPOSE
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && batchToDispose && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal-card">
              <div className="confirm-modal-icon">
                <FaTrashAlt />
              </div>
              <h3 className="confirm-modal-title">Dispose Batch?</h3>

              <p className="confirm-modal-message">
                This batch will be permanently moved to disposal. This action
                cannot be undone.
              </p>

              <div className="confirm-modal-footer">
                <button
                  className="confirm-modal-btn confirm-modal-btn-cancel"
                  onClick={closeConfirmModal}
                  disabled={isDisposing}
                >
                  Cancel
                </button>

                <button
                  className="confirm-modal-btn confirm-modal-btn-confirm"
                  onClick={handleDispose}
                  disabled={isDisposing}
                >
                  {isDisposing ? "Processing..." : "Dispose"}
                </button>
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

export default Inventory;
