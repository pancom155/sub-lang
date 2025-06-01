const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  productImage: {
    type: String,  
    required: true
  },
  price: { type: Number, required: true, min: 0 },
  stock: { 
    type: Number, 
    required: true, 
    min: 1, 
    validate: {
      validator: function(v) {
        return v >= 1;
      },
      message: props => `${props.value} is not a valid stock quantity! Stock must be at least 1.`
    }
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
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
