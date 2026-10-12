import { Router } from "express";
import Cart from "../models/Cart.js";

const router = Router();

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

    if (!cart) {
      cart = new Cart({ username, items: [] });
      await updateCartTotals(cart);
      await cart.save();
    }

    res.json({
      success: true,
      cart: cart,
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

    if (localItems && Array.isArray(localItems)) {
      localItems.forEach((localItem) => {
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
