const mongoose = require('mongoose');

const loyaltySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    points: {
      type: Number,
      default: 0,
      min: 0,
    },
    tier: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'Platinum'],
      default: 'Bronze',
    },

    discountRate: {
      type: Number,
      default: 0, 
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },

    history: [
      {
        date: { type: Date, default: Date.now },
        pointsChanged: Number,
        reason: String,
      },
    ],
  },
  { timestamps: true }
);

loyaltySchema.pre('save', function (next) {
  if (this.points >= 2000) {
    this.tier = 'Platinum';
    this.discountRate = 20;
  } else if (this.points >= 1000) {
    this.tier = 'Gold';
    this.discountRate = 15;
  } else if (this.points >= 500) {
    this.tier = 'Silver';
    this.discountRate = 10;
  } else {
    this.tier = 'Bronze';
    this.discountRate = 0;
  }

  this.lastUpdated = Date.now();
  next();
});

module.exports = mongoose.model('Loyalty', loyaltySchema);
