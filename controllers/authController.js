const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order'); 
const Staff = require('../models/Staff');
const KitchenStaff = require('../models/KitchenStaff');
const CartItem = require('../models/cartItem');
const bcrypt = require("bcrypt");
const axios = require('axios');
const { sendEmail, otpTemplate } = require("../utils/emailService");
const RECAPTCHA_SECRET_KEY = '6LdykLQrAAAAAONL72QLlYPN_7zc6tx5j0q_V1zY';
// domain 6Ldb-bgrAAAAAOGcqoYtm7dlbuLHHwjR5s707UXh

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
let otpStore = {};

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


exports.showCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const cartItems = await CartItem.find({ user_id: userId })
      .populate('product_id')
      .lean();

    if (!cartItems || cartItems.length === 0) return res.redirect('/cart');

    res.render('checkout', { user: req.session.user, cartItems });
  } catch (err) {
    console.error(err);
    res.redirect('/cart');
  }
};

exports.checkout = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const { paymentMode, noteToCashier, senderName, referenceNumber } = req.body;
    const proofImage = req.file ? `/uploads/proofs/${req.file.filename}` : null;

    const cartItems = await CartItem.find({ user_id: userId }).populate('product_id').lean();

    if (!cartItems || cartItems.length === 0) return res.redirect('/cart');

    const orderItems = cartItems.map(item => ({
      productId: item.product_id._id,
      quantity: item.quantity
    }));

    const orderData = {
      user: userId,
      items: orderItems,
      paymentMode,
      noteToCashier: noteToCashier || '',
      totalAmount: 0, // pre-save hook will calculate
      ...(paymentMode === 'Pickup' || paymentMode === 'GCash'
        ? { senderName, referenceNumber, proofImage }
        : {})
    };

    const order = new Order(orderData);
    await order.save();

    // Clear cart after order
    await CartItem.deleteMany({ user_id: userId });

    res.redirect(`/order-success?id=${order._id}`);
  } catch (err) {
    console.error('Checkout Error:', err);
    res.redirect('/cart');
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = req.session.user;
    if (!userId) return res.redirect('/login');

    const cartItems = await CartItem.find({ user_id: userId })
      .populate('product_id')
      .lean();

    if (!cartItems || cartItems.length === 0) return res.redirect('/cart');

    const paymentMode = req.body.paymentMode || 'COD';
    const paymentInfo = req.file
      ? {
          senderName: req.body.senderName,
          referenceNumber: req.body.referenceNumber,
          proofImagePath: 'uploads/' + req.file.filename,
        }
      : null;

    const order = await processOrder(cartItems, user, paymentMode, paymentInfo);

    await CartItem.deleteMany({ user_id: userId });

    res.redirect(`/order-success?id=${order._id}`);
  } catch (err) {
    console.error('Place Order Error:', err);
    res.status(500).send('Error placing order');
  }
};

exports.confirmOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const pickupProofImage = req.file ? 'uploads/' + req.file.filename : null;

    if (!orderId) return res.status(400).send('Missing order ID');

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send('Order not found');

    order.status = 'completed';
    order.pickupProofImage = pickupProofImage;
    await order.save();

    res.redirect(`/order-success?id=${order._id}`);
  } catch (err) {
    console.error('Confirm Order Error:', err);
    res.status(500).send('Error confirming order');
  }
};

async function processOrder(cartItems, user, paymentMode = 'COD', paymentInfo = null) {
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

  if ((paymentMode === 'Pickup' || paymentMode === 'GCash') && paymentInfo) {
    orderData.senderName = paymentInfo.senderName;
    orderData.referenceNumber = paymentInfo.referenceNumber;
    orderData.proofImage = paymentInfo.proofImagePath;
  }

  const order = new Order(orderData);
  return await order.save();
}

exports.showOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.id || req.query.id;

    let order = null;
    if (orderId) {
      order = await Order.findById(orderId)
        .populate('items.productId') // assumes your Order schema has { productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' } }
        .exec();
    }

    // Always pass `order`, even if null
    res.render('order-success', { order });
  } catch (err) {
    console.error('Error fetching order:', err);
    res.render('order-success', { order: null });
  }
};

exports.showOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    const orders = await Order.find({ userId }).lean();

    res.render('order', {
      user: req.session.user || null,
      orders,
      message: orders.length === 0 ? 'You have no recent orders.' : null,
      error: null
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.render('order', {
      user: req.session.user || null,
      orders: [],
      message: null,
      error: 'Something went wrong while loading your orders.'
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
  try {
    const { firstName, lastName, phone, address, email, username, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }, { phone }] });
    if (existingUser) return res.status(400).json({ message: "Email, username, or phone already in use" });

    const otp = generateOTP();
    otpStore[email] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      userData: { firstName, lastName, phone, address, email, username, password },
      type: 'register'
    };

    await sendEmail(email, "ZeroDegree OTP Verification", otpTemplate(otp, 'register'));
    res.status(201).json({ message: "OTP sent to email. Please verify." });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const record = otpStore[email];

    if (!record || record.type !== 'register')
      return res.status(400).json({ message: "No OTP found, please register again" });

    if (record.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    if (record.expiresAt < Date.now()) {
      delete otpStore[email];
      return res.status(400).json({ message: "OTP expired, please register again" });
    }

    await User.create({ ...record.userData, isVerified: true });
    delete otpStore[email];

    res.json({ message: "Account verified & user registered" });
  } catch (error) {
    console.error("OTP Verify Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const record = otpStore[email];
    if (!record) return res.status(400).json({ message: "No OTP request found for this email" });

    const otp = generateOTP();
    record.otp = otp;
    record.expiresAt = Date.now() + 5 * 60 * 1000;

    const subject = record.type === 'register' ? "ZeroDegree Registration OTP" : "ZeroDegree Password Reset OTP";
    await sendEmail(email, subject, otpTemplate(otp, record.type));

    res.json({ message: "New OTP sent to email" });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.requestPasswordReset = async (req,res)=>{
  const {email} = req.body;
  const user = await User.findOne({email});
  if(!user) return res.status(404).json({message:"No account with this email"});

  const otp = generateOTP();
  otpStore[email] = {otp,expiresAt:Date.now()+5*60*1000,verified:false,type:'reset'};
  await sendEmail(email,"ZeroDegree Password Reset OTP",otpTemplate(otp,'reset'));

  res.json({message:"Password reset OTP sent to email"});
};

exports.verifyResetOtp = async (req,res)=>{
  const {email,otp} = req.body;
  const record = otpStore[email];
  if(!record || record.type!=='reset') return res.status(400).json({message:"No reset request found"});
  if(record.otp!==otp) return res.status(400).json({message:"Invalid OTP"});
  if(record.expiresAt<Date.now()){ delete otpStore[email]; return res.status(400).json({message:"OTP expired"}); }

  record.verified = true;
  res.json({message:"OTP verified. You can reset your password."});
};

exports.resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;
  const record = otpStore[email];

  if (!record?.verified) 
    return res.status(400).json({ message: "OTP verification required" });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  user.password = newPassword; 
  user.isVerified = true;
  await user.save();

  delete otpStore[email];
  res.json({ message: "Password reset successful. Please login." });
};

exports.login = async (req, res) => {
  const { email, password, 'g-recaptcha-response': recaptchaResponse } = req.body;

  if (!recaptchaResponse) {
    return res.render('login', { error: 'Please complete reCAPTCHA' });
  }

  try {
    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET_KEY}&response=${recaptchaResponse}`;
    const response = await axios.post(verificationUrl);
    if (!response.data.success) {
      return res.render('login', { error: 'Failed reCAPTCHA verification' });
    }

    if (email === 'zerodegreecafe@gmail.com' && password === 'admin12345') {
      req.session.user = { email, role: 'admin' };
      return res.redirect('/admin/index');
    }

    const staffDomains = [
      { domain: '@staff.com', model: Staff, role: 'staff' },
      { domain: '@kitchen.com', model: KitchenStaff, role: 'kitchen' }
    ];

    for (const { domain, model, role } of staffDomains) {
      if (email.endsWith(domain)) {
        const staff = await model.findOne({ email });
        if (!staff) {
          return res.render('login', { error: 'Invalid email or password.' });
        }

        const staffPassword = staff.password || staff.s_password;
        const match = await bcrypt.compare(password, staffPassword);
        if (!match) return res.render('login', { error: 'Invalid email or password.' });

        const firstName = staff.firstName || staff.s_fname || '';
        const lastName = staff.lastName || staff.s_lname || '';

        req.session.user = {
          id: staff._id,
          role,
          name: `${firstName} ${lastName}`.trim(),
          email
        };

        return res.redirect(role === 'staff' ? '/staff/index' : '/kitchen/index');
      }
    }

    const user = await User.findOne({ email });
    if (!user) return res.render('login', { error: 'Invalid email or password.' });

    if (!user.isVerified) {
      return res.render('login', { error: 'Please verify your email before logging in.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render('login', { error: 'Invalid email or password.' });

    req.session.userId = user._id;
    req.session.user = user;
    res.redirect('/dashboard');

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
