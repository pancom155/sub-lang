const express = require('express');
const router = express.Router();
const StaffOrderController = require('../controllers/staffOrderController');

// Order-related routes
router.post('/staff/orders/:id/process', StaffOrderController.processOrder);
router.post('/staff/orders/:id/cancel', StaffOrderController.cancelOrder);
router.post('/staff/orders/:id/complete', StaffOrderController.completeOrder); // ✅ Added route

// Review-related routes
router.get('/staff/orders/:id/reviews', StaffOrderController.viewReviews);
router.post('/staff/reviews/:id/approve', StaffOrderController.approveReview);
router.post('/staff/reviews/:id/reject', StaffOrderController.rejectReview);
router.delete('/staff/reviews/:id', StaffOrderController.deleteReview);

// Viewing and managing orders
router.get('/staff/orders', StaffOrderController.staffOrders); 
// router.get('/staff/orders/history', StaffOrderController.completedOrdersHistory); 

module.exports = router;
