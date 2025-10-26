const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order'); 
const Staff = require('../models/Staff');
const KitchenStaff = require('../models/KitchenStaff');
const CartItem = require('../models/cartItem');
const Review = require('../models/Review');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const axios = require('axios');
const Loyalty = require('../models/Loyalty');
const { sendEmail, otpTemplate } = require("../utils/emailService");
const RECAPTCHA_SECRET_KEY = '6LecCekrAAAAAKiuavOZ5mf8yA1hwDu0NSq0jMmW';

// domain 6LecCekrAAAAAKiuavOZ5mf8yA1hwDu0NSq0jMmW
// localhost 6LfAuMQrAAAAAJeLSw-bey7KxfyHFj3Zd9UKg5gN

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
let otpStore = {};

exports.showLogin = (req, res) => {
  res.render('login', { error: null });
};

exports.viewLoyalty = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect('/login');

    let loyalty = await Loyalty.findOne({ user: user._id });
    if (!loyalty) {
      loyalty = await Loyalty.create({
        user: user._id,
        points: 0,
        discountPercent: 0,
        tier: 'Bronze'
      });
    }

    let nextTierPoints = 500;
    switch (loyalty.tier) {
      case 'Bronze': nextTierPoints = 500; break;
      case 'Silver': nextTierPoints = 1000; break;
      case 'Gold': nextTierPoints = 2000; break;
      case 'Platinum': nextTierPoints = 'Max Tier'; break;
    }

    res.render('loyalty', { user, loyalty, nextTierPoints });
  } catch (err) {
    console.error('Loyalty view error:', err);
    res.status(500).send('Error loading loyalty page');
  }
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
      const newQuantity = cartItem.quantity + quantity;
      if (newQuantity > stock) {
        return res.status(400).json({ message: 'Not enough stock available' });
      }
      cartItem.quantity = newQuantity;
      await cartItem.save();
    } else {
      if (quantity > stock) {
        return res.status(400).json({ message: 'Not enough stock available' });
      }
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

exports.getProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ stock: 0, message: 'Product not found' });
    }

    // Count only unexpired stock
    const now = new Date();
    const validBatches = (product.stockBatches || []).filter(
      (b) => new Date(b.expirationDate) > now
    );
    const totalStock = validBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);

    res.json({ stock: totalStock });
  } catch (error) {
    console.error('Error fetching product stock:', error);
    res.status(500).json({ message: 'Unable to verify stock right now' });
  }
};

exports.getCartItem = async (req, res) => {
  const userId = req.session.userId;
  const { productId } = req.params;

  if (!userId) return res.status(401).json({ message: 'Not logged in' });

  try {
    const cartItem = await CartItem.findOne({ user_id: userId, product_id: productId });
    res.json({ quantity: cartItem ? cartItem.quantity : 0 });
  } catch (error) {
    console.error('Error fetching cart item:', error);
    res.status(500).json({ message: 'Error fetching cart item' });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { cartItemId, quantity } = req.body;
    const cartItem = await CartItem.findById(cartItemId).populate('product_id');

    if (!cartItem) return res.status(404).send('Cart item not found');

    const product = cartItem.product_id;
    if (!product) return res.status(404).send('Product not found');

    // 🔒 Calculate valid stock (same logic as getProductStock)
    const now = new Date();
    const validBatches = (product.stockBatches || []).filter(
      (b) => new Date(b.expirationDate) > now
    );
    const totalStock = validBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);

    // 🔹 Check stock limit
    if (quantity > totalStock) {
      return res.status(400).send(`Only ${totalStock} items available in stock.`);
    }

    // 🔹 Check minimum
    if (quantity < 1) {
      await CartItem.findByIdAndDelete(cartItemId);
      return res.redirect('/cart');
    }

    cartItem.quantity = quantity;
    await cartItem.save();

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
    if (!userId) return res.status(401).json({ error: 'You must be logged in to checkout' });

    const { noteToCashier, paymentMode, senderName, referenceNumber } = req.body;
    const user = await User.findById(userId);

    const cartItems = await CartItem.find({ user_id: userId }).populate('product_id');
    if (!cartItems || cartItems.length === 0)
      return res.status(400).json({ error: 'Your cart is empty!' });

    // 🔹 Calculate total
    let totalAmount = 0;
    const orderItems = cartItems.map(item => {
      const price = item.product_id.price || 0;
      const subtotal = price * item.quantity;
      totalAmount += subtotal;
      return { productId: item.product_id._id, quantity: item.quantity, price, subtotal };
    });

    // 🔹 Check loyalty discount
    const loyalty = await Loyalty.findOne({ user: userId });
    const discountPercent = loyalty?.discountPercent || 0;
    const discountAmount = (totalAmount * discountPercent) / 100;
    const netTotal = totalAmount - discountAmount;

    // 🔹 Create order data
    const orderData = {
      user: userId,
      userInfoSnapshot: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        address: user.address,
        phone: user.phone
      },
      noteToCashier: noteToCashier || '',
      paymentMode,
      items: orderItems,
      totalAmount,
      discountPercent,
      discountAmount,
      netTotal
    };

    if (paymentMode === 'Pickup' || paymentMode === 'GCash') {
      if (!req.file || !senderName || !referenceNumber) {
        return res.status(400).json({
          error: 'Sender Name, Reference Number, and Proof Image are required!'
        });
      }
      orderData.senderName = senderName;
      orderData.referenceNumber = referenceNumber;
      orderData.proofImage = `/uploads/proofs/${req.file.filename}`;
    }

    // ✅ Save order
    const order = new Order(orderData);
    await order.save();

    // ✅ Update stock and clear cart
    for (const item of cartItems) {
      const product = await Product.findById(item.product_id._id);
      if (product) await product.decreaseStock(item.quantity);
    }
    await CartItem.deleteMany({ user_id: userId });

    // ✅ Optionally: add points for loyalty system
    if (loyalty) {
      loyalty.points += Math.floor(netTotal / 50); // e.g., 1 point per ₱50 spent
      await loyalty.save();
    }

    res.json({ success: true, redirectUrl: `/order-success/${order._id}` });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Checkout failed!' });
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

    const paymentMode = req.body.paymentMode || 'Pay at the Counter';
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

    res.redirect(`/order-success/${order._id}`);
  } catch (err) {
    console.error('Confirm Order Error:', err);
    res.status(500).send('Error confirming order');
  }
};

exports.showOrderSuccess = async (req, res) => {
  try {
    const orderId = req.params.id;
    if (!orderId) return res.render('order-success', { order: null });

    const order = await Order.findById(orderId)
      .populate('items.productId')
      .exec();

    if (!order) return res.render('order-success', { order: null });

    order.items.forEach(item => {
      if (item.productId && item.productId.productImage) {
        if (!item.productId.productImage.startsWith('/uploads/')) {
          item.productId.productImage = `/uploads/${item.productId.productImage}`;
        }
      }
    });

    if (order.proofImage) {
      if (!order.proofImage.startsWith('/uploads/proofs/')) {
        order.proofImage = `/uploads/proofs/${order.proofImage}`;
      }
    }

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

    // Fetch orders with product details
    const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('items.productId')
      .lean();

    // Calculate netTotal if missing
    orders.forEach(order => {
      if (order.netTotal === undefined) {
        order.netTotal = order.totalAmount - (order.discountAmount || 0);
      }
    });

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

    if (email.endsWith('@staff.com')) {
      const staff = await Staff.findOne({ s_email: email });
      if (!staff) return res.render('login', { error: 'Invalid email or password.' });

      const match = await bcrypt.compare(password, staff.s_password);
      if (!match) return res.render('login', { error: 'Invalid email or password.' });

      req.session.user = {
        id: staff._id,
        role: 'staff',
        name: `${staff.s_fname} ${staff.s_lname}`,
        email: staff.s_email,
      };

      return res.redirect('/staff/index');
    }

    if (email.endsWith('@kitchen.com')) {
      const kitchenStaff = await KitchenStaff.findOne({ email });
      if (!kitchenStaff) return res.render('login', { error: 'Invalid email or password.' });

      const match = await bcrypt.compare(password, kitchenStaff.password);
      if (!match) return res.render('login', { error: 'Invalid email or password.' });

      req.session.user = {
        id: kitchenStaff._id,
        role: 'kitchen',
        name: `${kitchenStaff.firstName} ${kitchenStaff.lastName}`,
        email: kitchenStaff.email,
      };

      return res.redirect('/kitchen/index');
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

    return res.redirect('/dashboard');

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('login', { error: 'Login error: ' + error.message });
  }
};

exports.dashboard = async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  try {
    const allProducts = await Product.find({});

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

    const ratingResults = await Review.aggregate([
      { $match: { productId: { $ne: null } } },
      {
        $group: {
          _id: '$productId',
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    const soldMap = {};
    soldResults.forEach(r => (soldMap[r._id.toString()] = r.totalSold));

    const ratingMap = {};
    ratingResults.forEach(r => {
      ratingMap[r._id.toString()] = {
        avgRating: r.avgRating,
        totalReviews: r.totalReviews
      };
    });

    const now = new Date();

    const products = allProducts
      .map(product => {
        // Only fetch stockBatches that are not expired and quantity > 0
        const activeBatches = (product.stockBatches || []).filter(
          b => new Date(b.expirationDate) > now && b.quantity > 0
        );

        product.activeBatches = activeBatches; // pass to view
        product.totalSold = soldMap[product._id.toString()] || 0;
        product.avgRating = ratingMap[product._id.toString()]?.avgRating || 0;
        product.totalReviews = ratingMap[product._id.toString()]?.totalReviews || 0;

        return product;
      })
      // Only keep products with at least one active batch
      .filter(product => product.activeBatches.length > 0);

    res.render('dashboard', { user: req.session.user, products });
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
    const { reason } = req.body;

    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId).populate('items.productId');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (!['Pending', 'Processing'].includes(order.status)) {
      return res.status(400).json({ message: 'This order cannot be cancelled' });
    }

    if (order.status === 'Pending Cancellation') {
      return res.status(400).json({ message: 'Cancellation already requested' });
    }

    order.status = 'Pending Cancellation';
    order.cancellationReason = reason || 'No reason provided';
    order.cancellationRequestedAt = new Date();
    await order.save();

    res.status(200).json({ message: 'Cancellation request submitted', order });
  } catch (err) {
    console.error('Error requesting order cancellation:', err);
    res.status(500).json({ message: 'Server error while requesting cancellation' });
  }
};


exports.logout = (req, res) => {
  if (req.session && req.session.user) {
    const userEmail = req.session.user.email;

    if (userEmail === 'zerodegreecafe@gmail.com') {
      console.log('Super Admin logged out (manual or via back/forward navigation)');
    }
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).send('Error while logging out');
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ message: 'Logged out' });
    }

    res.redirect('/login');
  });
};

