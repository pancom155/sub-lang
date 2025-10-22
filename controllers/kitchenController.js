const Order = require('../models/Order');
const CompletedOrder = require('../models/CompletedOrder');

exports.index = async (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  try {
    const [pendingCount, processingCount, completedCount, processingOrders] = await Promise.all([
      Order.countDocuments({ status: 'Pending', createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ status: 'Processing', createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ status: 'Completed', createdAt: { $gte: startOfToday } }),
      Order.find({ status: 'Processing', createdAt: { $gte: startOfToday } })
        .populate('items.productId')
        .lean()
    ]);

    res.render('kitchen/index', {
      pendingCount,
      processingCount,
      completedCount,
      processingOrders
    });
  } catch (error) {
    console.error('Error loading kitchen dashboard:', error);
    res.status(500).send('Server error');
  }
};

exports.viewKitchenOrders = (req, res) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  Promise.all([
    Order.find({ status: 'Processing', createdAt: { $gte: startOfToday } })
      .populate('items.productId').lean(),
    Order.find({ status: 'Completed', createdAt: { $gte: startOfToday } })
      .populate('items.productId').lean()
  ])
    .then(([processingOrders, completedOrders]) => {
      res.render('kitchen/orders', {
        processingOrders,
        completedOrders
      });
    })
    .catch(err => {
      console.error('Error fetching kitchen orders:', err);
      res.status(500).send('Server Error');
    });
};

exports.completeOrder = async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId).populate('items.productId');
    if (!order) return res.status(404).send('Order not found');
    if (order.status !== 'Processing')
      return res.status(400).send('Only processing orders can be completed');

    order.status = 'Completed';
    await order.save();
    res.redirect('/kitchen/orders');
  } catch (error) {
    console.error('Error completing order:', error);
    res.status(500).send('Error completing order');
  }
};
