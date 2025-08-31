const mongoose = require('mongoose');

const damageLogSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: Number,
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DamageLog', damageLogSchema);
