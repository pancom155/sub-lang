const Order = require('../models/Order');
const Product = require('../models/Product');

async function getOrders(req, res) {
  try {
    const orders = await Order.find({ user: req.user._id }).populate('items.productId');

    res.render('order', {
      orders: orders || [],
      message: orders.length === 0 ? "You have no recent orders." : ""
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('order', {
      orders: [],
      message: "An error occurred while fetching your orders."
    });
  }
}

async function createOrder(req, res) {
  const { items, paymentMode } = req.body;

  try {
    const orderItems = await Promise.all(items.map(async item => {
      const product = await Product.findById(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productName}`);
      }

      // Check if enough ingredient stock exists
      for (const ingredient of product.ingredients) {
        const requiredQty = ingredient.quantityRequired * item.quantity;
        if (ingredient.stock < requiredQty) {
          throw new Error(`Insufficient ingredient (${ingredient.name}) stock for ${product.productName}`);
        }
      }

      // Decrease ingredient stocks
      product.ingredients = product.ingredients.map(ingredient => {
        ingredient.stock -= ingredient.quantityRequired * item.quantity;
        return ingredient;
      });

      // Recalculate product stock from ingredients
      product.stock = product.calculateStockFromIngredients();

      // Update sold count
      product.sold += item.quantity;

      await product.save();

      const total = item.quantity * product.price;

      return {
        productId: product._id,
        productName: product.productName,
        size: item.size,
        quantity: item.quantity,
        price: product.price,
        total: total,
      };
    }));

    const newOrder = new Order({
      user: req.user._id,
      items: orderItems,
      paymentMode: paymentMode,
      status: 'Pending',
    });

    await newOrder.save();

    res.status(201).json({ message: 'Order created successfully', order: newOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creating order', details: err.message });
  }
}

module.exports = { getOrders, createOrder };
