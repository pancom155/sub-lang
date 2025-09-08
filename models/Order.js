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
    enum: ['COD', 'Pickup', 'GCash'],  // ✅ Added GCash
    required: true 
  },

  noteToCashier: {
    type: String,
    default: ''
  },

  // Proof fields (required if Pickup OR GCash)
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

// ✅ Pre-save hook: snapshot user, calculate total, decrease stock
orderSchema.pre('save', async function(next) {
  try {
    const User = mongoose.model('User');
    const Product = mongoose.model('Product');

    // Snapshot user info
    const user = await User.findById(this.user);
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

    let total = 0;

    for (const item of this.items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return next(new Error('Product not found'));
      }

      if (product.stock < item.quantity) {
        return next(new Error(`Not enough stock for ${product.productName}`));
      }

      // Decrease stock
      product.stock -= item.quantity;
      await product.save();

      // Add to total
      total += product.price * item.quantity;
    }

    this.totalAmount = total;

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
