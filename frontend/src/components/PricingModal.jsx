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

const PricingModal = ({ open, onClose, items, fetchItems }) => {
  const [pricing, setPricing] = useState({});
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

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
      uniqueSupplies.forEach((item) => {
        initialPrices[item.id] = item.price;
      });
      setPricing(initialPrices);
      setInitialized(true);
    }
  }, [open, uniqueSupplies, initialized]);

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

      await axios.put(`${BACKEND_URL}/api/products/updatePrices`, {
        prices: pricing,
      });

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
    </div>
  );
};

export default PricingModal;