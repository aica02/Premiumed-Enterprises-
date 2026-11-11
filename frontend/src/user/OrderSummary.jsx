import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaLongArrowAltLeft } from "react-icons/fa";
import { FaCartShopping } from "react-icons/fa6";
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
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  // Delivered orders past their payment due date. A notice only: the client
  // can still order.
  const [overdueOrders, setOverdueOrders] = useState([]);

  const [clientInfo, setClientInfo] = useState({
    fullName: "Loading...",
    address: "Loading...",
    procurementMobile: "Loading...",
  });

  // The account this page opened with. Admin and client logins share
  // localStorage, so a login in another tab can switch accounts mid-checkout.
  // The order is only ever placed for this account, with its own token.
  const [session] = useState(() => ({
    username: localStorage.getItem("username") || "",
    token: localStorage.getItem("token") || "",
  }));

  const isSessionStillActive = () =>
    (localStorage.getItem("username") || "") === session.username &&
    (localStorage.getItem("token") || "") === session.token;

  useEffect(() => {
    // Checkout items belong to whoever put them in the cart. If that is not
    // the account signed in now, they must not be ordered under it.
    if ((sessionStorage.getItem("checkoutOwner") || "") !== session.username) {
      sessionStorage.removeItem("checkoutItems");
      sessionStorage.removeItem("checkoutOwner");
      navigate("/Cart");
      return;
    }

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
      const username = session.username;
      if (!username) return;
      try {
        const response = await axios.get(
          `${BACKEND_URL}/api/auth/profile/${username}`
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

    const fetchOverdueOrders = async () => {
      const username = session.username;
      if (!username) return;
      try {
        const cleanUser = username.replace(/['"]+/g, "").trim();
        const response = await axios.get(
          `${BACKEND_URL}/api/orders/overdue/${encodeURIComponent(cleanUser)}`
        );
        setOverdueOrders(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        // The warning is optional; checkout works without it.
        console.error("Error fetching overdue orders:", err);
      }
    };
    fetchOverdueOrders();
  }, [navigate, session]);

  const handleProceed = () => {
    if (items.length === 0) {
      toast.error("Your cart is empty.");
      return;
    }
    if (!deliveryDate) {
      toast.error("Please select a requested delivery date.");
      return;
    }
    setShowCheckoutModal(true);
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
      const { username, token } = session;

      if (!username || !token) {
        toast.error("User not authenticated. Please login again.");
        return;
      }

      // Another tab logged in to a different account (admin or another
      // client) after this page opened. Stop instead of ordering this cart
      // under that account.
      if (!isSessionStillActive()) {
        toast.error(
          `This browser is now signed in to a different account. Log in again as "${username}" to place this order.`,
          { duration: 6000 },
        );
        return;
      }

      const transformedItems = items.map((item) => ({
        productId: item._id || item.id || item.itemCode,
        itemCode: item.itemCode,
        name: item.name,
        category: item.category || "Medical Supply",
        unitType: item.unitType || "Piece",
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        image: item.itemImage || item.image || "",
        orderMode: item.orderMode === "box" ? "box" : "piece",
        boxes: item.orderMode === "box" ? Number(item.boxes) || 0 : 0,
        quantityPerBox: Number(item.quantityPerBox) || 0,
      }));

      const orderPayload = {
        username: username,
        name: clientInfo.fullName,
        items: transformedItems,
        subtotal: items.reduce(
          (acc, item) =>
            acc + (Number(item.price) || 0) * (Number(item.quantity) || 1),
          0
        ),
        total: items.reduce(
          (acc, item) =>
            acc + (Number(item.price) || 0) * (Number(item.quantity) || 1),
          0
        ),
        shippingAddress: clientInfo.address,
        notes: notes || `Requested Delivery Date: ${deliveryDate}`,
        requestedDeliveryDate: deliveryDate,
      };

      const response = await axios.post(
        `${BACKEND_URL}/api/orders`,
        orderPayload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Username": username,
          },
        }
      );

      if (response.status === 201) {
        const checkedOutItemCodes = items.map((item) => item.itemCode);

        try {
          await axios.delete(`${BACKEND_URL}/api/orders/remove-items`, {
            data: { username: username, itemCodes: checkedOutItemCodes },
          });
        } catch (err) {
          console.error("Error removing items from cart:", err);
        }

        sessionStorage.removeItem("checkoutItems");
        sessionStorage.removeItem("checkoutOwner");

        const currentCart = JSON.parse(
          localStorage.getItem("cartItems") || "[]"
        );
        const updatedCart = currentCart.filter(
          (cartItem) => !checkedOutItemCodes.includes(cartItem.itemCode)
        );
        localStorage.setItem("cartItems", JSON.stringify(updatedCart));

        toast.success("Order Successful!");
        setTimeout(() => navigate("/order-transaction"), 1500);
      }
    } catch (error) {
      console.error("Checkout Error:", error.response?.data);
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

          {overdueOrders.length > 0 && (
            <div
              className="os-card"
              role="alert"
              style={{
                borderLeft: "4px solid #b8251e",
                background: "#fff5f5",
              }}
            >
              <h3 className="os-section-title" style={{ color: "#b8251e" }}>
                UNPAID OVERDUE ORDERS
              </h3>
              <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                You have {overdueOrders.length} delivered order
                {overdueOrders.length > 1 ? "s" : ""} past the 30-day payment
                due date. You can still place this order, but please upload
                your payment slip on the Orders &amp; Transactions page.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {overdueOrders.map((order) => (
                  <li key={order.orderId}>
                    #{order.orderId} — due{" "}
                    {new Date(order.paymentDueDate).toLocaleDateString(
                      "en-PH",
                      { year: "numeric", month: "short", day: "numeric" }
                    )}{" "}
                    — ₱{Number(order.total || 0).toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
              {items.map((item, index) => {
                const isBox = item.orderMode === "box";
                return (
                  <div key={item._id || index} className="os-item-row">
                    <div className="os-item-info">
                      <p className="os-item-name">{item.name}</p>
                      <span className="os-item-category">
                        {item.category + " - " + (item.unitType || "N/A")}
                      </span>
                    </div>
                    <div className="os-item-qty">
                      {isBox ? (
                        <>
                          {item.boxes} box{item.boxes !== 1 ? "es" : ""}
                          {item.quantityPerBox > 0 && (
                            <span className="os-item-qty-detail">
                              ({item.quantity} pcs)
                            </span>
                          )}
                        </>
                      ) : (
                        <>{item.quantity} Pcs.</>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            className="os-proceed-btn"
            onClick={handleProceed}
            disabled={isCheckingOut || items.length === 0}
          >
            {isCheckingOut ? "PROCESSING..." : "PROCEED"}
          </button>
        </div>

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
                  style={{
                    background: "#22a06b",
                    borderColor: "#22a06b",
                  }}
                >
                  {isCheckingOut ? "Processing..." : "Yes, Proceed"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}