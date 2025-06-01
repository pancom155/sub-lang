const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');

// Define routes for reviews
router.get('/reviews', ReviewController.showPage);
router.get('/product/:productId/reviews', ReviewController.showReviews);
router.post('/product/:productId/reviews', ReviewController.submitReview);

module.exports = router;
