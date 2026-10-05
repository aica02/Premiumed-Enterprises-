import axios from 'axios';
import { BACKEND_URL } from '../config';

const API_URL = `${BACKEND_URL}/api/cart`;

const CartService = {
async addToCart(item, quantity = 1) {
  const username = localStorage.getItem('username');
  const token = localStorage.getItem('token');
  
  if (!username || username === 'guest') {
    throw new Error('Please login to add items to cart');
  }

  const cartItem = {
    itemCode: item.itemCode || item._id,
    name: item.name,
    quantity: quantity,
    itemImage: item.itemImage || item.image || '',
    unitType: item.unitType || '',
    category: item.category || '',
    price: Number(item.price) || 0 
  };

  const response = await axios.post(
    `${BACKEND_URL}/api/cart/add`,
    { 
      username, 
      item: cartItem 
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Username': username
      }
    }
  );
  
  return response.data;
},

  // Fetch cart
async fetchCart() {
  const username = localStorage.getItem('username');
  const token = localStorage.getItem('token');
  
  if (!username || username === 'guest') {
    return [];
  }


  const response = await axios.get(
    `${BACKEND_URL}/api/cart/${username}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Username': username
      }
    }
  );
  
  
  return response.data.cart.items.map(item => ({
    ...item,
    price: Number(item.price) || 0
  }));
},

  // Update quantity
  async updateQuantity(itemCode, quantity) {
    const username = localStorage.getItem('username');
    const token = localStorage.getItem('token');

    const response = await axios.put(
      `${BACKEND_URL}/api/cart/update`,
      { username, itemCode, quantity },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Username': username
        }
      }
    );
    
    return response.data;
  },

  // Remove item
  async removeItem(itemCode) {
    const username = localStorage.getItem('username');
    const token = localStorage.getItem('token');

    const response = await axios.delete(
      `${BACKEND_URL}/api/cart/remove`,
      {
        data: { username, itemCode },
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Username': username
        }
      }
    );
    
    return response.data;
  },

  // Sync local cart with server
  async syncCart(localItems) {
    const username = localStorage.getItem('username');
    const token = localStorage.getItem('token');

    const response = await axios.post(
      `${BACKEND_URL}/api/cart/sync`,
      { username, localItems },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Username': username
        }
      }
    );
    
    return response.data;
  }
};
export default CartService;