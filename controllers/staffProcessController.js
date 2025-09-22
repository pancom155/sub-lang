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
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).send('Order not found');

    if (order.status === 'Cancelled') {
      return res.status(400).send('Order already cancelled');
    }

    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.stock += item.quantity;
        await product.save();
      }
    }

    order.status = 'Cancelled';
    await order.save();

    res.redirect('/staff/orders');
  } catch (err) {
    console.error('Error cancelling order:', err);
    res.status(500).send('Failed to cancel order');
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
