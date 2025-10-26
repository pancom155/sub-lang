const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: { type: String, unique: true, required: true },
  productImage: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  investmentCost: { type: Number, required: true, min: 0, default: 0 },
  sold: { type: Number, default: 0 },
  category: {
    type: String,
    required: true,
    enum: ['Coffee', 'Drinks', 'Snacks', 'Light Bites', 'Desserts']
  },
  reviews: [
    {
      customerName: String,
      comment: String,
      rating: { type: Number, min: 1, max: 5 },
      createdAt: { type: Date, default: Date.now }
    }
  ],

  // Old stock (for products added before batch system)
  oldStock: { type: Number, default: 0 },

  // New stock batches (each has expiration)
  stockBatches: [
    {
      quantity: { type: Number, required: true, min: 0 },
      expirationDate: { type: Date, required: true },
      addedAt: { type: Date, default: Date.now }
    }
  ],

  createdAt: { type: Date, default: Date.now },
  damagedStock: { type: Number, default: 0 },
  lostIncome: { type: Number, default: 0 }
});

// Total stock (old + unexpired batches)
productSchema.virtual('stock').get(function () {
  const now = new Date();
  const batchTotal = this.stockBatches
    .filter(batch => batch.expirationDate > now)
    .reduce((sum, batch) => sum + batch.quantity, 0);
  return this.oldStock + batchTotal;
});

// Handle expired stock automatically
productSchema.pre('save', async function (next) {
  const now = new Date();
  const expiredBatches = this.stockBatches.filter(
    b => b.expirationDate <= now && b.quantity > 0
  );

  let totalExpired = 0;
  for (const b of expiredBatches) {
    totalExpired += b.quantity;
    b.quantity = 0;
  }

  if (totalExpired > 0) {
    this.damagedStock += totalExpired;
    this.lostIncome += totalExpired * this.price;

    const DamageLog = require('./DamageLog');
    await DamageLog.create({
      productId: this._id,
      quantity: totalExpired,
      date: now
    });
  }

  next();
});

productSchema.methods.decreaseStock = async function (quantity) {
  let remaining = quantity;

  if (this.oldStock > 0) {
    const used = Math.min(this.oldStock, remaining);
    this.oldStock -= used;
    remaining -= used;
  }

  const sortedBatches = this.stockBatches
    .filter(b => b.quantity > 0 && b.expirationDate > new Date())
    .sort((a, b) => a.expirationDate - b.expirationDate);

  for (const batch of sortedBatches) {
    if (remaining <= 0) break;
    const used = Math.min(batch.quantity, remaining);
    batch.quantity -= used;
    remaining -= used;
  }

  this.sold += quantity - remaining;
  await this.save();
};

module.exports = mongoose.model('Product', productSchema);
