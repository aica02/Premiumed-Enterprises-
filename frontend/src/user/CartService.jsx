import axios from "axios";
import { BACKEND_URL } from "../config";

const CartService = {
  async addToCart(item, quantity = 1) {
    const username = localStorage.getItem("username");
    const token = localStorage.getItem("token");

    if (!username || username === "guest") {
      throw new Error("Please login to add items to cart");
    }

    const cartItem = {
      itemCode: item.itemCode || item._id,
      name: item.name,
      quantity: quantity,
      itemImage: item.itemImage || item.image || "",
      unitType: item.unitType || "",
      category: item.category || "",
      price: Number(item.price) || 0,
      orderMode: item.orderMode || "piece",
      boxes: Number(item.boxes) || 0,
      quantityPerBox: Number(item.quantityPerBox) || 0,
    };

    const response = await axios.post(
      `${BACKEND_URL}/api/cart/add`,
      { username, item: cartItem },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Username": username,
        },
      }
    );

    return response.data;
  },

  async fetchCart() {
    const username = localStorage.getItem("username");
    const token = localStorage.getItem("token");

    if (!username || username === "guest") {
      return [];
    }

    const response = await axios.get(`${BACKEND_URL}/api/cart/${username}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Username": username,
      },
    });

    return response.data.cart.items.map((item) => ({
      ...item,
      price: Number(item.price) || 0,
      orderMode: item.orderMode === "box" ? "box" : "piece",
      boxes: Number(item.boxes) || 0,
      quantityPerBox: Number(item.quantityPerBox) || 0,
    }));
  },

  async updateQuantity(itemCode, quantity, orderMode, boxes, quantityPerBox) {
    const username = localStorage.getItem("username");
    const token = localStorage.getItem("token");

    const response = await axios.put(
      `${BACKEND_URL}/api/cart/update`,
      { username, itemCode, quantity, orderMode, boxes, quantityPerBox },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Username": username,
        },
      }
    );

    return response.data;
  },

  async removeItem(itemCode) {
    const username = localStorage.getItem("username");
    const token = localStorage.getItem("token");

    const response = await axios.delete(`${BACKEND_URL}/api/cart/remove`, {
      data: { username, itemCode },
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Username": username,
      },
    });

    return response.data;
  },

  async syncCart(localItems) {
    const username = localStorage.getItem("username");
    const token = localStorage.getItem("token");

    const response = await axios.post(
      `${BACKEND_URL}/api/cart/sync`,
      { username, localItems },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Username": username,
        },
      }
    );

    return response.data;
  },
};

export default CartService;