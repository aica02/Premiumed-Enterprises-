import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import "../styles/WarehouseMap.css";
import "../styles/capsules.css";
import "../styles/Modals.css";
import { Toaster, toast } from "react-hot-toast";
import { FaTimes } from "react-icons/fa";
import { warehouseMapLayout } from "../../../mobile/shared/warehouseMapLayout";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const WarehouseMap = () => {
  const { tables, pallets, labels, lines, racks } = warehouseMapLayout;

  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState("nearExpiry");
  const [selectedRack, setSelectedRack] = useState(null);
  const [selectedLocationDetails, setSelectedLocationDetails] = useState(null);

  const NEAR_EXPIRY_DAYS = 30;

  const fetchInventory = async () => {
    try {
      const response = await axios.get(
        `${BACKEND_URL}/api/inventoryPage/stored`,
      );
      setItems(response.data);
    } catch (error) {
      console.error("Error fetching stored inventory:", error);
      toast.error("Failed to fetch stored inventory items.");
    }
  };

  useEffect(() => {
    Promise.resolve().then(fetchInventory);
  }, []);

  const getStockStatus = (totalQuantity, reorderLevel) => {
    if (totalQuantity === 0) return { label: "Out of Stock" };
    if (totalQuantity <= reorderLevel) return { label: "Low Stock" };
    return { label: "Available" };
  };

  const getFefoStatus = (expirationDate) => {
    if (!expirationDate) return { label: "Safe", className: "safe" };

    const diffDays = Math.ceil(
      (new Date(expirationDate) - new Date()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays <= 0) return { label: "Expired", className: "expired" };
    if (diffDays <= NEAR_EXPIRY_DAYS)
      return { label: "Near Expiry", className: "near" };
    return { label: "Safe", className: "safe" };
  };

  const openLocationModal = (locationId, locationType) => {
    const locationItems = items
      .map((item) => ({
        item,
        batches: (item.batches || []).filter(
          (batch) =>
            batch.storageLocation === locationId &&
            batch.status !== "disposed" &&
            Number(batch.quantity) > 0,
        ),
      }))
      .filter(({ batches }) => batches.length > 0);

    setSelectedLocationDetails({
      locationId,
      locationType,
      items: locationItems,
    });
  };

  const nearExpiryData = useMemo(() => {
    return items
      .flatMap((item) =>
        (item.batches || [])
          .filter((batch) => batch.status !== "disposed")
          .map((batch) => ({
            itemName: item.name,
            batchCode: batch.batchCode,
            rack: batch.storageLocation,
            expirationDate: batch.expirationDate,
            storageLocation: batch.storageLocation,
            status: batch.status,
            daysLeft: Math.ceil(
              (new Date(batch.expirationDate) - new Date()) /
                (1000 * 60 * 60 * 24),
            ),
          })),
      )
      .filter((b) => b.daysLeft <= NEAR_EXPIRY_DAYS);
  }, [items]);

  const lowStockData = useMemo(() => {
    const productMap = new Map();

    items.forEach((item) => {
      let totalQuantity = 0;
      const batchDetails = [];

      (item.batches || []).forEach((batch) => {
        if (batch.status !== "disposed" && batch.quantity > 0) {
          totalQuantity += batch.quantity || 0;
          batchDetails.push({
            batchCode: batch.batchCode,
            rack: batch.storageLocation,
            quantity: batch.quantity,
            expirationDate: batch.expirationDate,
          });
        }
      });

      if (totalQuantity > 0) {
        productMap.set(item.itemCode || item._id, {
          itemName: item.name,
          itemCode: item.itemCode,
          totalQuantity: totalQuantity,
          reorderLevel: item.reorderLevel || 50,
          batches: batchDetails,
          racks: [...new Set(batchDetails.map((b) => b.rack))],
        });
      }
    });

    const lowStockProducts = [];
    productMap.forEach((product) => {
      const stockStatus = getStockStatus(
        product.totalQuantity,
        product.reorderLevel,
      );

      if (stockStatus.label === "Low Stock") {
        product.batches.forEach((batch) => {
          lowStockProducts.push({
            itemName: product.itemName,
            batchCode: batch.batchCode,
            rack: batch.rack,
            quantity: batch.quantity,
            totalQuantity: product.totalQuantity,
            reorderLevel: product.reorderLevel,
            stockStatus: stockStatus.label,
            expirationDate: batch.expirationDate,
          });
        });
      }
    });

    return lowStockProducts;
  }, [items]);

  const computeDynamicStatus = (rackId, items) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let hasLowStock = false;
    let hasNearExpiry = false;
    let hasAnyBatch = false;
    const storedItemNames = new Set();

    items.forEach((item) => {
      let totalInRack = 0;
      let hasBatchInRack = false;

      (item.batches || []).forEach((batch) => {
        if (
          batch.storageLocation !== rackId ||
          batch.status === "disposed" ||
          batch.quantity <= 0
        )
          return;

        hasBatchInRack = true;
        hasAnyBatch = true;
        totalInRack += batch.quantity || 0;
        storedItemNames.add(item.name);

        const expDate = new Date(batch.expirationDate);
        expDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

        // niremove ko  && batch.FEFOstatus !== "Safe"
        if (daysLeft <= NEAR_EXPIRY_DAYS) {
          hasNearExpiry = true;
        }
      });

      if (hasBatchInRack) {
        const reorderLevel = Number(item.reorderLevel) || 50;
        if (totalInRack <= reorderLevel) {
          hasLowStock = true;
        }
      }
    });

    if (!hasAnyBatch) return "no-items";
    if (hasNearExpiry) return "nearExpiry";
    if (hasLowStock) return "lowStock";
    return "good";
  };

  const getLocationTooltip = (locationId, locationType) => {
    const locationItems = items.filter((item) =>
      (item.batches || []).some(
        (batch) =>
          batch.storageLocation === locationId &&
          batch.status !== "disposed" &&
          Number(batch.quantity) > 0,
      ),
    );
    const itemNames =
      locationItems.length > 0
        ? locationItems.map((item) => item.name).join(", ")
        : "None";
    const totalQuantity = locationItems.reduce(
      (total, item) =>
        total +
        (item.batches || [])
          .filter(
            (batch) =>
              batch.storageLocation === locationId &&
              batch.status !== "disposed" &&
              Number(batch.quantity) > 0,
          )
          .reduce(
            (itemTotal, batch) => itemTotal + (Number(batch.quantity) || 0),
            0,
          ),
      0,
    );

    const statusLabels = {
      nearExpiry: "Near Expiry / Expired",
      lowStock: "Low Stock",
      good: "Good Stock",
      "no-items": "Empty",
    };
    const batchStatuses = new Set();

    items.forEach((item) => {
      const locationBatches = (item.batches || []).filter(
        (batch) =>
          batch.storageLocation === locationId && batch.status !== "disposed",
      );
      if (locationBatches.length === 0) return;

      const totalSupplyQuantity = (item.batches || [])
        .filter((batch) => batch.status !== "disposed")
        .reduce((total, batch) => total + (Number(batch.quantity) || 0), 0);
      const reorderLevel = Number(item.reorderLevel) || 50;

      if (totalSupplyQuantity > 0 && totalSupplyQuantity <= reorderLevel) {
        batchStatuses.add("lowStock");
      } else if (totalSupplyQuantity > reorderLevel) {
        batchStatuses.add("good");
      }

      locationBatches.forEach((batch) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expirationDate = new Date(batch.expirationDate);
        expirationDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil(
          (expirationDate - today) / (1000 * 60 * 60 * 24),
        );
        if (daysLeft <= NEAR_EXPIRY_DAYS) batchStatuses.add("nearExpiry");
      });
    });

    const statuses =
      batchStatuses.size > 0
        ? [...batchStatuses].map((status) => statusLabels[status]).join(", ")
        : "Empty";

    return `${locationType} ID: ${locationId}\nStatuses: ${statuses}\nSupply: ${itemNames}\nTotal Quantity: ${totalQuantity}`;
  };

  return (
    <div className="warehouse-container">
      <Toaster position="top-center" />
      <div className="warehouse-main">
        <div className="warehouse-grid-section">
          <div className="warehouse-floor-plan">
            <div className="warehouse-area-outline receiving-area-outline"></div>
            <div className="warehouse-area-outline disposal-area-outline"></div>
            <div className="warehouse-area-outline dispatch-area-outline"></div>
            {tables.map((table) => (
              <div
                key={table.id}
                className="warehouse-table-object"
                style={{
                  top: table.top,
                  left: table.left,
                  width: table.width,
                  height: table.height,
                  position: "absolute",
                }}
              />
            ))}
            {pallets.map((pallet) => {
              const dynamicStatus = computeDynamicStatus(pallet.id, items);
              const tooltipText = getLocationTooltip(pallet.id, "Pallet");

              return (
                <div
                  key={pallet.id}
                  className={`warehouse-pallet ${dynamicStatus}`}
                  title={tooltipText}
                  role="button"
                  tabIndex={0}
                  aria-label={`View batches stored at pallet ${pallet.id}`}
                  onClick={() => openLocationModal(pallet.id, "Pallet")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openLocationModal(pallet.id, "Pallet");
                    }
                  }}
                  style={{
                    top: pallet.top,
                    left: pallet.left,
                    width: pallet.width,
                    height: pallet.height,
                  }}
                >
                  <span className="rack-label">{pallet.id}</span>
                </div>
              );
            })}

            {labels.map((label) => (
              <div
                key={label.id}
                className="warehouse-label"
                style={{
                  top: label.top,
                  left: label.left,
                  position: "absolute",
                }}
              >
                {label.text}
              </div>
            ))}

            {lines.map((line) => (
              <div
                key={line.id}
                className="floor-line"
                style={{
                  top: line.top,
                  left: line.left,
                  width: line.width,
                  height: line.height,
                  transform: line.rotate ? `rotate(${line.rotate})` : "none",
                  transformOrigin: "top left",
                  zIndex: 1,
                }}
              />
            ))}

            {racks.map((rack) => {
              const isSelected = selectedRack && selectedRack === rack.id;
              const dynamicStatus = computeDynamicStatus(rack.id, items);
              const tooltipText = getLocationTooltip(rack.id, "Rack");

              return (
                <div
                  title={tooltipText}
                  key={rack.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openLocationModal(rack.id, "Rack")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openLocationModal(rack.id, "Rack");
                    }
                  }}
                  className={`rack ${rack.className || ""} ${
                    selectedRack
                      ? isSelected
                        ? dynamicStatus
                        : "no-items"
                      : dynamicStatus
                  }`}
                  style={{
                    top: rack.top,
                    left: rack.left,
                    width: rack.width,
                    height: rack.height,
                    zIndex: 2,
                  }}
                >
                  <span className="rack-label">{rack.id}</span>
                </div>
              );
            })}
          </div>

          <div className="warehouse-legend">
            <div className="legend-item">
              <span className="dot good"></span> Good Stock
            </div>
            <div className="legend-item">
              <span className="dot nearExpiry"></span> Near Expiry/Expired
            </div>
            <div className="legend-item">
              <span className="dot lowStock"></span> Low Stock
            </div>
            <div className="legend-item">
              <span className="dot no-items"></span> No Items
            </div>
          </div>
        </div>

        <div className="monitoring-section">
          <div className="warehouse-monitoring">
            <div className="alert-tabs">
              <button
                className={`tab-btn ${activeTab === "nearExpiry" ? "active" : ""}`}
                onClick={() => setActiveTab("nearExpiry")}
              >
                Near Expiry/Expired
              </button>

              <div className="tab-separator">|</div>

              <button
                className={`tab-btn ${activeTab === "lowStock" ? "active" : ""}`}
                onClick={() => setActiveTab("lowStock")}
              >
                Low Stock
              </button>
            </div>

            <div className="warehouse-table-wrapper">
              <table className="warehouse-table">
                <thead className="table-header">
                  <tr>
                    <th>Item Name</th>
                    <th>Batch</th>
                    <th className="location-column">Location</th>

                    {activeTab === "nearExpiry" ? (
                      <>
                        <th>Expiry Date</th>
                        <th>Days Left</th>
                      </>
                    ) : (
                      <>
                        <th>Quantity</th>
                        <th>Stock Status</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {activeTab === "nearExpiry" &&
                    nearExpiryData.map((item, index) => (
                      <tr
                        key={index}
                        onClick={() =>
                          setSelectedRack((prev) =>
                            prev === item.rack ? null : item.rack,
                          )
                        }
                      >
                        <td>{item.itemName}</td>
                        <td>{item.batchCode}</td>
                        <td>{item.rack}</td>
                        <td>
                          {new Date(item.expirationDate).toLocaleDateString()}
                        </td>
                        <td>
                          {item.status === "for disposal" ? (
                            <span className="badge for-disposal">
                              For Disposal
                            </span>
                          ) : item.daysLeft <= 0 ? (
                            <span className="badge expired">Expired</span>
                          ) : (
                            `${item.daysLeft} days`
                          )}
                        </td>
                      </tr>
                    ))}

                  {activeTab === "lowStock" &&
                    lowStockData.map((item, index) => (
                      <tr
                        key={index}
                        onClick={() =>
                          setSelectedRack((prev) =>
                            prev === item.rack ? null : item.rack,
                          )
                        }
                      >
                        <td>{item.itemName}</td>
                        <td>{item.batchCode}</td>
                        <td>{item.rack}</td>
                        <td>{item.quantity}</td>
                        <td>
                          <span className="badge low">{item.stockStatus}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {selectedLocationDetails && (
        <div
          className="inventory-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedLocationDetails(null);
            }
          }}
        >
          <div className="batch-modal-container warehouse-rack-modal">
            <div className="batch-modal-header">
              <div>
                <h3>
                  {selectedLocationDetails.items.length > 0
                    ? selectedLocationDetails.items
                        .map(({ item }) => item.name)
                        .join(", ")
                    : `${selectedLocationDetails.locationType} ${selectedLocationDetails.locationId}`}
                </h3>
                <p className="warehouse-rack-modal-subtitle">
                  {selectedLocationDetails.items
                    .map(({ item }) => item.category)
                    .filter(Boolean)
                    .filter(
                      (category, index, categories) =>
                        categories.indexOf(category) === index,
                    )
                    .join(", ") || "No category"}
                </p>
              </div>
              <FaTimes
                className="batch-close-icon"
                onClick={() => setSelectedLocationDetails(null)}
              />
            </div>
            <div className="batch-modal-body">
              {/* {(() => {
                const rackQuantity = selectedLocationDetails.items.reduce(
                  (total, { batches }) =>
                    total +
                    batches.reduce(
                      (batchTotal, batch) =>
                        batchTotal + (Number(batch.quantity) || 0),
                      0,
                    ),
                  0,
                );
                const rackCapacity = 1000;
                const meterStatus =
                  rackQuantity >= rackCapacity ? "available" : "low";

                return (
                  <div className="warehouse-rack-quantity-meter">
                    <div className="warehouse-rack-meter-label">
                      <span>Rack Quantity</span>
                      <strong>
                        {rackQuantity} / {rackCapacity} units
                      </strong>
                    </div>
                    <meter
                      className={`warehouse-rack-meter ${meterStatus}`}
                      min="0"
                      max={rackCapacity}
                      value={Math.min(rackQuantity, rackCapacity)}
                    />
                    <div className="warehouse-rack-meter-caption">
                      Current quantity: {rackQuantity} units | Capacity:{" "}
                      {rackCapacity} units
                    </div>
                  </div>
                );
              })()} */}
              <div className="order-items-table-container warehouse-rack-table-container">
                <table className="order-items-table warehouse-rack-table">
                  <thead>
                    <tr>
                      <th>Batch Code</th>
                      <th>Quantity</th>
                      <th>FEFO Status</th>
                      <th>Stock Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLocationDetails.items.flatMap(
                      ({ item, batches }) =>
                        batches.map((batch) => {
                          const fefo = getFefoStatus(batch.expirationDate);
                          const quantityStock = getStockStatus(
                            Number(batch.quantity) || 0,
                            Number(item.reorderLevel) || 50,
                          );
                          const stock =
                            batch.status === "for disposal"
                              ? {
                                  label: "For Disposal",
                                  className: "for-disposal",
                                }
                              : {
                                  ...quantityStock,
                                  className: quantityStock.label
                                    .replace(/\s+/g, "-")
                                    .toLowerCase(),
                                };

                          return (
                            <tr key={`${item.itemCode}-${batch.batchCode}`}>
                              <td>{batch.batchCode}</td>
                              <td>{batch.quantity}</td>
                              <td>
                                <span
                                  className={`status-capsule status-${fefo.className}`}
                                >
                                  {fefo.label}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`status-capsule status-${stock.className}`}
                                >
                                  {stock.label}
                                </span>
                              </td>
                            </tr>
                          );
                        }),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseMap;
