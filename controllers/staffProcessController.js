const Order = require('../models/Order');
const CompletedOrder = require('../models/CompletedOrder');
const Product = require('../models/Product');

exports.staffOrders = async (req, res) => {
  if (!req.session.user || !req.session.user.email.endsWith('@staff.com')) {
    return res.redirect('/login');
  }

  try {
    const orders = await Order.find({
      status: { $in: ['Pending', 'Processing'] }
    }).populate('items.productId');

    const completedOrders = await CompletedOrder.find().populate('items.productId');

    res.render('staff/orders', { 
      user: req.session.user,
      orders, 
      completedOrders 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving orders');
  }
};

exports.processOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).send('Order not found');

    order.status = 'Processing';
    await order.save();

    res.redirect('/staff/orders');
  } catch (err) {
    console.error('Error processing order:', err);
    res.status(500).send('Failed to process order');
  }
};

exports.completeOrder = async (req, res) => {
  const orderId = req.params.orderId;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    const completedOrder = new CompletedOrder({
      orderId: order._id,
      userInfoSnapshot: order.userInfoSnapshot,
      items: order.items,
      totalAmount: order.totalAmount,
      paymentMode: order.paymentMode,
      status: 'Completed',
      createdAt: new Date(),
    });

    await completedOrder.save();
    order.status = 'Completed';
    await order.save();

    res.redirect('/staff/orders');
  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).send('Error completing order');
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('items.productId');
    if (!order) return res.status(404).send('Order not found');

    if (order.status === 'Cancelled') {
      return res.status(400).json({ message: 'Order already cancelled' });
    }

    // Restore stock and collect info
    const stockBatches = [];
    for (const item of order.items) {
      const product = item.productId;
      if (product) {
        product.stock += item.quantity;
        await product.save();

        stockBatches.push({
          productId: product._id,
          productName: product.productName,
          restoredQuantity: item.quantity,
          newStock: product.stock
        });
      }
    }

    // Cancel the order
    order.status = 'Cancelled';
    order.cancellationApprovedAt = new Date();
    await order.save();

    // Return JSON with order info and stock batches
    res.json({
      message: 'Order cancelled and stock restored successfully',
      orderId: order._id,
      stockBatches
    });

  } catch (err) {
    console.error('Error cancelling order:', err);
    res.status(500).json({ message: 'Failed to cancel order' });
  }
};

exports.viewAllOrders = async (req, res) => {
  try {
    const allOrders = await Order.find();
    res.render('staff/orders', { orders: allOrders });
  } catch (err) {
    console.error('Error fetching all orders:', err);
    res.status(500).send('Failed to fetch all orders');
  }
};

exports.viewOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('items.product');
    if (!order) return res.status(404).send('Order not found');
    res.render('staff/orderDetails', { order });
  } catch (err) {
    console.error('Error fetching order details:', err);
    res.status(500).send('Failed to fetch order details');
  }
};

exports.staffDashboard = async (req, res) => {
  if (!req.session.user || !req.session.user.email.endsWith('@staff.com')) {
    return res.redirect('/login');
  }

  try {
    const pendingOrdersCount = await Order.countDocuments({ status: 'Pending' });
    const processingOrdersCount = await Order.countDocuments({ status: 'Processing' });
    const cancelledOrdersCount = await Order.countDocuments({ status: 'Cancelled' });
    const completedOrdersCount = await CompletedOrder.countDocuments();

    const totalProducts = await Product.countDocuments();
    const outOfStockProducts = await Product.countDocuments({ stock: 0 });
    const lowStockProducts = await Product.countDocuments({ stock: { $lte: 5, $gt: 0 } });

    res.render("staff/index", {
      user: req.session.user,
      pendingOrdersCount,
      processingOrdersCount,
      cancelledOrdersCount,
      completedOrdersCount,
      totalProducts,
      outOfStockProducts,
      lowStockProducts
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving data");
  }
};

exports.viewCancellationRequests = async (req, res) => {
  // Ensure only staff can access
  if (!req.session.user || !req.session.user.email.endsWith('@staff.com')) {
    return res.redirect('/login');
  }

  try {
    // Fetch orders with pending cancellation
    const cancellations = await Order.find({ status: 'Pending Cancellation' })
      .populate('userInfoSnapshot')          // include user info
      .populate('items.productId')           // include product name & image
      .select('cancellationReason cancellationRequestedAt items netTotal userInfoSnapshot') // ensure fields are included
      .sort({ cancellationRequestedAt: -1 });

    // Render staff void page
    res.render('staff/void', {
      user: req.session.user,
      cancellations
    });

  } catch (err) {
    console.error('Error fetching cancellation requests:', err);
    res.status(500).send('Server error');
  }
};

exports.approveCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('items.productId');

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'Pending Cancellation')
      return res.status(400).json({ message: 'No pending cancellation request' });

    const restoredBatches = [];

    for (const item of order.items) {
      const product = item.productId;
      if (!product) continue;

      let remaining = item.quantity;

      // Sort batches by expiration (earliest first)
      const batches = product.stockBatches
        .filter(b => b.expirationDate > new Date())
        .sort((a, b) => a.expirationDate - b.expirationDate);

      for (const batch of batches) {
        if (remaining <= 0) break;
        batch.quantity += remaining;
        restoredBatches.push({
          productId: product._id,
          productName: product.productName,
          restoredQuantity: remaining,
          batchExpiration: batch.expirationDate,
          newBatchQty: batch.quantity
        });
        remaining = 0; // all restored
      }

      // If no unexpired batches exist, create a new batch
      if (remaining > 0) {
        const newBatch = {
          quantity: remaining,
          expirationDate: new Date(new Date().setMonth(new Date().getMonth() + 6)) // default 6 months
        };
        product.stockBatches.push(newBatch);
        restoredBatches.push({
          productId: product._id,
          productName: product.productName,
          restoredQuantity: remaining,
          batchExpiration: newBatch.expirationDate,
          newBatchQty: newBatch.quantity
        });
      }

      await product.save();
    }

    order.status = 'Cancelled';
    order.cancellationApprovedAt = new Date();
    await order.save();

    res.json({
      message: 'Cancellation approved and stockBatches restored',
      restoredBatches,
      orderId: order._id
    });
  } catch (err) {
    console.error('Error approving cancellation:', err);
    res.status(500).json({ message: 'Server error approving cancellation' });
  }
};

// REJECT CANCELLATION (proof mismatch)
exports.rejectCancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    if (order.status !== 'Pending Cancellation') {
      return res.status(400).send('No pending cancellation request');
    }

    order.status = 'Pending'; // revert back to pending
    order.cancellationRejectedAt = new Date();
    order.cancellationRejectionReason = 'Proof of payment mismatch';
    order.cancellationReason = '';
    order.cancellationRequestedAt = null;

    await order.save();

    res.redirect('/staff/void');
  } catch (err) {
    console.error('Error rejecting cancellation:', err);
    res.status(500).send('Server error while rejecting cancellation');
  }
};