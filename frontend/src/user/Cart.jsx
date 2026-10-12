import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaTrash,
  FaLongArrowAltLeft,
  FaLongArrowAltRight,
  FaExclamationTriangle,
} from "react-icons/fa";
import { Toaster, toast } from "react-hot-toast";
import { FiMinusCircle } from "react-icons/fi";
import { FaRegSquarePlus } from "react-icons/fa6";
import cartService from "./CartService";
import "../stylesClient/cart.css";

export default function Cart() {
  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [itemToRemove, setItemToRemove] = useState(null);

  const [showInvalidQuantityModal, setShowInvalidQuantityModal] =
    useState(false);
  const [invalidQuantityItem, setInvalidQuantityItem] = useState("");

  const [showStockModal, setShowStockModal] = useState(false);
  const [insufficientItems, setInsufficientItems] = useState([]);

  const navigate = useNavigate();

  const isUserLoggedIn = () => {
    const username = localStorage.getItem("username");
    const token = localStorage.getItem("token");
    return username && username !== "guest" && username !== "null" && token;
  };

  const getItemId = (item) => item.itemCode || item._id;

  useEffect(() => {
    loadCartItems();
  }, []);

  const loadCartItems = async () => {
    setLoading(true);
    try {
      const isLoggedIn = isUserLoggedIn();

      if (isLoggedIn) {
        const dbItems = await cartService.fetchCart();
        const itemsWithPrice = dbItems.map((item) => ({
          ...item,
          price: Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
          orderMode: item.orderMode === "box" ? "box" : "piece",
          boxes: Number(item.boxes) || 0,
          quantityPerBox: Number(item.quantityPerBox) || 0,
        }));

        setItems(itemsWithPrice);
        if (itemsWithPrice.length > 0) {
          setSelectedItems(itemsWithPrice.map((item) => getItemId(item)));
        }
      } else {
        const saved = sessionStorage.getItem("cartItems");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const cartItems = Array.isArray(parsed) ? parsed : [];
            const itemsWithPrice = cartItems.map((item) => ({
              ...item,
              price: Number(item.price) || 0,
              quantity: Number(item.quantity) || 1,
              orderMode: item.orderMode === "box" ? "box" : "piece",
              boxes: Number(item.boxes) || 0,
              quantityPerBox: Number(item.quantityPerBox) || 0,
            }));
            setItems(itemsWithPrice);
            if (itemsWithPrice.length > 0) {
              setSelectedItems(itemsWithPrice.map((item) => getItemId(item)));
            }
          } catch (e) {
            console.error("Error parsing session storage:", e);
            setItems([]);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load cart:", error);
      toast.error("Failed to load cart");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && !isUserLoggedIn()) {
      if (items.length > 0) {
        sessionStorage.setItem("cartItems", JSON.stringify(items));
      } else {
        sessionStorage.removeItem("cartItems");
      }
    }
  }, [items, loading]);

  const goToShopping = () => navigate("/");

  const goToOrderSummary = () => {
    const checkoutItems = items.filter((item) =>
      selectedItems.includes(getItemId(item)),
    );

    const invalidItem = checkoutItems.find((item) => {
      if (item.orderMode === "box") {
        const b = Number(item.boxes);
        return (
          item.boxes === "" ||
          !Number.isFinite(b) ||
          b <= 0 ||
          !Number.isInteger(b)
        );
      }
      const qty = Number(item.quantity);
      return (
        item.quantity === "" ||
        !Number.isFinite(qty) ||
        qty <= 0 ||
        !Number.isInteger(qty)
      );
    });

    if (invalidItem) {
      setInvalidQuantityItem(invalidItem.name);
      setShowInvalidQuantityModal(true);
      return;
    }

    const itemsWithPrice = checkoutItems.map((item) => ({
      ...item,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity),
      boxes: item.orderMode === "box" ? Number(item.boxes) : 0,
      quantityPerBox: Number(item.quantityPerBox) || 0,
    }));

    sessionStorage.setItem("checkoutItems", JSON.stringify(itemsWithPrice));
    navigate("/OrderSummary");
  };

  const handleCheckoutClick = () => {
    const checkoutItems = items.filter((item) =>
      selectedItems.includes(getItemId(item)),
    );

    const outOfStockList = checkoutItems.filter(
      (item) =>
        item.quantity >
        (item.stock ?? item.availableStock ?? item.qtyInStock ?? Infinity),
    );

    if (outOfStockList.length > 0) {
      setInsufficientItems(outOfStockList);
      setShowStockModal(true);
    } else {
      goToOrderSummary();
    }
  };

  const handleConfirmPartial = () => {
    const checkoutItems = items
      .filter((item) => selectedItems.includes(getItemId(item)))
      .map((item) => {
        const avail =
          item.stock ?? item.availableStock ?? item.qtyInStock ?? item.quantity;
        if (item.quantity > avail) {
          return { ...item, quantity: avail };
        }
        return item;
      })
      .filter((item) => item.quantity > 0);

    sessionStorage.setItem("checkoutItems", JSON.stringify(checkoutItems));
    setShowStockModal(false);
    navigate("/OrderSummary");
  };

  const toggleSelectItem = (id) => {
    setSelectedItems((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map((item) => getItemId(item)));
    }
  };

  const persistItem = async (id, nextItem) => {
    const currentItem = items.find((item) => getItemId(item) === id);
    if (!currentItem) return false;
    const updatedItem = { ...currentItem, ...nextItem };

    if (isUserLoggedIn()) {
      try {
        await cartService.updateQuantity(
          id,
          updatedItem.quantity,
          updatedItem.orderMode,
          updatedItem.boxes,
          updatedItem.quantityPerBox,
        );
      } catch (error) {
        console.error("Failed to update quantity:", error);
        toast.error("Failed to update quantity");
        return false;
      }
    }
    setItems((prevItems) =>
      prevItems.map((item) => (getItemId(item) === id ? updatedItem : item)),
    );
    return true;
  };

  const changeOrderMode = async (id, nextMode) => {
    const item = items.find((currentItem) => getItemId(currentItem) === id);
    if (!item || (nextMode !== "piece" && nextMode !== "box")) return;
    if (nextMode === item.orderMode) return;

    const quantityPerBox = Number(item.quantityPerBox) || 0;
    if (quantityPerBox <= 0) return;

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Enter a valid quantity before changing the order type.");
      return;
    }

    if (nextMode === "box") {
      if (quantity % quantityPerBox !== 0) {
        toast.error(
          `Not enough ${item.unitType || "units"} to order by ${
            String(item.unitType || "")
              .trim()
              .toLowerCase() === "box"
              ? "case"
              : "box"
          }.`,
        );
        return;
      }
      await persistItem(id, {
        orderMode: "box",
        boxes: quantity / quantityPerBox,
      });
      return;
    }

    await persistItem(id, { orderMode: "piece", boxes: 0 });
  };

  const updateQty = async (id, delta) => {
    const item = items.find((i) => getItemId(i) === id);
    if (!item) return;

    if (item.orderMode === "box") {
      const current = Number(item.boxes);
      if (!Number.isFinite(current)) return;
      const next = current + delta;
      if (next <= 0) {
        setItemToRemove(item);
        setShowRemoveModal(true);
        return;
      }
      await persistItem(id, {
        boxes: next,
        quantity: next * (item.quantityPerBox || 0),
      });
    } else {
      const current = Number(item.quantity);
      if (!Number.isFinite(current)) return;
      const next = current + delta;
      if (next <= 0) {
        setItemToRemove(item);
        setShowRemoveModal(true);
        return;
      }
      await persistItem(id, { quantity: next, boxes: 0 });
    }
  };

  const setBoxes = async (id, value) => {
    const item = items.find((i) => getItemId(i) === id);
    if (!item) return;

    if (value === "") {
      setItems((prev) =>
        prev.map((i) => (getItemId(i) === id ? { ...i, boxes: "" } : i)),
      );
      return;
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) return;

    await persistItem(id, {
      boxes: num,
      quantity: num * (item.quantityPerBox || 0),
    });
  };

  const setQuantity = async (id, value) => {
    if (value === "") {
      setItems((prev) =>
        prev.map((i) => (getItemId(i) === id ? { ...i, quantity: "" } : i)),
      );
      return;
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) return;

    await persistItem(id, { quantity: num, boxes: 0 });
  };

  const confirmRemoveItem = async () => {
    if (!itemToRemove) return;
    const id = getItemId(itemToRemove);
    setShowRemoveModal(false);
    setItemToRemove(null);
    await removeItem(id);
  };

  const cancelRemoveItem = () => {
    setShowRemoveModal(false);
    setItemToRemove(null);
  };

  const removeItem = async (id) => {
    if (isUserLoggedIn()) {
      try {
        await cartService.removeItem(id);
        setItems((prev) => prev.filter((item) => getItemId(item) !== id));
        setSelectedItems((prev) => prev.filter((itemId) => itemId !== id));
        toast.success("Item removed from cart");
      } catch (error) {
        console.error("Failed to remove item:", error);
        toast.error("Failed to remove item");
      }
    } else {
      setItems((prev) => prev.filter((item) => getItemId(item) !== id));
      setSelectedItems((prev) => prev.filter((itemId) => itemId !== id));
    }
  };

  if (loading) {
    return <div className="cart-loading">Loading your cart...</div>;
  }

  return (
    <div className="cart-page">
      <Toaster position="top-center" reverseOrder={false} autoClose={3000} />
      <div className="cart-container">
        <div className="cart-header">
          <div className="go-back-action">
            <button className="back-link" onClick={goToShopping}>
              <FaLongArrowAltLeft />
              <span>Back to Shopping</span>
            </button>
          </div>
          <div className="cart-header-top">
            <h1 className="cart-title">Your cart</h1>
          </div>

          <button
            className="checkout-btn"
            onClick={handleCheckoutClick}
            disabled={selectedItems.length === 0}
          >
            Checkout
            <span className="checkout-arrow">
              <FaLongArrowAltRight />
            </span>
          </button>
          <p className="cart-subtitle">
            You have {selectedItems.length} selected item
            {selectedItems.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="cart-layout">
          <div className="cart-items">
            {items.length > 0 && (
              <div className="select-all-wrapper">
                <input
                  type="checkbox"
                  checked={
                    items.length > 0 && selectedItems.length === items.length
                  }
                  onChange={toggleSelectAll}
                />
                <span>Select All</span>
              </div>
            )}

            {items.length === 0 ? (
              <div className="cart-empty">
                <p>Your cart is empty.</p>
                <button className="shop-now-btn" onClick={goToShopping}>
                  Shop Now
                </button>
              </div>
            ) : (
              items.map((item, index) => {
                const itemId = getItemId(item);
                const isBox = item.orderMode === "box";
                const unitType = item.unitType || "Piece";
                const packageLabel =
                  String(unitType).trim().toLowerCase() === "box"
                    ? "Case"
                    : "Box";
                return (
                  <div className="cart-item" key={itemId || index}>
                    <input
                      type="checkbox"
                      className="cart-checkbox"
                      checked={selectedItems.includes(itemId)}
                      onChange={() => toggleSelectItem(itemId)}
                    />
                    <div className="item-image-wrap">
                      <img
                        src={
                          item.itemImage || "https://via.placeholder.com/150"
                        }
                        alt={item.name}
                        className="item-image"
                      />
                    </div>
                    <div className="item-info">
                      <p className="item-name">{item.name}</p>
                      <div className="item-unitCategory-row">
                        <p className="item-unit-type">{unitType}</p>
                        <p className="item-category">{item.category}</p>
                      </div>
                      {Number(item.quantityPerBox) > 0 && (
                        <label className="item-order-control">
                          <span>Order by: </span>
                          <select
                            className="item-order-select"
                            value={isBox ? "box" : "piece"}
                            onChange={(event) =>
                              changeOrderMode(itemId, event.target.value)
                            }
                            aria-label={`Order ${item.name} by`}
                          >
                            <option value="piece">{unitType}</option>
                            <option value="box">{packageLabel}</option>
                          </select>
                        </label>
                      )}
                    </div>

                    <div className="item-quantity-group">
                      <div className="item-quantity-control">
                        <span className="item-quantity-label">
                          Total {isBox ? packageLabel : unitType}:
                        </span>
                        <div className="item-qty">
                          <button onClick={() => updateQty(itemId, -1)}>
                            <FiMinusCircle />
                          </button>

                          {isBox ? (
                            <input
                              type="number"
                              value={item.boxes}
                              min="0"
                              onChange={(e) => setBoxes(itemId, e.target.value)}
                              className="qty-input"
                            />
                          ) : (
                            <input
                              type="number"
                              value={item.quantity}
                              min="0"
                              onChange={(e) =>
                                setQuantity(itemId, e.target.value)
                              }
                              className="qty-input"
                            />
                          )}

                          <button onClick={() => updateQty(itemId, 1)}>
                            <FaRegSquarePlus />
                          </button>
                        </div>
                      </div>
                      {isBox && (
                        <span className="item-package-total">
                          Total {unitType}: {item.quantity}
                        </span>
                      )}
                    </div>

                    <button
                      className="remove-btn"
                      onClick={() => removeItem(itemId)}
                    >
                      <FaTrash />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {showRemoveModal && itemToRemove && (
        <div className="cart-modal-overlay" onClick={cancelRemoveItem}>
          <div
            className="cart-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cart-modal-icon warning-icon">!</div>
            <h3>Remove Item?</h3>
            <p>
              The quantity of <strong>{itemToRemove.name}</strong> has reached{" "}
              <strong>0</strong>. This item will be removed from your cart.
            </p>
            <div className="cart-modal-actions">
              <button
                type="button"
                className="cart-modal-cancel"
                onClick={cancelRemoveItem}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cart-modal-remove"
                onClick={confirmRemoveItem}
              >
                <FaTrash /> Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvalidQuantityModal && (
        <div
          className="cart-modal-overlay"
          onClick={() => setShowInvalidQuantityModal(false)}
        >
          <div
            className="cart-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cart-modal-icon warning-icon">!</div>
            <h3>Invalid Quantity</h3>
            <p>
              Please enter a quantity greater than <strong>0</strong> for{" "}
              <strong>{invalidQuantityItem}</strong> before proceeding to
              checkout.
            </p>
            <button
              type="button"
              className="cart-modal-ok"
              onClick={() => setShowInvalidQuantityModal(false)}
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {showStockModal && (
        <div className="stock-modal-overlay">
          <div className="stock-modal-container">
            <div className="stock-modal-header">
              <div className="warning-icon-wrapper">
                <FaExclamationTriangle className="warning-icon" />
              </div>
              <h2>Insufficient Stock</h2>
            </div>
            <p className="stock-modal-description">
              The requested item quantity exceeds available stock. Would you
              like to confirm partial delivery for the unavailable items?
            </p>
            <div className="stock-modal-list">
              {insufficientItems.map((item, idx) => (
                <div key={idx} className="stock-modal-item">
                  <span className="stock-item-name">{item.name}</span>
                  <span className="stock-item-category">{item.category}</span>
                </div>
              ))}
            </div>
            <div className="stock-modal-actions">
              <button
                className="cancel-btn"
                onClick={() => setShowStockModal(false)}
              >
                Cancel
              </button>
              <button className="proceed-btn" onClick={handleConfirmPartial}>
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
