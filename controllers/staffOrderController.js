const Order = require('../models/Order');
const Review = require('../models/Review');
const Product = require('../models/Product');

// Process an order
exports.processOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    if (order.status !== 'Pending') return res.status(400).send('Order cannot be processed');

    order.status = 'Processing';
    await order.save();
    res.redirect('/staff/orders');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing order');
  }
};

// Complete an order
exports.completeOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.productId');
    if (!order) return res.status(404).send('Order not found');

    if (order.status !== 'Processing') return res.status(400).send('Only processing orders can be completed');

    for (const item of order.items) {
      const product = item.productId;
      if (product) {
        product.stock -= item.quantity;
        product.totalSold = (product.totalSold || 0) + item.quantity;
        await product.save();
      }
    }

    order.status = 'Completed';
    await order.save();
    res.redirect('/staff/orders');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error completing order');
  }
};

// Cancel an order
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    if (order.status === 'Completed') return res.status(400).send('Cannot cancel completed order');

    order.status = 'Cancelled';
    await order.save();
    res.redirect('/staff/orders');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error cancelling order');
  }
};

// Upload proof of payment
exports.uploadProof = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');

    if (!req.file) {
      req.flash('error', 'No file uploaded');
      return res.redirect('/staff/orders');
    }

    order.proofImage = '/uploads/' + req.file.filename; // path relative to public folder
    order.senderName = req.body.senderName || order.senderName;
    order.referenceNumber = req.body.referenceNumber || order.referenceNumber;
    await order.save();

    req.flash('success', 'Proof uploaded successfully');
    res.redirect('/staff/orders');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error uploading proof');
  }
};

// Display staff orders
exports.staffOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    // Pending & Processing
    const orders = await Order.find({ status: { $in: ['Pending', 'Processing'] } })
      .populate('userInfoSnapshot')
      .populate('items.productId');

    // Completed (paginated)
    const completedOrders = await Order.find({ status: 'Completed' })
      .populate('userInfoSnapshot')
      .populate('items.productId')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCompleted = await Order.countDocuments({ status: 'Completed' });
    const totalPages = Math.ceil(totalCompleted / limit);

    res.render('staff/orders', {
      orders,
      completedOrders,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching orders');
  }
};
