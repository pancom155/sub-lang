const express = require('express');
const router = express.Router();
const { staffNotifications, getPendingOrders } = require('../controllers/notificationController');

router.get('/staff/notifications', staffNotifications);
router.get('/staff/notifications/pending', getPendingOrders);

module.exports = router;