import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FaTimes } from "react-icons/fa";
import { toast } from "react-hot-toast";
import "../styles/Modals.css";

const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "");

const actorHeaders = () => ({
  "X-Username": localStorage.getItem("username") || "",
  "X-User-Id": localStorage.getItem("userId") || "",
  "X-Role": localStorage.getItem("role") || "Admin",
});

const PricingModal = ({ open, onClose, items, fetchItems }) => {
  const [pricing, setPricing] = useState({});
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Reserved-for-client state
  const [clients, setClients] = useState([]);
  const [reservations, setReservations] = useState({});
  const [reserveTarget, setReserveTarget] = useState(null);
  const [reserveSelection, setReserveSelection] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [savingReserve, setSavingReserve] = useState(false);

  const uniqueSupplies = useMemo(() => {
    return Array.from(
      new Map(
        items.map((item) => [
          item.itemCode,
          {
            id: item._id,
            itemCode: item.itemCode,
            name: item.name,
            category: item.category,
            price: item.price || "",
            reservedFor: Array.isArray(item.reservedFor) ? item.reservedFor : [],
          },
        ])
      ).values()
    );
  }, [items]);

  useEffect(() => {
    if (!open) {
      setInitialized(false);
      return;
    }

    if (!initialized) {
      const initialPrices = {};
      const initialReservations = {};
      uniqueSupplies.forEach((item) => {
        initialPrices[item.id] = item.price;
        initialReservations[item.id] = item.reservedFor;
      });
      setPricing(initialPrices);
      setReservations(initialReservations);
      setInitialized(true);
    }
  }, [open, uniqueSupplies, initialized]);

  useEffect(() => {
    if (!open) return;
    axios
      .get(`${BACKEND_URL}/api/products/reservable-clients`)
      .then((res) => setClients(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load client list.");
      });
  }, [open]);

  const clientLabel = (username) => {
    const client = clients.find((c) => c.username === username);
    return client ? client.dialysisCenterName : `${username} (no account)`;
  };

  const openReservePicker = (item) => {
    setReserveTarget(item);
    setReserveSelection(reservations[item.id] || []);
    setClientSearch("");
  };

  const toggleReserveClient = (username) => {
    setReserveSelection((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username],
    );
  };

  const saveReservation = async () => {
    if (!reserveTarget) return;
    try {
      setSavingReserve(true);
      const res = await axios.put(
        `${BACKEND_URL}/api/products/${reserveTarget.id}/reserve`,
        { reservedFor: reserveSelection },
        { headers: actorHeaders() },
      );
      setReservations((prev) => ({
        ...prev,
        [reserveTarget.id]: res.data?.product?.reservedFor || reserveSelection,
      }));
      toast.success(
        reserveSelection.length
          ? `${reserveTarget.name} is now reserved.`
          : `${reserveTarget.name} is now available to all clients.`,
      );
      setReserveTarget(null);
      fetchItems();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to update reservation.");
    } finally {
      setSavingReserve(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.dialysisCenterName?.toLowerCase().includes(q) ||
      c.username.includes(q) ||
      c.fullName?.toLowerCase().includes(q)
    );
  });

  const handlePriceChange = (id, value) => {
    const numericValue = parseFloat(value);
  
      if (value === '' || value === '-') {
        setPricing((prev) => ({
          ...prev,
          [id]: '',
        }));
        return;
      }
      
      if (!isNaN(numericValue) && numericValue < 0) {
        toast.error("Price cannot be negative.");
        return;
      }
    setPricing((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const savePrices = async () => {
    try {
      setSaving(true);

      await axios.put(
        `${BACKEND_URL}/api/products/updatePrices`,
        { prices: pricing },
        {
          headers: {
            "X-Username": localStorage.getItem("username") || "",
            "X-User-Id": localStorage.getItem("userId") || "",
            "X-Role": localStorage.getItem("role") || "Admin",
          },
        },
      );

      toast.success("Prices updated successfully.");

      fetchItems();

      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update prices.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="inventory-modal-overlay">
      <div className="batch-modal-container pricing-modal-container">

        <div className="batch-modal-header">
          <h3>Supply Pricing</h3>

          <FaTimes
            className="batch-close-icon"
            onClick={onClose}
          />
        </div>

        <div className="pricing-body">

          <table className="pricing-table">

            <thead>
              <tr>
                <th>Supply Name</th>
                <th>Item Code</th>
                <th>Category</th>
                <th>Price (₱)</th>
                <th>Reserved For</th>
              </tr>
            </thead>

            <tbody>

              {uniqueSupplies.map((item) => (

                <tr key={item.id}>

                  <td>{item.name}</td>

                  <td>{item.itemCode}</td>

                  <td>{item.category}</td>

                  <td>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="price-input"
                      value={pricing[item.id] ?? ""}
                      onChange={(e) =>
                        handlePriceChange(item.id, e.target.value)
                      }
                    />

                  </td>

                  <td>
                    <button
                      type="button"
                      className={`reserve-cell-btn${
                        (reservations[item.id] || []).length ? " is-reserved" : ""
                      }`}
                      onClick={() => openReservePicker(item)}
                      title="Choose which clients can see and order this supply"
                    >
                      {(reservations[item.id] || []).length
                        ? (reservations[item.id] || []).map(clientLabel).join(", ")
                        : "All clients"}
                    </button>
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

        <div className="modal-action-footer">

          <button
            className="btn-cancel"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="btn-save"
            onClick={savePrices}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Prices"}
          </button>

        </div>

      </div>

      {reserveTarget && (
        <div className="inventory-modal-overlay reserve-overlay">
          <div className="batch-modal-container reserve-modal-container">
            <div className="batch-modal-header">
              <h3>Reserve Supply</h3>
              <FaTimes
                className="batch-close-icon"
                onClick={() => setReserveTarget(null)}
              />
            </div>

            <p className="reserve-intro">
              <strong>{reserveTarget.name}</strong> ({reserveTarget.itemCode})
              <br />
              Only the selected clients can see and order this supply. Leave
              all unchecked to make it available to every client.
            </p>

            <input
              type="text"
              className="reserve-search"
              placeholder="Search dialysis center or username"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />

            <div className="reserve-client-list">
              {filteredClients.length === 0 ? (
                <p className="reserve-empty">No client accounts found.</p>
              ) : (
                filteredClients.map((c) => (
                  <label key={c.username} className="reserve-client-row">
                    <input
                      type="checkbox"
                      checked={reserveSelection.includes(c.username)}
                      onChange={() => toggleReserveClient(c.username)}
                    />
                    <span>
                      <span className="reserve-client-name">
                        {c.dialysisCenterName}
                      </span>
                      <span className="reserve-client-user">
                        {c.username}
                        {c.status === "Inactive" ? " · Inactive" : ""}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="modal-action-footer">
              <button
                className="btn-cancel"
                onClick={() => setReserveSelection([])}
                disabled={savingReserve || reserveSelection.length === 0}
              >
                Clear (All clients)
              </button>
              <button
                className="btn-save"
                onClick={saveReservation}
                disabled={savingReserve}
              >
                {savingReserve ? "Saving..." : "Save Reservation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingModal;