const express = require('express');
const router = express.Router();
const staffProcessController = require('../controllers/staffProcessController');

router.get('/orders', staffProcessController.staffOrders);
router.get('/orders/:orderId/process', staffProcessController.processOrder);
router.get('/orders/:orderId/complete', staffProcessController.completeOrder);
router.get('/orders/:orderId/cancel', staffProcessController.cancelOrder);
router.get('/orders/all', staffProcessController.viewAllOrders);
router.get('/orders/:orderId/details', staffProcessController.viewOrderDetails);
router.get('/index', staffProcessController.staffDashboard);

module.exports = router;
