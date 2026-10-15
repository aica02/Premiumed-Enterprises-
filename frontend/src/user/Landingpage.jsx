import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
  MdAutorenew,
  MdInventory,
  MdOutlineExitToApp,
} from "react-icons/md";
import { FaSearch, FaShoppingCart } from "react-icons/fa";
import { FaRegSquarePlus } from "react-icons/fa6";
import { FiMinusCircle } from "react-icons/fi";
import "../stylesClient/landingpage.css";
import ClientNavbar from "../components/HeaderClient";
import { BACKEND_URL } from "../config";
import { Toaster, toast } from "react-hot-toast";
import cartService from "./CartService";
import EmptyState from "../components/EmptyState";
import { CATEGORIES } from "../components/Categories";
import usePolling from "../hooks/usePolling";

function FilterSidebar({ selectedCategories, onCategoryChange }) {
  return (
    <aside className="filter-sidebar">
      <div className="sidebar-title">Filter by category</div>
      <div className="checkbox-list">
        {CATEGORIES.map((cat) => (
          <label key={cat} className="checkbox-item">
            <input
              type="checkbox"
              checked={selectedCategories.includes(cat)}
              onChange={() => onCategoryChange(cat)}
            />
            <span>{cat}</span>
          </label>
        ))}
      </div>
    </aside>
  );
}

function ProductImage({ src, alt, className }) {
  const imageSrc = typeof src === "string" ? src.trim() : "";
  const [failedImageSrc, setFailedImageSrc] = useState("");

  if (!imageSrc || failedImageSrc === imageSrc) {
    return (
      <div
        className={`${className} product-image-placeholder`}
        role="img"
        aria-label={`${alt} image unavailable`}
      >
        <MdInventory aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => setFailedImageSrc(imageSrc)}
    />
  );
}

function ProductCard({ product, onClick }) {
  return (
    <div className="product-card" onClick={() => onClick(product)}>
      <div className="product-image-area">
        <ProductImage
          src={product.itemImage || product.image}
          alt={product.name}
          className="product-image"
        />
      </div>
      <div className="product-body">
        <span className="product-tag">{product.category}</span>
        <div className="product-name">{product.name}</div>
      </div>
    </div>
  );
}

function ProductModal({ product, onClose }) {
  const [mode, setMode] = useState("piece"); // "piece" | "box"
  const [pieces, setPieces] = useState(1);
  const [boxes, setBoxes] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);
  const navigate = useNavigate();

  if (!product) return null;

  const quantityPerBox = Number(product.quantityPerBox) || 0;
  const hasBoxOption = quantityPerBox > 0;
  const unitType = product.unitType || "Piece";
  const orderByLabel =
    String(unitType).trim().toLowerCase() === "box" ? "Case" : "Box";

  // Mode toggle only if the product actually has quantityPerBox
  useEffect(() => {
    if (!hasBoxOption) setMode("piece");
  }, [hasBoxOption]);

  const effectiveQuantity = mode === "box" ? boxes * quantityPerBox : pieces;

  const validate = () => {
    if (mode === "piece") {
      const q = Number(pieces);
      if (!pieces || isNaN(q) || q <= 0 || !Number.isInteger(q)) {
        setShowInvalid(true);
        return false;
      }
    } else {
      const b = Number(boxes);
      if (!boxes || isNaN(b) || b <= 0 || !Number.isInteger(b)) {
        setShowInvalid(true);
        return false;
      }
      if (quantityPerBox <= 0) {
        setShowInvalid(true);
        return false;
      }
    }
    return true;
  };

  const buildCartProduct = () => ({
    itemCode: product.itemCode,
    name: product.name,
    quantity: effectiveQuantity,
    unitType: product.unitType || "N/A",
    itemImage: product.itemImage || product.image || "",
    category: product.category || "",
    price: Number(product.price) || 0,
    orderMode: mode,
    boxes: mode === "box" ? boxes : 0,
    quantityPerBox: quantityPerBox,
  });

  const addToCartLogic = async (shouldNavigate = false) => {
    if (!product._id || !product.name || !product.price) {
      toast.error("Error: Product information is incomplete.");
      return;
    }
    setIsAdding(true);

    try {
      const username = localStorage.getItem("username");
      const token = localStorage.getItem("token");
      const isLoggedIn =
        username && username !== "guest" && username !== "null" && token;

      const cartProduct = buildCartProduct();

      if (isLoggedIn) {
        await cartService.addToCart(cartProduct, effectiveQuantity);
        toast.success("Successfully Added to Cart!");
        if (!shouldNavigate) onClose();
        else navigate("/cart");
      } else {
        const existingCart = JSON.parse(
          sessionStorage.getItem("cartItems") || "[]",
        );
        const existingIndex = existingCart.findIndex(
          (item) => item.itemCode === cartProduct.itemCode,
        );

        if (existingIndex > -1) {
          const existing = existingCart[existingIndex];

          if (existing.orderMode !== mode) {
            // mode switched 
            existingCart[existingIndex] = cartProduct;
          } else if (mode === "box") {
            existing.boxes = (existing.boxes || 0) + boxes;
            existing.quantity = existing.boxes * quantityPerBox;
          } else {
            existing.quantity = (existing.quantity || 0) + pieces;
          }
        } else {
          existingCart.push(cartProduct);
        }

        sessionStorage.setItem("cartItems", JSON.stringify(existingCart));
        toast.success("Successfully Added to Cart!");
        if (!shouldNavigate) onClose();
        else navigate("/cart");
      }
    } catch (error) {
      console.error("Add to cart error:", error);
      toast.error(
        error.response?.data?.error ||
          "Failed to add to cart. Please try again.",
      );
    } finally {
      setIsAdding(false);
    }
  };

  const buyNow = async () => {
    if (!product._id || !product.name || !product.price) {
      toast.error("Error: Product information is incomplete.");
      return;
    }
    setIsAdding(true);
    try {
      const checkoutProduct = buildCartProduct();
      sessionStorage.setItem(
        "checkoutItems",
        JSON.stringify([checkoutProduct]),
      );
      onClose();
      navigate("/OrderSummary");
    } catch (error) {
      console.error("Buy now error:", error);
      toast.error("Failed to process. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="modal-client-overlay" onClick={onClose}>
      <div
        className="modal-client-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{product.name}</h2>
          <button className="close-btn" onClick={onClose}>
            <MdOutlineExitToApp />
          </button>
        </div>
        <div className="modal-content">
          <div className="modal-image">
            <ProductImage
              src={product.itemImage || product.image}
              alt={product.name}
              className="modal-product-image"
            />
            <span className="product-unit-badge">
              {product.unitType || "N/A"}
            </span>
            {mode === "box" && (
              <span className="case-quantity-badge">
                {quantityPerBox} {unitType}s / {orderByLabel}
              </span>
            )}
          </div>

          <div className="modal-details">
            <div className="modal-controls-wrapper product-order-controls">
              {hasBoxOption && (
                <div className="modal-quantity-row product-order-row">
                  <span className="modal-qty-label">Order by:</span>
                  <div className="product-order-toggle">
                    <button
                      type="button"
                      onClick={() => setMode("piece")}
                      className={`product-order-option${mode === "piece" ? " is-selected" : ""}`}
                      aria-pressed={mode === "piece"}
                    >
                      {unitType}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("box")}
                      className={`product-order-option${mode === "box" ? " is-selected" : ""}`}
                      aria-pressed={mode === "box"}
                    >
                      {orderByLabel}
                    </button>
                  </div>
                </div>
              )}

              {mode === "piece" ? (
                <div className="modal-quantity-row product-quantity-row">
                  <span className="modal-qty-label">{unitType}</span>
                  <div className="modal-qty-selector">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        setPieces((prev) =>
                          prev === "" ? "" : Math.max(0, prev - 1),
                        )
                      }
                    >
                      <FiMinusCircle />
                    </button>
                    <input
                      type="number"
                      value={pieces}
                      min="0"
                      step="1"
                      aria-label={unitType}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPieces(v === "" ? "" : Number(v));
                      }}
                      className="qty-input"
                    />
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() =>
                        setPieces((prev) => (prev === "" ? 1 : prev + 1))
                      }
                    >
                      <FaRegSquarePlus />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="modal-quantity-row product-quantity-row">
                  <span className="modal-qty-label">{orderByLabel}</span>
                  <div className="modal-qty-selector">
                    <button
                      type="button"
                      aria-label="Decrease cases"
                      onClick={() =>
                        setBoxes((prev) =>
                          prev === "" ? "" : Math.max(0, prev - 1),
                        )
                      }
                    >
                      <FiMinusCircle />
                    </button>
                    <input
                      type="number"
                      value={boxes}
                      min="0"
                      step="1"
                      aria-label="Number of cases"
                      onChange={(e) => {
                        const v = e.target.value;
                        setBoxes(v === "" ? "" : Number(v));
                      }}
                      className="qty-input"
                    />
                    <button
                      type="button"
                      aria-label="Increase cases"
                      onClick={() =>
                        setBoxes((prev) => (prev === "" ? 1 : prev + 1))
                      }
                    >
                      <FaRegSquarePlus />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="modal-add-to-cart-btn"
                onClick={() => {
                  if (validate()) addToCartLogic();
                }}
                disabled={isAdding}
              >
                <FaShoppingCart /> {isAdding ? "Adding..." : "Add to Cart"}
              </button>
              <button
                className="buy-now-btn"
                onClick={() => {
                  if (validate()) buyNow();
                }}
                disabled={isAdding}
              >
                Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {showInvalid && (
        <div
          className="invalid-quantity-overlay"
          onClick={() => setShowInvalid(false)}
        >
          <div
            className="invalid-quantity-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invalid-quantity-icon">!</div>
            <h3>Invalid Quantity</h3>
            <p>Please enter a valid quantity greater than 0.</p>
            <button type="button" onClick={() => setShowInvalid(false)}>
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileFilters({ selectedCategories, onCategoryChange }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mobile-filters">
      <button
        type="button"
        className="mobile-filter-button"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span>Filter by category</span>
        <span className="mobile-filter-arrow">
          {isOpen ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />}
        </span>
      </button>

      {isOpen && (
        <div className="mobile-filter-dropdown">
          <div className="checkbox-list">
            {CATEGORIES.map((cat) => (
              <label key={cat} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => onCategoryChange(cat)}
                />
                <span>{cat}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LandingPageContent() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/products`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setProducts(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);
  usePolling(fetchProducts);

  const handleCategoryChange = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const filteredProducts = products.filter((product) => {
    const categoryMatch =
      selectedCategories.length === 0 ||
      selectedCategories.includes(product.category);
    const searchMatch = product.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} autoClose={3000} />
      <div className="page">
        <FilterSidebar
          selectedCategories={selectedCategories}
          onCategoryChange={handleCategoryChange}
        />

        <div className="main-product-grid">
          <div className="search-bar">
            <span className="search-bar-icon">
              <FaSearch />
            </span>
            <input
              type="text"
              placeholder="Search by Supply Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <MobileFilters
            selectedCategories={selectedCategories}
            onCategoryChange={handleCategoryChange}
          />
          <main className="main-client">
            <div className="product-grid">
              {loading ? (
                <div className="landing-empty-state-wrap" aria-live="polite">
                  <EmptyState
                    icon={<MdAutorenew className="landing-loading-spinner" />}
                    title="Loading products"
                    message="Please wait while we load the available products."
                  />
                </div>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((p) => (
                  <ProductCard
                    key={p._id}
                    product={p}
                    onClick={setSelectedProduct}
                  />
                ))
              ) : (
                <div className="landing-empty-state-wrap">
                  <EmptyState
                    title={
                      searchQuery || selectedCategories.length > 0
                        ? "No matching products"
                        : "No products available"
                    }
                    message={
                      searchQuery || selectedCategories.length > 0
                        ? "We couldn't find any products that match your current search or category filters."
                        : "Products will appear here once they are available in the catalog."
                    }
                    buttonText={
                      searchQuery || selectedCategories.length > 0
                        ? "Clear Search & Filters"
                        : undefined
                    }
                    onButtonClick={
                      searchQuery || selectedCategories.length > 0
                        ? () => {
                            setSearchQuery("");
                            setSelectedCategories([]);
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          </main>
          {selectedProduct && (
            <ProductModal
              product={selectedProduct}
              onClose={() => setSelectedProduct(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default function UserLayout() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="user-container">
      <ClientNavbar />
      <main className="user-content">
        {isHome ? <LandingPageContent /> : <Outlet />}
      </main>
    </div>
  );
}
