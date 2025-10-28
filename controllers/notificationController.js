const Order = require('../models/Order');

exports.staffNotifications = async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  const interval = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);
  }, 15000);

  const changeStream = Order.watch();

  changeStream.on('change', async (change) => {
    if (change.operationType === 'insert') {
      const order = change.fullDocument;
      res.write(`event: newOrder\n`);
      res.write(`data: ${JSON.stringify({
        message: `Order #${order._id} placed by ${order.userInfoSnapshot?.firstName || 'Customer'}.`,
      })}\n\n`);
    }

    if (
      change.operationType === 'update' &&
      change.updateDescription.updatedFields.status === 'Pending Cancellation'
    ) {
      const order = await Order.findById(change.documentKey._id);
      res.write(`event: cancelRequest\n`);
      res.write(`data: ${JSON.stringify({
        message: `Order #${order._id} requested cancellation.`,
      })}\n\n`);
    }
  });

  req.on('close', () => {
    clearInterval(interval);
    changeStream.close();
  });
};

exports.getPendingOrders = async (req, res) => {
  try {
    const pendingOrders = await Order.find({
      status: { $in: ['Pending', 'Pending Cancellation'] },
    })
      .sort({ createdAt: -1 })
      .select('_id status userInfoSnapshot createdAt');

    res.json(pendingOrders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending orders' });
  }
};
