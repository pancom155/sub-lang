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
    enum: ['COD', 'Pickup'], 
    required: true 
  },

  noteToCashier: {
    type: String,
    default: ''
  },

  pickupProofImage: {
    type: String, 
    required: function() {
      return this.paymentMode === 'Pickup';
    }
  },
  pickupReferenceNumber: {
    type: String,
    required: function() {
      return this.paymentMode === 'Pickup';
    }
  },
  pickupSenderName: {
    type: String,
    required: function() {
      return this.paymentMode === 'Pickup';
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

orderSchema.pre('save', async function(next) {
  const user = await mongoose.model('User').findById(this.user);
  if (user) {
    this.userInfoSnapshot = {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      address: user.address,
      email: user.email,
      username: user.username,
    };
  }

  for (const item of this.items) {
    const product = await mongoose.model('Product').findById(item.productId);
    
    if (!product || product.stock < item.quantity) {
      const error = new Error(`Not enough stock for ${item.productName}`);
      return next(error);
    }
    product.stock -= item.quantity;
    await product.save();  
  }

  this.totalAmount = this.items.reduce((total, item) => total + item.total, 0);
  
  next();
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
