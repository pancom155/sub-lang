const Order = require('../models/Order');
const Product = require('../models/Product');

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

exports.staffOrders = async (req, res) => {
  try {
    const pendingPage = parseInt(req.query.pendingPage) || 1;
    const completedPage = parseInt(req.query.completedPage) || 1;
    const limit = 10;

    const totalPending = await Order.countDocuments({ status: { $in: ['Pending', 'Processing'] } });
    const orders = await Order.find({ status: { $in: ['Pending', 'Processing'] } })
      .populate('userInfoSnapshot')
      .populate('items.productId')
      .sort({ createdAt: -1 })
      .skip((pendingPage - 1) * limit)
      .limit(limit);
    const totalPagesPending = Math.ceil(totalPending / limit) || 1;

    const totalCompleted = await Order.countDocuments({ status: 'Completed' });
    const completedOrders = await Order.find({ status: 'Completed' })
      .populate('userInfoSnapshot')
      .populate('items.productId')
      .sort({ createdAt: -1 })
      .skip((completedPage - 1) * limit)
      .limit(limit);
    const totalPagesCompleted = Math.ceil(totalCompleted / limit) || 1;

    res.render('staff/orders', {
      orders,
      completedOrders,
      currentPendingPage: pendingPage,
      totalPagesPending,
      currentCompletedPage: completedPage,
      totalPagesCompleted
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching orders');
  }
};

