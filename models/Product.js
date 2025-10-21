const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: { type: String, unique: true, required: true },
  productImage: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stock: { 
    type: Number, 
    required: true, 
    min: 0, 
  },
  sold: { type: Number, default: 0 },
  category: {
    type: String,
    required: true,
    enum: ['Coffee', 'Drinks', 'Snacks', 'Light Bites', 'Desserts'], 
  },
  reviews: [
    {
      customerName: String,
      comment: String,
      rating: { type: Number, min: 1, max: 5 },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now },
  damagedStock: { type: Number, default: 0 },
  lostIncome: { type: Number, default: 0 }
});

productSchema.virtual("isOutOfStock").get(function() {
  return this.stock === 0;
});

module.exports = mongoose.model('Product', productSchema);
