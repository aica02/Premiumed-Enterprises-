import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
  {
    itemCode: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    itemImage: { type: String },
    category: { type: String, default: "" },
    unitType: { type: String, default: "" },
    price: { type: Number, default: 0 },

    // NEW:
    orderMode: { type: String, enum: ["box", "piece"], default: "piece" },
    boxes: { type: Number, default: 0, min: 0 },
    quantityPerBox: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  items: [cartItemSchema],
  totalItems: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;