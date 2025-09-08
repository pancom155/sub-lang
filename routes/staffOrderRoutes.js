const express = require('express');
const router = express.Router();
const StaffOrderController = require('../controllers/staffOrderController');
const upload = require('../middleware/upload'); // your multer setup

// Order-related routes
router.post('/staff/orders/:id/process', StaffOrderController.processOrder);
router.post('/staff/orders/:id/cancel', StaffOrderController.cancelOrder);
router.post('/staff/orders/:id/complete', StaffOrderController.completeOrder);

// Upload proof of payment
router.post('/staff/orders/:id/upload-proof', upload.single('proofImage'), StaffOrderController.uploadProof);

// Review-related routes
router.get('/staff/orders/:id/reviews', StaffOrderController.viewReviews);
router.post('/staff/reviews/:id/approve', StaffOrderController.approveReview);
router.post('/staff/reviews/:id/reject', StaffOrderController.rejectReview);
router.delete('/staff/reviews/:id', StaffOrderController.deleteReview);

// Viewing and managing orders
router.get('/staff/orders', StaffOrderController.staffOrders);

module.exports = router;
