const express = require('express');
const router = express.Router();
const staffProcessController = require('../controllers/staffProcessController');

// Orders page
router.get('/orders', staffProcessController.staffOrders);
router.get('/orders/:orderId/process', staffProcessController.processOrder);
router.get('/orders/:orderId/complete', staffProcessController.completeOrder);
router.get('/orders/:orderId/cancel', staffProcessController.cancelOrder);
router.get('/orders/all', staffProcessController.viewAllOrders);
router.get('/orders/:orderId/details', staffProcessController.viewOrderDetails);

// Dashboard
router.get('/index', staffProcessController.staffDashboard);

// **Cancellation requests page (void)**
router.get('/void', staffProcessController.viewCancellationRequests);

// Approve or reject cancellation requests
router.post('/cancellations/:orderId/approve', staffProcessController.approveCancelOrder);
router.post('/cancellations/:orderId/reject-proof', staffProcessController.rejectCancelOrder);

module.exports = router;
