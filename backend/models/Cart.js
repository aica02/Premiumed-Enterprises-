import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  itemCode: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  itemImage: {
    type: String
  },
  category: {
    type: String,
    default: ""
  },
  unitType: {
    type: String,
    default: ""
  },
  price: { type: Number, default: 0 }
}, { _id: false });

const cartSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true, 
    index: true
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// COMMENT OUT ALL MIDDLEWARE FOR NOW
// cartSchema.pre('save', function(next) {
//   try {
//     this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
//     this.updatedAt = Date.now();
//     next();
//   } catch (error) {
//     next(error);
//   }
// });

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;