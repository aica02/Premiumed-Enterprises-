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
      return res.status(400).json({
        success: false,
        error: "Username and item are required",
      });
    }

    const quantity = Number(item.quantity);
    const price = Number(item.price) || 0;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be a valid positive number",
      });
    }

    let cart = await Cart.findOne({ username });

    if (!cart) {
      cart = new Cart({
        username,
        items: [],
      });
    }

    const existingItemIndex = cart.items.findIndex(
      (i) => i.itemCode === item.itemCode,
    );

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].price = price;

      if (item.unitType !== undefined) {
        cart.items[existingItemIndex].unitType = item.unitType;
      }

      if (item.itemImage !== undefined) {
        cart.items[existingItemIndex].itemImage = item.itemImage;
      }

      if (item.category !== undefined) {
        cart.items[existingItemIndex].category = item.category;
      }
    } else {
      cart.items.push({
        itemCode: item.itemCode,
        name: item.name,
        quantity,
        itemImage: item.itemImage || "",
        category: item.category || "",
        unitType: item.unitType || "",
        price,
      });
    }

    await updateCartTotals(cart);
    await cart.save();

    res.json({
      success: true,
      cart,
      message: "Item added to cart successfully",
    });
  } catch (error) {
    console.error("Error adding to cart:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Update item quantity
router.put("/update", async (req, res) => {
  try {
    const { username, itemCode, quantity } = req.body;

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

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    // Manually update totals before saving
    await updateCartTotals(cart);
    await cart.save();

    res.json({
      success: true,
      cart: cart,
      message: "Cart updated successfully",
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
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
