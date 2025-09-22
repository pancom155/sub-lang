const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

exports.showUserReviews = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).lean();

    const orders = await Order.find({ user: userId, status: 'Completed' })
      .populate('items.productId')
      .sort({ createdAt: -1 })
      .lean();

    for (const order of orders) {
      const orderReview = await Review.findOne({
        orderId: order._id,
        userId,
        productId: null
      });

      order.orderReviewed = !!orderReview;

      for (const item of order.items) {
        if (item.productId) {
          const productReview = await Review.findOne({
            orderId: order._id,
            productId: item.productId._id,
            userId
          });

          item.productName = item.productId.productName || item.productId.name || "Unnamed Product";
          item.productImage = item.productId.productImage || "/images/no-image.png";
          item.reviewed = !!productReview;
          item.productIdValue = item.productId._id;
        } else {
          item.productName = "Unknown Product";
          item.productImage = "/images/no-image.png";
          item.reviewed = false;
          item.productIdValue = null;
        }
      }
    }

    res.render('reviews', {
      user,   
      orders,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Error loading user reviews:', err);
    res.status(500).send('Server error');
  }
};


exports.submitUserReview = async (req, res) => {
  try {
    const { rating, comment, orderId, productId } = req.body;
    const userId = req.session.userId;

    if (!rating || !comment || rating < 1 || rating > 5) {
      return res.redirect(`/reviews?error=Invalid review input`);
    }

    const order = await Order.findOne({
      _id: orderId,
      user: userId,
      status: 'Completed'
    });

    if (!order) {
      return res.redirect(`/reviews?error=You cannot review this order`);
    }

    const existingReview = await Review.findOne({
      orderId,
      productId: productId || null,
      userId
    });

    if (existingReview) {
      return res.redirect(`/reviews?error=You already reviewed this ${productId ? 'product' : 'order'}`);
    }

    const review = new Review({
      orderId,
      productId: productId || null,
      userId,
      rating,
      comment
    });
    await review.save();

    if (productId) {
      await Product.findByIdAndUpdate(productId, { $push: { reviews: review._id } });
    }

    res.redirect(`/reviews?success=Review submitted successfully`);
  } catch (error) {
    console.error('Error submitting review:', error);
    res.redirect(`/reviews?error=Error submitting review`);
  }
};
