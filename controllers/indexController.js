const Product = require('../models/Product');

exports.renderHome = async (req, res) => {
  try {
    const products = await Product.find().limit(8);
    const noProducts = products.length === 0;
    res.render('index', { products, noProducts });
  } catch (error) {
    console.error('Error loading products:', error);
    res.status(500).send('Server error while loading homepage');
  }
};
