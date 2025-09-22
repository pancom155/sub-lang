const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');

// User review dashboard
router.get('/reviews', ReviewController.showUserReviews);
router.post('/reviews', ReviewController.submitUserReview);

module.exports = router;
