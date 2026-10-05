import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaLongArrowAltLeft } from "react-icons/fa";
import { FaCartShopping, FaTriangleExclamation } from "react-icons/fa6";
import axios from "axios";
import { BACKEND_URL } from "../config";
import "../styles/ordersummary.css";
import "../styles/ConfirmModal.css";
import { Toaster, toast } from "react-hot-toast";

export default function OrderSummary() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  // Stock-check state
  const [checkingStock, setCheckingStock] = useState(false);
  const [isStockSufficient, setIsStockSufficient] = useState(true);
  const [insufficientItems, setInsufficientItems] = useState([]);
  const [productStockLevels, setProductStockLevels] = useState({});

  // Modal state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showPartialModal, setShowPartialModal] = useState(false);

  const [clientInfo, setClientInfo] = useState({
    fullName: "Loading...",
    address: "Loading...",
    procurementMobile: "Loading...",
  });

  useEffect(() => {
    const savedCheckout = sessionStorage.getItem("checkoutItems");
    if (savedCheckout) {
      try {
        const parsed = JSON.parse(savedCheckout);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
        } else {
          navigate("/Cart");
        }
      } catch {
        navigate("/Cart");
      }
    } else {
      navigate("/Cart");
    }

    const fetchClientData = async () => {
      const username = localStorage.getItem("username");
      if (!username) return;
      try {
        const response = await axios.get(
          `${BACKEND_URL}/api/auth/profile/${username}`,
        );
        const data = response.data;
        setClientInfo({
          fullName: data.fullName || "N/A",
          address: data.address || "N/A",
          procurementMobile:
            data.procurementMobile || data.phoneNumber || "N/A",
        });
      } catch (err) {
        console.error("Error fetching client info:", err);
        setClientInfo({
          fullName: "Error loading name",
          address: "Error loading address",
          procurementMobile: "Error loading contact",
        });
      }
    };
    fetchClientData();
  }, [navigate]);

  const checkStockAvailability = async () => {
    setCheckingStock(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/orders/check-stock`,
        {
          items: items.map((item) => ({
            itemCode: item.itemCode,
            quantity: Number(item.quantity) || 0,
          })),
        },
      );

      const insufficient = response.data.insufficientItems || [];

      // Build lookup { itemCode: available }
      const levels = {};
      response.data.stockLevels?.forEach((s) => {
        levels[s.itemCode] = Number(s.available) || 0;
      });

      setInsufficientItems(insufficient);
      setIsStockSufficient(insufficient.length === 0);
      setProductStockLevels(levels);

      return { insufficient, levels };
    } catch (error) {
      console.error("Error checking stock:", error);
      setInsufficientItems([]);
      setIsStockSufficient(true);
      setProductStockLevels({});
      // Return a safe fallback: treat everything as available
      const fallbackLevels = {};
      items.forEach((it) => {
        fallbackLevels[it.itemCode] = Number(it.quantity) || 0;
      });
      return { insufficient: [], levels: fallbackLevels };
    } finally {
      setCheckingStock(false);
    }
  };

  const handleProceed = async () => {
    if (items.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }
    if (!deliveryDate) {
      toast.error("Please select a requested delivery date.");
      return;
    }

    const { insufficient, levels } = await checkStockAvailability();

    // Guard: everything is out of stock
    const totalAvailable = Object.values(levels).reduce(
      (a, b) => a + Number(b || 0),
      0,
    );
    if (totalAvailable === 0 && items.length > 0) {
      toast.error("All selected items are out of stock.");
      return;
    }

    if (insufficient.length === 0) {
      setShowCheckoutModal(true);
    } else {
      setShowPartialModal(true);
    }
  };

  const buildOrderPayload = (levels = productStockLevels) => {
    const username = localStorage.getItem("username");
    const userId = localStorage.getItem("userId");
    const role = localStorage.getItem("role");

    const transformedItems = items.map((item) => {
      const requestedQty = Number(item.quantity) || 1;
      const availableQty =
        levels[item.itemCode] !== undefined
          ? Number(levels[item.itemCode])
          : requestedQty;
      const deliveredQty = Math.min(requestedQty, availableQty);

      return {
        productId: item._id || item.id || item.itemCode,
        itemCode: item.itemCode,
        name: item.name,
        category: item.category || "Medical Supply",
        quantity: requestedQty,
        deliveredQty,
        price: Number(item.price) || 0,
        image: item.itemImage || item.image || "",
      };
    });

    const subtotal = items.reduce(
      (acc, item) =>
        acc + (Number(item.price) || 0) * (Number(item.quantity) || 1),
      0,
    );

    return {
      username,
      userId: userId || null,
      role: role || "User",
      name: clientInfo.fullName,
      items: transformedItems,
      subtotal,
      total: subtotal,
      shippingAddress: clientInfo.address,
      notes: notes || `Requested Delivery Date: ${deliveryDate}`,
      requestedDeliveryDate: deliveryDate,
    };
  };

  const handleCheckout = async () => {
    if (items.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }
    if (!deliveryDate) {
      toast.error("Please select a requested delivery date.");
      return;
    }

    setIsCheckingOut(true);

    try {
      const username = localStorage.getItem("username");
      const userId = localStorage.getItem("userId");
      const role = localStorage.getItem("role");

      if (!username) {
        toast.error("User not authenticated. Please login again.");
        return;
      }

      // Always re-run stock check right before ordering
      const { levels } = await checkStockAvailability();
      const orderPayload = buildOrderPayload(levels);

      // For the normal endpoint, strip deliveredQty (schema strictness safety)
      if (isStockSufficient) {
        orderPayload.items = orderPayload.items.map(
          ({ deliveredQty, ...rest }) => rest,
        );
      }

      const endpoint = isStockSufficient
        ? `${BACKEND_URL}/api/orders`
        : `${BACKEND_URL}/api/orders/checkout-with-split`;

      const response = await axios.post(endpoint, orderPayload, {
        headers: {
          "X-Username": username,
          "X-User-Id": userId || "",
          "X-Role": role || "User",
        },
      });

      if (response.status === 201 || response.status === 200) {
        // Remove checked-out items from server cart
        const checkedOutItemCodes = items.map((item) => item.itemCode);
        try {
          await axios.delete(`${BACKEND_URL}/api/orders/remove-items`, {
            data: { username, itemCodes: checkedOutItemCodes },
          });
        } catch (err) {
          console.error("Error removing items from server cart:", err);
        }

        // Clear local checkout + cart
        sessionStorage.removeItem("checkoutItems");
        const currentCart = JSON.parse(
          localStorage.getItem("cartItems") || "[]",
        );
        const updatedCart = currentCart.filter(
          (cartItem) => !checkedOutItemCodes.includes(cartItem.itemCode),
        );
        localStorage.setItem("cartItems", JSON.stringify(updatedCart));

        toast.success(
          isStockSufficient
            ? "Order Successful!"
            : "Order placed with partial backorder!",
        );

        setTimeout(() => {
          navigate("/order-transaction");
        }, 1500);
      }
    } catch (error) {
      console.error("Checkout Error:", error.response?.data || error);
      const errorMessage =
        error.response?.data?.message || "Internal Server Error";
      toast.error(`Checkout failed: ${errorMessage}`);
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <div className="order-summary-page">
        <div className="order-summary-container">
          <div className="go-back-action os">
            <button className="back-link" onClick={() => navigate(-1)}>
              <FaLongArrowAltLeft />
              <span>Back to Cart</span>
            </button>
          </div>

          <div className="os-card os-client-card">
            <h3 className="os-section-title">CLIENT INFORMATION</h3>
            <div className="os-client-row">
              <span>Client Name</span>
              <strong>{clientInfo.fullName}</strong>
            </div>
            <div className="os-client-row">
              <span>Delivery Address</span>
              <strong>{clientInfo.address}</strong>
            </div>
            <div className="os-client-row">
              <span>Contact Number</span>
              <strong>{clientInfo.procurementMobile}</strong>
            </div>
          </div>

          <div className="os-card">
            <label className="os-date-label">Requested Delivery Date</label>
            <input
              type="date"
              className="os-date-input"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div className="os-card">
            <h3 className="os-section-title">MEDICAL SUPPLIES</h3>
            <div className="os-items">
              {items.map((item, index) => (
                <div key={item._id || index} className="os-item-row">
                  <div className="os-item-info">
                    <p className="os-item-name">{item.name}</p>
                    <span className="os-item-category">
                      {item.category + " - " + (item.unitType || "N/A")}
                    </span>
                  </div>
                  <div className="os-item-qty">{item.quantity} Pcs.</div>
                </div>
              ))}
            </div>
          </div>

          <button
            className="os-proceed-btn"
            onClick={handleProceed}
            disabled={isCheckingOut || checkingStock || items.length === 0}
          >
            {checkingStock
              ? "CHECKING STOCK..."
              : isCheckingOut
                ? "PROCESSING..."
                : "PROCEED"}
          </button>
        </div>

        {/* ---------- NORMAL CONFIRM MODAL ---------- */}
        {showCheckoutModal && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal-card">
              <div className="confirm-modal-icon" style={{ color: "#22a06b" }}>
                <FaCartShopping />
              </div>
              <h3 className="confirm-modal-title">Confirm Order?</h3>
              <p className="confirm-modal-message">
                Are you sure you want to proceed with this order? Your order
                will be submitted for processing.
              </p>
              <div className="confirm-modal-footer">
                <button
                  type="button"
                  className="confirm-modal-btn confirm-modal-btn-cancel"
                  onClick={() => setShowCheckoutModal(false)}
                  disabled={isCheckingOut}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="confirm-modal-btn confirm-modal-btn-confirm"
                  onClick={() => {
                    setShowCheckoutModal(false);
                    handleCheckout();
                  }}
                  disabled={isCheckingOut}
                  style={{ background: "#22a06b", borderColor: "#22a06b" }}
                >
                  {isCheckingOut ? "Processing..." : "Yes, Proceed"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- PARTIAL / INSUFFICIENT MODAL ---------- */}
        {showPartialModal && (
          <div className="confirm-modal-overlay">
            <div className="confirm-modal-card">
              <div
                className="confirm-modal-icon"
                style={{ color: "#e0a800" }}
              >
                <FaTriangleExclamation/>
              </div>
              
              <h3 className="confirm-modal-title">Insufficient Stock</h3>

              <p className="confirm-modal-message">
                The requested item quantity exceeds available stock. Would you like to confirm partial delivery for the unavailable items?
              </p>

              <div className="confirm-modal-details">
                {insufficientItems.map((it, idx) => (
                  <div key={idx} className="confirm-modal-detail-row">
                    <span className="confirm-modal-detail-label">
                      {it.productName || it.name || it.itemCode}
                    </span>
                    
                  </div>
                ))}
              </div>

              <div className="confirm-modal-footer">
                <button
                  type="button"
                  className="confirm-modal-btn confirm-modal-btn-cancel"
                  onClick={() => navigate("/Cart")}
                  disabled={isCheckingOut}
                >
                  No, Back to Cart
                </button>
                <button
                  type="button"
                  className="confirm-modal-btn confirm-modal-btn-confirm"
                  onClick={() => {
                    setShowPartialModal(false);
                    handleCheckout();
                  }}
                  disabled={isCheckingOut}
                  style={{ background: "#e0a800", borderColor: "#e0a800" }}
                >
                  {isCheckingOut ? "Processing..." : "Yes, Place Order"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}