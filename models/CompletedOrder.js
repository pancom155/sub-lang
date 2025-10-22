const mongoose = require('mongoose');

const completedOrderSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  userInfoSnapshot: {
    type: Object,
    required: true
  },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number,
    price: Number
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  paymentMode: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: 'completed'
  }
}, { timestamps: true });

const CompletedOrder = mongoose.model('CompletedOrder', completedOrderSchema);

module.exports = CompletedOrder;
