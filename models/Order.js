const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  quantity: { 
    type: Number, 
    required: true, 
    min: 1 
  },
  price: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  subtotal: { 
    type: Number, 
    required: true, 
    min: 0 
  }
});

const orderSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },

  userInfoSnapshot: { 
    firstName: String, 
    lastName: String, 
    phone: String, 
    address: String, 
    email: String, 
    username: String 
  },

  status: { 
    type: String, 
    enum: ['Pending', 'Processing', 'Cancelled', 'Completed'], 
    default: 'Pending' 
  },
  
  paymentMode: { 
    type: String, 
    enum: ['Pay at the Counter', 'Pickup', 'GCash'], 
    required: true 
  },

  noteToCashier: {
    type: String,
    default: ''
  },

  proofImage: {
    type: String, 
    required: function() {
      return this.paymentMode === 'Pickup' || this.paymentMode === 'GCash';
    }
  },
  referenceNumber: {
    type: String,
    required: function() {
      return this.paymentMode === 'Pickup' || this.paymentMode === 'GCash';
    }
  },
  senderName: {
    type: String,
    required: function() {
      return this.paymentMode === 'Pickup' || this.paymentMode === 'GCash';
    }
  },

  items: [orderItemSchema],

  totalAmount: { 
    type: Number, 
    required: true 
  },

  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
