const Order = require('../models/Order');
const Review = require('../models/Review');
const Product = require('../models/Product');
const User = require('../models/User');

// Process an order
exports.processOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    if (order.status !== 'Pending') {
      return res.status(400).send('Order is not in a state that can be processed');
    }

    order.status = 'Processing';
    await order.save();

    res.redirect('/staff/orders');
  } catch (error) {
    console.error('Error processing order:', error);
    res.status(500).send('Error processing order');
  }
};

// Display staff orders
exports.staffOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    // Fetch Pending and Processing orders (not paginated)
    const orders = await Order.find({ status: { $in: ['Pending', 'Processing'] } })
      .populate('user')
      .populate('items.product');

    // Fetch Completed orders (paginated)
    const completedOrders = await Order.find({ status: 'Completed' })
      .populate('user')
      .populate('items.product')
      .sort({ completedAt: -1 }) // latest first
      .skip(skip)
      .limit(limit);

    // Count total completed orders for pagination
    const totalCompleted = await Order.countDocuments({ status: 'Completed' });
    const totalPages = Math.ceil(totalCompleted / limit);

    // Render view with orders and pagination metadata
    res.render('staff/orders', {
      orders,
      completedOrders,
      currentPage: page,
      totalPages
    });

  } catch (err) {
    console.error('Error in staffOrders:', err);
    res.status(500).send('Internal Server Error');
  }
};


// Cancel an order
exports.cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    // Ensure that the order status is updated to 'Cancelled' only if it's in 'Pending' or 'Processing' state
    if (order.status === 'Completed') {
      return res.status(400).send('Completed orders cannot be cancelled');
    }

    order.status = 'Cancelled';
    await order.save();

    res.redirect('/staff/orders');
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).send('Error cancelling order');
  }
};

// View completed orders history
exports.completeOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId).populate('items.product');

    if (!order) return res.status(404).send('Order not found');

    if (order.status !== 'Processing') {
      return res.status(400).send('Only orders in "Processing" status can be completed');
    }

    // Optional: Update stock or sales here if needed
    for (const item of order.items) {
      const product = item.product;
      if (product) {
        product.stock = product.stock - item.quantity;
        product.totalSold = (product.totalSold || 0) + item.quantity;
        await product.save();
      }
    }

    order.status = 'Completed';
    await order.save();

    res.redirect('/staff/orders');
  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).send('Error completing order');
  }
};

// View all reviews related to an order
exports.viewReviews = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (!order) return res.status(404).send('Order not found');

    // Fetch all reviews for the order
    const reviews = await Review.find({ orderId: orderId })
      .populate('productId')
      .populate('userId');
    
    res.render('staff/reviews', { reviews, order });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).send('Error fetching reviews');
  }
};

// Approve a review
exports.approveReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).send('Review not found');
    }

    // Update review status to 'Approved'
    review.status = 'Approved';
    await review.save();

    res.redirect('/staff/orders');
  } catch (error) {
    console.error('Error approving review:', error);
    res.status(500).send('Error approving review');
  }
};

// Reject a review
exports.rejectReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).send('Review not found');
    }

    // Update review status to 'Rejected'
    review.status = 'Rejected';
    await review.save();

    res.redirect('/staff/orders');
  } catch (error) {
    console.error('Error rejecting review:', error);
    res.status(500).send('Error rejecting review');
  }
};

// Delete a review
exports.deleteReview = async (req, res) => {
  try {
    const reviewId = req.params.id;
    const review = await Review.findByIdAndDelete(reviewId);

    if (!review) {
      return res.status(404).send('Review not found');
    }

    res.redirect('/staff/orders');
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).send('Error deleting review');
  }
};
