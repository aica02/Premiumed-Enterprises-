import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { LuPhilippinePeso } from "react-icons/lu";
import {
  MdKeyboardArrowDown,
  MdKeyboardArrowUp,
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

/* ================= SUB-COMPONENTS ================= */

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

function ProductCard({ product, onClick }) {
  return (
    <div className="product-card" onClick={() => onClick(product)}>
      <div className="product-image-area">
        <img
          src={product.itemImage || "https://via.placeholder.com/150"}
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

const isUserLoggedIn = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  return user && user.username && user.username !== "guest" && user.token;
};

function ProductModal({ product, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [showInvalidQuantityModal, setShowInvalidQuantityModal] =
    useState(false);
  const navigate = useNavigate();

  if (!product) return null;

  const addToCartLogic = async (qty, shouldNavigate = false) => {
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

      // Create a clean product object for cart
      const cartProduct = {
        itemCode: product.itemCode,
        name: product.name,
        quantity: qty,
        unitType: product.unitType || "N/A",
        itemImage: product.itemImage || product.image || "",
        category: product.category || "",
        price: Number(product.price) || 0,
      };

      if (isLoggedIn) {
        await cartService.addToCart(cartProduct, qty);
        toast.success("Successfully Added to Cart!");

        if (!shouldNavigate) {
          onClose();
        } else {
          navigate("/cart");
        }
      } else {
        const existingCart = JSON.parse(
          sessionStorage.getItem("cartItems") || "[]",
        );
        const existingIndex = existingCart.findIndex(
          (item) => item.itemCode === product._id,
        );

        if (existingIndex > -1) {
          existingCart[existingIndex].quantity += qty;
          existingCart[existingIndex].price = Number(product.price) || 0;
        } else {
          existingCart.push(cartProduct);
        }

        sessionStorage.setItem("cartItems", JSON.stringify(existingCart));
        toast.success("Successfully Added to Cart!");

        if (!shouldNavigate) {
          onClose();
        } else {
          navigate("/cart");
        }
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
      const checkoutProduct = {
        itemCode: product.itemCode,
        name: product.name,
        quantity: quantity,
        unitType: product.unitType || "N/A",
        itemImage: product.itemImage || product.image || "",
        category: product.category || "",
        price: Number(product.price) || 0,
      };

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

  const validateQuantity = () => {
    const qty = Number(quantity);

    if (!quantity || isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      setShowInvalidQuantityModal(true);
      return false;
    }

    return true;
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
            <img
              src={product.itemImage || "https://via.placeholder.com/150"}
              alt={product.name}
              className="modal-product-image"
            />
          </div>

          <div className="modal-details">
            <div className="modal-controls-wrapper">
              <div className="modal-quantity-row">
                <span className="modal-qty-label">Unit Type:</span>
                <div className="modal-qty-labelx">
                  {product.unitType || "N/A"}
                </div>
              </div>

              <div className="modal-quantity-row">
                <span className="modal-qty-label">Quantity</span>
                <div className="modal-qty-selector">
                  <button
                    onClick={() => {
                      setQuantity((prev) =>
                        prev === "" ? "" : Math.max(0, prev - 1),
                      );
                    }}
                  >
                    <FiMinusCircle />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    min="0"
                    onChange={(e) => {
                      const value = e.target.value;

                      if (value === "") {
                        setQuantity("");
                      } else {
                        setQuantity(Number(value));
                      }
                    }}
                    className="qty-input"
                  />
                  <button
                    onClick={() => {
                      setQuantity((prev) => (prev === "" ? 1 : prev + 1));
                    }}
                  >
                    <FaRegSquarePlus />
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="modal-add-to-cart-btn"
                onClick={() => {
                  if (validateQuantity()) {
                    addToCartLogic(quantity);
                  }
                }}
                disabled={isAdding}
              >
                <FaShoppingCart /> {isAdding ? "Adding..." : "Add to Cart"}
              </button>
              <button
                className="buy-now-btn"
                onClick={() => {
                  if (validateQuantity()) {
                    buyNow();
                  }
                }}
                disabled={isAdding}
              >
                Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {showInvalidQuantityModal && (
        <div
          className="invalid-quantity-overlay"
          onClick={() => setShowInvalidQuantityModal(false)}
        >
          <div
            className="invalid-quantity-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invalid-quantity-icon">!</div>

            <h3>Invalid Quantity</h3>

            <p>Please enter a valid quantity greater than 0.</p>

            <button
              type="button"
              onClick={() => setShowInvalidQuantityModal(false)}
            >
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

/* ================= MAIN STOREFRONT CONTENT ================= */

function LandingPageContent() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${BACKEND_URL}/api/products`);
        if (!response.ok) throw new Error("Failed to fetch products");
        const data = await response.json();
        setProducts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

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
          minPrice={minPrice}
          maxPrice={maxPrice}
          setMinPrice={setMinPrice}
          setMaxPrice={setMaxPrice}
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
                <div>Loading items...</div>
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
