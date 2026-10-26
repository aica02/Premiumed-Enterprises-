import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import "../styles/WarehouseMap.css";
import "../styles/capsules.css";
import "../styles/Modals.css";
import { Toaster, toast } from "react-hot-toast";
import { FaChevronDown, FaChevronUp, FaEdit, FaTimes } from "react-icons/fa";
import EmptyState from "../components/EmptyState";
import { warehouseMapLayout } from "../../../mobile/shared/warehouseMapLayout";
import usePolling from "../hooks/usePolling";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" ? "http://localhost:5000" : "");

const WarehouseMap = () => {
  const { tables, pallets, labels, lines, racks } = warehouseMapLayout;
  const defaultLocations = [
    ...racks.map((rack) => ({
      ...rack,
      type: "rack",
      top: Number.parseFloat(rack.top),
      left: Number.parseFloat(rack.left),
      width: Number.parseFloat(rack.width),
      height: Number.parseFloat(rack.height),
    })),
    ...pallets.map((pallet) => ({
      ...pallet,
      type: "pallet",
      top: Number.parseFloat(pallet.top),
      left: Number.parseFloat(pallet.left),
      width: Number.parseFloat(pallet.width),
      height: Number.parseFloat(pallet.height),
    })),
  ];

  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState("nearExpiry");
  const [selectedRack, setSelectedRack] = useState(null);
  const [selectedLocationDetails, setSelectedLocationDetails] = useState(null);
  const [isWarehouseMapModalOpen, setIsWarehouseMapModalOpen] = useState(false);
  const [isAddLocationExpanded, setIsAddLocationExpanded] = useState(false);
  const [additionalLocations, setAdditionalLocations] =
    useState(defaultLocations);
  const [locationTypeFilter, setLocationTypeFilter] = useState("all");
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [removingLocationId, setRemovingLocationId] = useState(null);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [newLocation, setNewLocation] = useState({
    type: "rack",
    name: "",
    x: "40",
    y: "80",
    width: "7.1",
    height: "5.1",
  });

  const sortedFilteredLocations = useMemo(
    () =>
      additionalLocations
        .filter(
          (location) =>
            locationTypeFilter === "all" ||
            location.type === locationTypeFilter,
        )
        .sort((left, right) =>
          left.id.localeCompare(right.id, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
    [additionalLocations, locationTypeFilter],
  );

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
  usePolling(fetchInventory);

  useEffect(() => {
    axios
      .get(`${BACKEND_URL}/api/warehouse-map/layout?version=2`)
      .then((response) => {
        if (!Array.isArray(response.data.locations)) {
          throw new Error("Invalid warehouse map layout response.");
        }
        setAdditionalLocations(response.data.locations);
      })
      .catch((error) => {
        console.error("Error fetching warehouse map additions:", error);
        toast.error("Failed to load added warehouse locations.");
      });
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
          .filter(
            (batch) =>
              batch.status !== "disposed" && Number(batch.quantity) > 0,
          )
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
    return items.flatMap((item) =>
      (item.batches || [])
        .filter((batch) => {
          const quantity = Number(batch.quantity) || 0;
          const reorderLevel = Number(item.reorderLevel) || 50;

          return (
            batch.status !== "disposed" &&
            quantity > 0 &&
            getStockStatus(quantity, reorderLevel).label === "Low Stock"
          );
        })
        .map((batch) => ({
          itemName: item.name,
          batchCode: batch.batchCode,
          rack: batch.storageLocation,
          quantity: Number(batch.quantity) || 0,
          stockStatus: "Low Stock",
        })),
    );
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
          batch.storageLocation === locationId &&
          batch.status !== "disposed" &&
          Number(batch.quantity) > 0,
      );
      if (locationBatches.length === 0) return;

      const reorderLevel = Number(item.reorderLevel) || 50;

      locationBatches.forEach((batch) => {
        if (batch.expirationDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expirationDate = new Date(batch.expirationDate);

          if (!Number.isNaN(expirationDate.getTime())) {
            expirationDate.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil(
              (expirationDate - today) / (1000 * 60 * 60 * 24),
            );

            if (daysLeft <= NEAR_EXPIRY_DAYS) {
              batchStatuses.add("nearExpiry");
              return;
            }
          }
        }

        const quantity = Number(batch.quantity) || 0;
        batchStatuses.add(quantity <= reorderLevel ? "lowStock" : "good");
      });
    });

    const statuses =
      batchStatuses.size > 0
        ? [...batchStatuses].map((status) => statusLabels[status]).join(", ")
        : "Empty";

    return `${locationType} ID: ${locationId}\nStatuses: ${statuses}\nSupply: ${itemNames}\nTotal Quantity: ${totalQuantity}`;
  };

  const handleAddLocation = async (event) => {
    event.preventDefault();

    if (editingLocationId) {
      await handleUpdateLocation();
      return;
    }

    const name = newLocation.name.trim();
    const existingNames = additionalLocations.map((location) =>
      location.id.toLowerCase(),
    );
    if (!name) {
      toast.error("Enter a name for the new location.");
      return;
    }
    if (existingNames.includes(name.toLowerCase())) {
      toast.error("A rack or pallet with that name already exists.");
      return;
    }

    const top = Number(newLocation.y);
    const left = Number(newLocation.x);
    const width = Number(newLocation.width);
    const height = Number(newLocation.height);
    if (
      ![top, left, width, height].every(Number.isFinite) ||
      top < 0 ||
      left < 0 ||
      width <= 0 ||
      height <= 0 ||
      top + height > 100 ||
      left + width > 100
    ) {
      toast.error("Position and size must fit within the warehouse map.");
      return;
    }

    setIsSavingLocation(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/warehouse-map/layout/locations`,
        {
          id: name,
          type: newLocation.type,
          top,
          left,
          width,
          height,
        },
      );
      setAdditionalLocations((locations) => [
        ...locations,
        response.data.location,
      ]);
      setNewLocation((location) => ({
        ...location,
        name: "",
        x: "",
        y: "",
      }));
      toast.success(`${response.data.location.id} added to the warehouse map.`);
    } catch (error) {
      console.error("Error adding warehouse map location:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to save the new warehouse location.",
      );
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleStartEditingLocation = (location) => {
    setEditingLocationId(location.id);
    setNewLocation({
      type: location.type,
      name: location.id,
      x: String(location.left),
      y: String(location.top),
      width: String(location.width),
      height: String(location.height),
    });
    setIsAddLocationExpanded(true);
  };

  const handleCancelEditingLocation = () => {
    setEditingLocationId(null);
    setNewLocation((location) => ({
      ...location,
      name: "",
      x: "",
      y: "",
      width: "5",
      height: "7",
    }));
  };

  const handleUpdateLocation = async () => {
    const top = Number(newLocation.y);
    const left = Number(newLocation.x);
    const width = Number(newLocation.width);
    const height = Number(newLocation.height);
    if (
      ![top, left, width, height].every(Number.isFinite) ||
      top < 0 ||
      left < 0 ||
      width <= 0 ||
      height <= 0 ||
      top + height > 100 ||
      left + width > 100
    ) {
      toast.error("Position and size must fit within the warehouse map.");
      return;
    }

    setIsSavingLocation(true);
    try {
      const response = await axios.patch(
        `${BACKEND_URL}/api/warehouse-map/layout/locations`,
        { id: editingLocationId, top, left, width, height },
      );
      setAdditionalLocations((locations) =>
        locations.map((location) =>
          location.id === editingLocationId ? response.data.location : location,
        ),
      );
      toast.success(`${editingLocationId} updated.`);
      handleCancelEditingLocation();
    } catch (error) {
      console.error("Error updating warehouse map location:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to update the warehouse location.",
      );
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleRemoveLocation = async (location) => {
    setRemovingLocationId(location.id);
    try {
      await axios.delete(`${BACKEND_URL}/api/warehouse-map/layout/locations`, {
        data: { id: location.id },
      });
      setAdditionalLocations((locations) =>
        locations.filter((entry) => entry.id !== location.id),
      );
      if (editingLocationId === location.id) {
        handleCancelEditingLocation();
      }
      setSelectedRack((selected) =>
        selected === location.id ? null : selected,
      );
      setSelectedLocationDetails((details) =>
        details?.locationId === location.id ? null : details,
      );
      toast.success(`${location.id} removed from the warehouse map.`);
    } catch (error) {
      console.error("Error removing warehouse map location:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to remove the warehouse location.",
      );
    } finally {
      setRemovingLocationId(null);
    }
  };

  useEffect(() => {
    if (!isWarehouseMapModalOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsWarehouseMapModalOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isWarehouseMapModalOpen]);

  const getDraftLocation = () => {
    const values = [
      newLocation.x,
      newLocation.y,
      newLocation.width,
      newLocation.height,
    ];
    if (values.some((value) => String(value).trim() === "")) return null;

    const [left, top, width, height] = values.map(Number);
    if (
      ![left, top, width, height].every(Number.isFinite) ||
      left < 0 ||
      left > 100 ||
      top < 0 ||
      top > 100 ||
      width <= 0 ||
      width > 100 ||
      height <= 0 ||
      height > 100
    ) {
      return null;
    }

    return {
      id:
        editingLocationId ||
        newLocation.name.trim() ||
        `New ${newLocation.type}`,
      type: newLocation.type,
      top: `${top}%`,
      left: `${left}%`,
      width: `${width}%`,
      height: `${height}%`,
      isDraft: true,
    };
  };

  const renderWarehouseFloorPlan = (
    showEditButton = false,
    showDraftLocation = false,
  ) => (
    <div className="warehouse-floor-plan">
      {showEditButton && (
        <button
          type="button"
          className="warehouse-map-edit-button"
          aria-label="Edit warehouse map"
          onClick={() => setIsWarehouseMapModalOpen(true)}
        >
          <FaEdit aria-hidden="true" />
          <span className="warehouse-map-edit-label">Edit Warehouse Map</span>
        </button>
      )}
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
      {[
        ...additionalLocations
          .filter(
            (location) =>
              location.type === "pallet" && location.id !== editingLocationId,
          )
          .map((location) => ({
            ...location,
            top: `${location.top}%`,
            left: `${location.left}%`,
            width: `${location.width}%`,
            height: `${location.height}%`,
          })),
        ...(showDraftLocation && getDraftLocation()?.type === "pallet"
          ? [getDraftLocation()]
          : []),
      ].map((pallet) => {
        const isSelected = selectedRack === pallet.id;
        const dynamicStatus = computeDynamicStatus(pallet.id, items);
        const tooltipText = pallet.isDraft
          ? "Live preview of the new pallet"
          : getLocationTooltip(pallet.id, "Pallet");

        return (
          <div
            key={pallet.id}
            className={`warehouse-pallet ${
              pallet.isDraft ? "warehouse-location-draft" : ""
            } ${
              selectedRack
                ? isSelected
                  ? dynamicStatus
                  : "no-items"
                : dynamicStatus
            }`}
            title={tooltipText}
            role={pallet.isDraft ? undefined : "button"}
            tabIndex={pallet.isDraft ? undefined : 0}
            aria-label={
              pallet.isDraft
                ? "Live preview of the new pallet"
                : `View batches stored at pallet ${pallet.id}`
            }
            aria-hidden={pallet.isDraft || undefined}
            onClick={
              pallet.isDraft
                ? undefined
                : () => openLocationModal(pallet.id, "Pallet")
            }
            onKeyDown={
              pallet.isDraft
                ? undefined
                : (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openLocationModal(pallet.id, "Pallet");
                    }
                  }
            }
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

      {[
        ...additionalLocations
          .filter(
            (location) =>
              location.type === "rack" && location.id !== editingLocationId,
          )
          .map((location) => ({
            ...location,
            top: `${location.top}%`,
            left: `${location.left}%`,
            width: `${location.width}%`,
            height: `${location.height}%`,
            className: location.className || "custom-rack",
          })),
        ...(showDraftLocation && getDraftLocation()?.type === "rack"
          ? [getDraftLocation()]
          : []),
      ].map((rack) => {
        const isSelected = selectedRack && selectedRack === rack.id;
        const dynamicStatus = computeDynamicStatus(rack.id, items);
        const tooltipText = rack.isDraft
          ? "Live preview of the new rack"
          : getLocationTooltip(rack.id, "Rack");

        return (
          <div
            title={tooltipText}
            key={rack.id}
            role={rack.isDraft ? undefined : "button"}
            tabIndex={rack.isDraft ? undefined : 0}
            aria-label={
              rack.isDraft
                ? "Live preview of the new rack"
                : `View batches stored at rack ${rack.id}`
            }
            aria-hidden={rack.isDraft || undefined}
            onClick={
              rack.isDraft
                ? undefined
                : () => openLocationModal(rack.id, "Rack")
            }
            onKeyDown={
              rack.isDraft
                ? undefined
                : (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openLocationModal(rack.id, "Rack");
                    }
                  }
            }
            className={`rack ${rack.className || ""} ${
              rack.isDraft ? "warehouse-location-draft" : ""
            } ${
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
  );

  return (
    <div className="warehouse-container">
      <Toaster position="top-center" />
      <div className="warehouse-main">
        <div className="warehouse-grid-section">
          {renderWarehouseFloorPlan(true)}

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

                  {activeTab === "nearExpiry" &&
                    nearExpiryData.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState
                            title="No near-expiry or expired batches"
                            message="There are no batches expiring within 30 days or past their expiration date."
                          />
                        </td>
                      </tr>
                    )}

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
                  {activeTab === "lowStock" && lowStockData.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState
                          title="No low-stock batches"
                          message="There are no batches at or below their item's reorder level."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {isWarehouseMapModalOpen && (
        <div
          className="warehouse-map-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsWarehouseMapModalOpen(false);
            }
          }}
        >
          <section
            className="warehouse-map-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="warehouse-map-modal-title"
          >
            <header className="warehouse-map-modal-header">
              <div>
                <h2 id="warehouse-map-modal-title">Warehouse Map</h2>
                <p>
                  Manage racks and pallets without changing the rest of the
                  floor plan.
                </p>
              </div>
              <button
                type="button"
                className="warehouse-map-modal-close"
                aria-label="Close warehouse map"
                onClick={() => setIsWarehouseMapModalOpen(false)}
              >
                <FaTimes aria-hidden="true" />
              </button>
            </header>
            <div className="warehouse-map-modal-content">
              <div className="warehouse-map-sidebar">
                <form
                  className={`warehouse-map-editor ${
                    isAddLocationExpanded ? "is-expanded" : "is-collapsed"
                  }`}
                  onSubmit={handleAddLocation}
                >
                  <div className="warehouse-map-editor-heading">
                    <h3>
                      {editingLocationId ? "Edit location" : "Add a location"}
                    </h3>
                    <button
                      type="button"
                      className="warehouse-map-editor-toggle"
                      aria-label={
                        isAddLocationExpanded
                          ? "Collapse add location"
                          : "Expand add location"
                      }
                      aria-expanded={isAddLocationExpanded}
                      aria-controls="warehouse-map-editor-fields"
                      onClick={() =>
                        setIsAddLocationExpanded((expanded) => !expanded)
                      }
                    >
                      {isAddLocationExpanded ? (
                        <FaChevronUp aria-hidden="true" />
                      ) : (
                        <FaChevronDown aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {isAddLocationExpanded && (
                    <div
                      className="warehouse-map-editor-fields-wrapper"
                      id="warehouse-map-editor-fields"
                    >
                      <label className="warehouse-map-editor-name">
                        Rack/pallet name
                        <input
                          type="text"
                          maxLength="64"
                          required
                          disabled={Boolean(editingLocationId)}
                          placeholder="e.g. R6-A or P6-A"
                          value={newLocation.name}
                          onChange={(event) =>
                            setNewLocation((location) => ({
                              ...location,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="warehouse-map-editor-type">
                        Location type
                        <select
                          disabled={Boolean(editingLocationId)}
                          value={newLocation.type}
                          onChange={(event) =>
                            setNewLocation((location) => ({
                              ...location,
                              type: event.target.value,
                            }))
                          }
                        >
                          <option value="rack">Rack</option>
                          <option value="pallet">Pallet</option>
                        </select>
                      </label>
                      <div className="warehouse-map-editor-fields">
                        <label>
                          X position (%)
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            required
                            value={newLocation.x}
                            onChange={(event) =>
                              setNewLocation((location) => ({
                                ...location,
                                x: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          Y position (%)
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            required
                            value={newLocation.y}
                            onChange={(event) =>
                              setNewLocation((location) => ({
                                ...location,
                                y: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          Width (%)
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.5"
                            required
                            value={newLocation.width}
                            onChange={(event) =>
                              setNewLocation((location) => ({
                                ...location,
                                width: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          Height (%)
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.5"
                            required
                            value={newLocation.height}
                            onChange={(event) =>
                              setNewLocation((location) => ({
                                ...location,
                                height: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <p className="warehouse-map-editor-hint">
                        Positions and size are percentages of the map. Added
                        locations are shared with other users.
                      </p>
                      <button
                        type="submit"
                        className="warehouse-map-add-button"
                        disabled={
                          isSavingLocation || removingLocationId !== null
                        }
                      >
                        {isSavingLocation
                          ? "Saving..."
                          : editingLocationId
                            ? "Save changes"
                            : `Add ${newLocation.type}`}
                      </button>
                      {editingLocationId && (
                        <button
                          type="button"
                          className="warehouse-map-cancel-edit-button"
                          disabled={isSavingLocation}
                          onClick={handleCancelEditingLocation}
                        >
                          Cancel editing
                        </button>
                      )}
                    </div>
                  )}
                </form>
                <div className="warehouse-map-added-locations">
                  <h3>Warehouse locations</h3>
                  <label className="warehouse-map-location-filter">
                    <span>Filter by type</span>
                    <select
                      value={locationTypeFilter}
                      onChange={(event) =>
                        setLocationTypeFilter(event.target.value)
                      }
                    >
                      <option value="all">All locations</option>
                      <option value="rack">Racks</option>
                      <option value="pallet">Pallets</option>
                    </select>
                  </label>
                  {additionalLocations.length === 0 ? (
                    <p className="warehouse-map-editor-hint">
                      No racks or pallets are configured.
                    </p>
                  ) : sortedFilteredLocations.length === 0 ? (
                    <p className="warehouse-map-editor-hint">
                      No {locationTypeFilter} locations are configured.
                    </p>
                  ) : (
                    <ul>
                      {sortedFilteredLocations.map((location) => (
                        <li key={location.id}>
                          <span>
                            <strong>{location.id}</strong>
                            <small>{location.type}</small>
                          </span>
                          <button
                            type="button"
                            className="warehouse-map-location-edit"
                            aria-label={`Edit ${location.id}`}
                            disabled={
                              isSavingLocation || removingLocationId !== null
                            }
                            onClick={() => handleStartEditingLocation(location)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${location.id}`}
                            disabled={
                              isSavingLocation || removingLocationId !== null
                            }
                            onClick={() => handleRemoveLocation(location)}
                          >
                            {removingLocationId === location.id
                              ? "Removing..."
                              : "Remove"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="warehouse-map-preview">
                {renderWarehouseFloorPlan(false, true)}
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
            </div>
          </section>
        </div>
      )}

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
