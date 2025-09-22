const Product = require('../models/Product');
const Review = require('../models/Review');

exports.getHomePage = async (req, res) => {
  try {
    const products = await Product.find();
    const noProducts = products.length === 0;
    const productReviews = await Review.find({ productId: { $ne: null } })
      .populate('userId', 'firstName lastName')
      .populate('productId', 'productName productImage')
      .sort({ createdAt: -1 });
    const orderReviews = await Review.find({ orderId: { $ne: null } })
      .populate('userId', 'firstName lastName')
      .populate({
        path: 'orderId',
        populate: {
          path: 'items.productId',
          model: 'Product',
          select: 'productName productImage'
        }
      })
      .sort({ createdAt: -1 }); 
    const productRatings = productReviews.map(r => r.rating);
    const orderRatings = orderReviews.map(r => r.rating);
    const productAvgRating = productRatings.length
      ? (productRatings.reduce((a, b) => a + b, 0) / productRatings.length).toFixed(1)
      : 0;
    const orderAvgRating = orderRatings.length
      ? (orderRatings.reduce((a, b) => a + b, 0) / orderRatings.length).toFixed(1)
      : 0;
    res.render('index', {
      products,
      noProducts,
      productReviews,
      orderReviews,
      productAvgRating,
      orderAvgRating
    });
  } catch (error) {
    console.error('Error loading homepage:', error);
    res.status(500).send('Server error while loading homepage');
  }
};
