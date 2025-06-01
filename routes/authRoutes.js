const express = require('express');
const router = express.Router();
const upload = require('../middleware/multer');
const authController = require('../controllers/authController');

router.get('/order', authController.showOrder); 
router.get('/dashboard', authController.dashboard);
router.get('/profile', authController.showProfile);
router.post('/profile/edit', authController.editProfile);

router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/register', authController.showRegister);
router.post('/register', authController.register);
router.get('/logout', authController.logout);

router.get('/cart', authController.showCart);
router.post('/cart/add', authController.addToCart);
router.post('/cart/update', authController.updateCartItem);
router.post('/cart/remove', authController.removeCartItem);
router.post('/cart/checkout', upload.single('pickupProofImage'), authController.checkout);

router.post('/orders/:id/cancel', authController.cancelOrder);
router.get('/order-success', authController.showOrderSuccess);

module.exports = router;
