const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const authController = require('../controllers/authController');

router.get('/dashboard', authController.dashboard);

router.get('/cart', authController.showCart);
router.post('/cart/add', authController.addToCart);
router.post('/cart/update', authController.updateCartItem);
router.post('/cart/remove', authController.removeCartItem);

router.get('/cart/checkout', authController.showCheckout);
router.post('/cart/checkout', upload.single('proofImageModal'), authController.checkout);

router.get('/order', authController.showOrder);
router.post('/orders/:id/cancel', authController.cancelOrder);
router.get('/order-success/:id', authController.showOrderSuccess);

router.get('/order-success', (req, res) => {
  res.render('order-success', { order: null });
});

router.get('/profile', authController.showProfile);
router.post('/profile/edit', authController.editProfile);

router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/register', authController.showRegister);
router.post('/register', authController.register);
router.get('/logout', authController.logout);

router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);
router.post('/forgot-password/request', authController.requestPasswordReset);
router.post('/forgot-password/verify', authController.verifyResetOtp);
router.post('/forgot-password/reset', authController.resetPassword);

module.exports = router;
