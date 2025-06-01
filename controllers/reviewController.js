const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');

exports.showPage = (req, res) => {
  res.render('reviews', {
    product: { productName: 'Unknown Product' }, 
    reviews: [],
    userHasPurchased: false,
    error: null,
    success: null
  });
};

exports.showReviews = async (req, res) => {
  const productId = req.params.productId;
  const userId = req.session.userId;

  try {
    const hasCompletedOrder = await Order.findOne({
      userId,
      status: 'completed',
      'products.productId': productId
    });

    const product = await Product.findById(productId).lean();
    const reviews = await Review.find({ productId }).populate('userId').lean();

    if (!product) {
      return res.status(404).send('Product not found');
    }

    res.render('reviews', {
      product,
      reviews,
      userHasPurchased: !!hasCompletedOrder,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

exports.submitReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.productId;
    const userId = req.session.userId;

    const order = await Order.findOne({
      userId,
      'products.productId': productId,
      status: 'completed'
    });

    if (!order) {
      return res.redirect(`/product/${productId}/reviews?error=You must complete an order for this product to leave a review`);
    }

    if (!rating || !comment || rating < 1 || rating > 5 || comment.length < 5) {
      return res.redirect(`/product/${productId}/reviews?error=Invalid input`);
    }

    const review = new Review({ productId, userId, rating, comment });
    await review.save();

    res.redirect(`/product/${productId}/reviews?success=Review submitted successfully`);
  } catch (error) {
    console.error(error);
    res.redirect(`/product/${req.params.productId}/reviews?error=Error submitting review`);
  }
};
