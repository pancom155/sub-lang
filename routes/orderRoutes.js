const express = require('express');
const router = express.Router();
const { getOrders, createOrder } = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware'); 

// Order routes
router.get('/orders', authMiddleware, getOrders);
// Route for creating a new order
router.post('/orders', authMiddleware, createOrder);

module.exports = router;
