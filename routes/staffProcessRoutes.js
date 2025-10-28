const express = require('express');
const router = express.Router();
const staffProcessController = require('../controllers/staffProcessController');
const { isStaff } = require('../middleware/authMiddleware');

router.get('/orders', isStaff, staffProcessController.staffOrders);
router.get('/orders/:orderId/process', isStaff, staffProcessController.processOrder);
router.get('/orders/:orderId/complete', isStaff, staffProcessController.completeOrder);
router.get('/orders/:orderId/cancel', isStaff, staffProcessController.cancelOrder);
router.get('/orders/all', isStaff, staffProcessController.viewAllOrders);
router.get('/orders/:orderId/details', isStaff, staffProcessController.viewOrderDetails);

router.get('/index', isStaff, staffProcessController.staffDashboard);
router.get('/void', isStaff, staffProcessController.viewCancellationRequests);

router.post('/cancellations/:orderId/approve', isStaff, staffProcessController.approveCancelOrder);
router.post('/cancellations/:orderId/reject-proof', isStaff, staffProcessController.rejectCancelOrder);

module.exports = router;
