const express = require('express');
const router = express.Router();
const { uploadProof } = require('../middleware/upload');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/dashboard', authMiddleware, authController.dashboard);

router.get('/cart', authMiddleware, authController.showCart);
router.post('/cart/add', authMiddleware, authController.addToCart);
router.post('/cart/update', authMiddleware, authController.updateCartItem);
router.post('/cart/remove', authMiddleware, authController.removeCartItem);

router.get('/cart/checkout', authMiddleware, authController.showCheckout);
router.post('/cart/checkout', authMiddleware, uploadProof.single('proofImage'), authController.checkout);

router.get('/order', authMiddleware, authController.showOrder);
router.post('/orders/:id/cancel', authMiddleware, authController.cancelOrder);
router.get('/order-success/:id', authMiddleware, authController.showOrderSuccess);

router.get('/order-success', authMiddleware, (req, res) => {
  res.render('order-success', { order: null });
});

router.get('/profile', authMiddleware, authController.showProfile);
router.post('/profile/edit', authMiddleware, authController.editProfile);

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
