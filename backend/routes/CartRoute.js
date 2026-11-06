import { Router } from "express";
import mongoose from "mongoose";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import {
  canClientSee,
  normalizeUsername,
  RESERVED_SUPPLY_MESSAGE,
} from "../utils/productAccess.js";

const router = Router();

// Cart items store an itemCode, which older carts may have filled with the
// product _id instead. Look products up both ways.
const findProductsForCodes = async (codes) => {
  const unique = [...new Set(codes.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const ids = unique.filter((c) => mongoose.isValidObjectId(c));
  const products = await Product.find({
    $or: [{ itemCode: { $in: unique } }, ...(ids.length ? [{ _id: { $in: ids } }] : [])],
  })
    .select("_id itemCode reservedFor")
    .lean();
  const byCode = new Map();
  for (const p of products) {
    if (p.itemCode) byCode.set(String(p.itemCode), p);
    byCode.set(String(p._id), p);
  }
  return byCode;
};

// Codes in the list that belong to supplies reserved for someone else.
// Checked against the cart's owner, since that is whose cart gets changed.
const findBlockedCodes = async (codes, username) => {
  const byCode = await findProductsForCodes(codes);
  return codes.filter((code) => {
    const product = byCode.get(String(code));
    return product && !canClientSee(product, username);
  });
};

// Helper function to update cart totals
const updateCartTotals = async (cart) => {
  cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  cart.updatedAt = Date.now();
  return cart;
};

// Get user's cart
router.get("/:username", async (req, res) => {
  try {
    const { username } = req.params;

    let cart = await Cart.findOne({ username });
    let removedReservedItems = [];

    if (!cart) {
      cart = new Cart({ username, items: [] });
      await updateCartTotals(cart);
      await cart.save();
    } else if (cart.items.length > 0) {
      // A supply reserved after it was added to this cart must not stay orderable.
      const blocked = await findBlockedCodes(
        cart.items.map((i) => i.itemCode),
        normalizeUsername(username),
      );
      if (blocked.length > 0) {
        removedReservedItems = cart.items
          .filter((i) => blocked.includes(i.itemCode))
          .map((i) => i.name || i.itemCode);
        cart.items = cart.items.filter((i) => !blocked.includes(i.itemCode));
        await updateCartTotals(cart);
        await cart.save();
      }
    }

    res.json({
      success: true,
      cart: cart,
      // Names of items dropped because they are now reserved for another client.
      removedReservedItems,
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/add", async (req, res) => {
  try {
    const { username, item } = req.body;
    if (!username || !item) {
      return res.status(400).json({ message: "username and item required" });
    }

    let cart = await Cart.findOne({ username });
    if (!cart) {
      cart = new Cart({ username, items: [] });
    }

    const incomingCode = item.itemCode || item._id;

    const blocked = await findBlockedCodes(
      [incomingCode],
      normalizeUsername(username),
    );
    if (blocked.length > 0) {
      return res.status(403).json({
        success: false,
        message: RESERVED_SUPPLY_MESSAGE,
        error: RESERVED_SUPPLY_MESSAGE,
      });
    }

    const orderMode = item.orderMode === "box" ? "box" : "piece";
    const quantityPerBox = Number(item.quantityPerBox) || 0;
    const boxes = orderMode === "box" ? Number(item.boxes) || 0 : 0;

    const effectiveQty =
      orderMode === "box"
        ? boxes * quantityPerBox
        : Number(item.quantity) || 1;

    const existingIdx = cart.items.findIndex(
      (i) => i.itemCode === incomingCode
    );

    if (existingIdx > -1) {
      const existing = cart.items[existingIdx];

      // If the mode changed, replace the values cleanly
      if (existing.orderMode !== orderMode) {
        existing.orderMode = orderMode;
        existing.boxes = boxes;
        existing.quantityPerBox = quantityPerBox;
        existing.quantity = effectiveQty;
      } else {
        // Same mode: add up
        if (orderMode === "box") {
          existing.boxes = (existing.boxes || 0) + boxes;
          existing.quantityPerBox = quantityPerBox || existing.quantityPerBox;
          existing.quantity = existing.boxes * existing.quantityPerBox;
        } else {
          existing.quantity = (existing.quantity || 0) + effectiveQty;
        }
      }

      // update image/name/category/unitType/price in case product changed
      existing.name = item.name;
      existing.itemImage = item.itemImage || existing.itemImage;
      existing.category = item.category || existing.category;
      existing.unitType = item.unitType || existing.unitType;
      existing.price = Number(item.price) || existing.price;
    } else {
      cart.items.push({
        itemCode: incomingCode,
        name: item.name,
        quantity: effectiveQty,
        itemImage: item.itemImage || "",
        category: item.category || "",
        unitType: item.unitType || "",
        price: Number(item.price) || 0,
        orderMode,
        boxes,
        quantityPerBox,
      });
    }

    cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    cart.updatedAt = Date.now();
    await cart.save();

    res.json({ success: true, cart });
  } catch (err) {
    console.error("add to cart error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Update item quantity
router.put("/update", async (req, res) => {
  try {
    const { username, itemCode, quantity, orderMode, boxes, quantityPerBox } =
      req.body;
    if (!username || !itemCode) {
      return res.status(400).json({ message: "username and itemCode required" });
    }

    const cart = await Cart.findOne({ username });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const item = cart.items.find((i) => i.itemCode === itemCode);
    if (!item) return res.status(404).json({ message: "Item not in cart" });

    // If mode is provided, apply it
    if (orderMode === "box" || orderMode === "piece") {
      item.orderMode = orderMode;
    }
    if (typeof quantityPerBox === "number" && quantityPerBox > 0) {
      item.quantityPerBox = quantityPerBox;
    }

    if (item.orderMode === "box") {
      const newBoxes = Number(boxes);
      if (Number.isFinite(newBoxes) && newBoxes > 0) {
        item.boxes = newBoxes;
        item.quantity = newBoxes * (item.quantityPerBox || 0);
      }
    } else {
      const newQty = Number(quantity);
      if (Number.isFinite(newQty) && newQty > 0) {
        item.quantity = newQty;
        item.boxes = 0;
      }
    }

    cart.totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    cart.updatedAt = Date.now();
    await cart.save();

    res.json({ success: true, cart });
  } catch (err) {
    console.error("update cart error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Remove item from cart
router.delete("/remove", async (req, res) => {
  try {
    const { username, itemCode } = req.body;

    if (!username || !itemCode) {
      return res.status(400).json({
        success: false,
        error: "Username and itemCode are required",
      });
    }

    const cart = await Cart.findOne({ username });

    if (!cart) {
      return res.status(404).json({
        success: false,
        error: "Cart not found",
      });
    }

    const itemIndex = cart.items.findIndex((i) => i.itemCode === itemCode);

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Item not found in cart",
      });
    }

    cart.items.splice(itemIndex, 1);

    // Manually update totals before saving
    await updateCartTotals(cart);
    await cart.save();

    res.json({
      success: true,
      cart: cart,
      message: "Item removed from cart successfully",
    });
  } catch (error) {
    console.error("Error removing from cart:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Clear user's cart
router.delete("/clear/:username", async (req, res) => {
  try {
    const { username } = req.params;

    const cart = await Cart.findOne({ username });

    if (cart) {
      cart.items = [];
      // Manually update totals before saving
      await updateCartTotals(cart);
      await cart.save();
    }

    res.json({
      success: true,
      cart: { items: [] },
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Sync local cart with server
router.post("/sync", async (req, res) => {
  try {
    const { username, localItems } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required",
      });
    }

    let cart = await Cart.findOne({ username });

    if (!cart) {
      cart = new Cart({ username, items: [] });
    }

    let removedReservedItems = [];
    if (localItems && Array.isArray(localItems)) {
      const blocked = await findBlockedCodes(
        localItems.map((i) => i.itemCode),
        normalizeUsername(username),
      );
      removedReservedItems = localItems
        .filter((localItem) => blocked.includes(localItem.itemCode))
        .map((localItem) => localItem.name || localItem.itemCode);
      localItems
        .filter((localItem) => !blocked.includes(localItem.itemCode))
        .forEach((localItem) => {
        const existingIndex = cart.items.findIndex(
          (i) => i.itemCode === localItem.itemCode,
        );

        if (existingIndex > -1) {
          cart.items[existingIndex].quantity += localItem.quantity;
        } else {
          cart.items.push({
            itemCode: localItem.itemCode,
            name: localItem.name,
            quantity: localItem.quantity,
            itemImage: localItem.itemImage || "",
            category: localItem.category || "",
            unitType: localItem.unitType || "",
            price: localItem.price || 0,
          });
        }
      });
    }

    // Manually update totals before saving
    await updateCartTotals(cart);
    await cart.save();

    res.json({
      success: true,
      cart: cart,
      removedReservedItems,
      message: "Cart synced successfully",
    });
  } catch (error) {
    console.error("Error syncing cart:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
