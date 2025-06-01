const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order'); 
const Staff = require('../models/Staff');
const KitchenStaff = require('../models/KitchenStaff');
const CartItem = require('../models/cartItem');
const axios = require('axios');
const RECAPTCHA_SECRET_KEY = '6LfEI0krAAAAAP7nR6WC35kSkQMUiSpS5QByt8mG';

exports.showLogin = (req, res) => {
  res.render('login', { error: null });
};

exports.showCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = req.session.user;

    if (!userId) return res.redirect('/login');

    const cartItems = await CartItem.find({ user_id: userId })
      .populate('product_id')
      .lean();

    res.render('cart', { user, cartItems });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.render('cart', {
      user: null,
      cartItems: [],
      error: 'Failed to load cart items.'
    });
  }
};

exports.addToCart = async (req, res) => {
  const userId = req.session.userId;
  const { productId, productName, price, stock, productImage, quantity } = req.body;

  if (!userId) {
    return res.status(401).json({ message: 'Please login to add items to the cart' });
  }

  try {
    let cartItem = await CartItem.findOne({ user_id: userId, product_id: productId });

    if (cartItem) {
      cartItem.quantity += quantity;
      if (cartItem.quantity > stock) {
        return res.status(400).json({ message: 'Not enough stock available' });
      }
      await cartItem.save();
    } else {
      cartItem = new CartItem({
        user_id: userId,
        product_id: productId,
        product_name: productName,
        price,
        product_image: productImage,
        quantity
      });
      await cartItem.save();
    }
    const cartCount = await CartItem.countDocuments({ user_id: userId });

    res.json({ message: 'Product added to cart', cartCount });
  } catch (error) {
    console.error('Error adding product to cart:', error);
    res.status(500).json({ message: 'Failed to add product to cart' });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { cartItemId, quantity } = req.body;
    const cartItem = await CartItem.findById(cartItemId);

    if (cartItem) {
      cartItem.quantity = quantity;
      await cartItem.save();
    }

    res.redirect('/cart');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const { cartItemId } = req.body;

    await CartItem.findByIdAndDelete(cartItemId);

    res.redirect('/cart');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
};

exports.checkout = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const cartItems = await CartItem.find({ user_id: userId })
      .populate('product_id')
      .lean();

    if (cartItems.length === 0) return res.redirect('/cart');

    const user = await User.findById(userId);
    if (!user) return res.status(404).send('User not found');

    // Destructure paymentMode and pickup details from req.body
    const { paymentMode, pickupSenderName, pickupReferenceNumber } = req.body;

    let pickupPaymentInfo = null;

    if (paymentMode === 'Pickup') {
      // Check all pickup details are present, including uploaded file in req.file
      if (!pickupSenderName || !pickupReferenceNumber || !req.file) {
        return res.status(400).send('Missing pickup payment details.');
      }

      // Build pickup payment info object
      pickupPaymentInfo = {
        senderName: pickupSenderName,
        referenceNumber: pickupReferenceNumber,
        // multer stores file in 'uploads/proofs/' as per your setup, filename is randomized
        proofImagePath: `/uploads/proofs/${req.file.filename}`
      };
    }

    // Process order using helper function
    const order = await processOrder(cartItems, user, paymentMode, pickupPaymentInfo);

    // Clear cart after successful order
    await CartItem.deleteMany({ user_id: userId });

    // Render order success page with order and user info
    res.render('order-success', { order, user });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing the order.');
  }
};

// Helper to process order and check stock/amounts
async function processOrder(cartItems, user, paymentMode = 'COD', pickupPaymentInfo = null) {
  for (let item of cartItems) {
    const product = await Product.findById(item.product_id._id);
    if (!product || !product.price || item.quantity <= 0) {
      throw new Error('Invalid cart item data');
    }

    if (product.stock < item.quantity) {
      throw new Error(`Not enough stock for product: ${product.productName}`);
    }

    item.total = product.price * item.quantity;
  }

  const totalAmount = cartItems.reduce((total, item) => total + item.total, 0);
  if (isNaN(totalAmount) || totalAmount <= 0) {
    throw new Error('Invalid total order amount');
  }

  const orderData = {
    items: cartItems.map(item => ({
      productId: item.product_id._id,
      quantity: item.quantity,
    })),
    user: user._id,
    paymentMode,
    totalAmount
  };

  if (paymentMode === 'Pickup' && pickupPaymentInfo) {
    orderData.pickupSenderName = pickupPaymentInfo.senderName;
    orderData.pickupReferenceNumber = pickupPaymentInfo.referenceNumber;
    orderData.pickupProofImage = pickupPaymentInfo.proofImagePath;
  }

  const order = new Order(orderData);
  return await order.save();
}


exports.showOrderSuccess = (req, res) => {
  res.render('order-success', { order: req.session.order, user: req.session.user });
};

exports.showOrder = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {  
      return res.redirect('/login');
    }

    const orders = await Order.find({ userId }).lean();
    res.render('order', {
      orders,
      message: orders.length === 0 ? 'You have no recent orders.' : null
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.render('order', {
      orders: [],
      message: 'Something went wrong while loading your orders.'
    });
  }
};

exports.showProfile = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('profile', {
      user,
      orders,
      currentPage: page,
      totalPages,
      error: null
    });

  } catch (error) {
    console.error(error);
    res.render('profile', {
      user: null,
      orders: [],
      currentPage: 1,
      totalPages: 1,
      error: 'Failed to load user profile.'
    });
  }
};

exports.showRegister = (req, res) => {
  res.render('register', { error: req.query.error, success: req.query.success });
};

exports.register = async (req, res) => {
  const { firstName, lastName, phone, address, email, username, password, confirm_password } = req.body;

  if (password !== confirm_password) {
    return res.redirect('/register?error=Passwords do not match');
  }

  try {
    const existingUser = await User.findOne({ $or: [{ email }, { phone }, { username }] });

    if (existingUser) {
      return res.redirect('/register?error=User with this email, phone, or username already exists.');
    }

    const user = new User({ firstName, lastName, phone, address, email, username, password });
    await user.save();

    return res.redirect('/login?success=Registration successful! Please log in.');
  } catch (error) {
    return res.redirect('/register?error=Registration error: ' + encodeURIComponent(error.message));
  }
};

exports.login = async (req, res) => {
  const { email, password, 'g-recaptcha-response': recaptchaResponse } = req.body;

  if (!recaptchaResponse) {
    return res.render('login', { error: 'Please complete the reCAPTCHA verification.' });
  }

  try {
    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${recaptchaResponse}`;
    const response = await axios.post(verificationUrl);
    const { success } = response.data;

    if (!success) {
      return res.render('login', { error: 'Failed reCAPTCHA verification. Please try again.' });
    }

    if (email === 'zerodegreecafe@gmail.com' && password === 'admin12345') {
      req.session.user = { email, role: 'admin' };
      console.log('Admin logged in:', email);
      return res.redirect('/login?success=admin');
    }

    if (email.endsWith('@staff.com')) {
      const staff = await Staff.findOne({ email });
      if (!staff) {
        return res.render('login', { error: 'Invalid staff email or password.' });
      }

      const isMatch = await staff.comparePassword(password);
      if (!isMatch) {
        return res.render('login', { error: 'Invalid staff email or password.' });
      }

      req.session.user = {
        id: staff._id,
        role: 'staff',
        name: `${staff.s_fname} ${staff.s_lname}`,
        email: staff.email
      };
      console.log('Staff logged in:', email);
      return res.redirect('/login?success=staff');
    }

    if (email.endsWith('@kitchen.com')) {
      const kitchenStaff = await KitchenStaff.findOne({ email });
      if (!kitchenStaff) {
        return res.render('login', { error: 'Invalid kitchen staff email or password.' });
      }

      const isMatch = await kitchenStaff.comparePassword(password);
      if (!isMatch) {
        return res.render('login', { error: 'Invalid kitchen staff email or password.' });
      }

      req.session.user = {
        id: kitchenStaff._id,
        role: 'kitchen',
        name: `${kitchenStaff.k_fname} ${kitchenStaff.k_lname}`,
        email: kitchenStaff.email
      };
      console.log('Kitchen staff logged in:', email);
      return res.redirect('/login?success=kitchen');
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render('login', { error: 'Invalid email or password.' });
    }

    const isUserMatch = await user.comparePassword(password);
    if (!isUserMatch) {
      return res.render('login', { error: 'Invalid email or password.' });
    }

    req.session.userId = user._id;
    req.session.user = user;
    console.log('User logged in:', email);
    res.redirect('/login?success=user');

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('login', { error: 'Login error: ' + error.message });
  }
};

exports.dashboard = async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  try {
    const products = await Product.find({ stock: { $gte: 5 } });

    const soldResults = await Order.aggregate([
      { $match: { status: 'Completed' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          totalSold: { $sum: '$items.quantity' }
        }
      }
    ]);

    const soldMap = {};
    soldResults.forEach(result => {
      soldMap[result._id.toString()] = result.totalSold;
    });

    products.forEach(product => {
      if (!product.productImage) {
        product.productImage = '/images/default.jpg';
      }
      product.totalSold = soldMap[product._id.toString()] || 0;
    });

    res.render('dashboard', {
      user: req.session.user,
      products: products
    });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.render('dashboard', {
      user: req.session.user,
      products: [],
      error: 'Error loading products'
    });
  }
};

exports.editProfile = async (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const userId = req.user._id;
  const { firstName, lastName, phone, address, email, username } = req.body;

  try {
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }, { username }],
      _id: { $ne: userId }
    });

    if (existingUser) {
      req.flash('error', 'Email, phone, or username already taken by another user.');
      return res.redirect('/profile');
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect('/login');
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    user.address = address;
    user.email = email;
    user.username = username;

    await user.save();

    req.flash('success', 'Profile updated successfully.');
    res.redirect('/profile');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Failed to update profile.');
    res.redirect('/profile');
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    if (order.status === 'Completed') {
      return res.status(400).send('Completed orders cannot be cancelled');
    }

    order.status = 'Cancelled';
    await order.save();

    res.redirect('/profile'); 
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).send('Error cancelling order');
  }
};

exports.showOrderSuccess = (req, res) => {
  res.render('order-success');
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
};
