const express = require('express');
const router = express.Router();
const kitchenController = require('../controllers/kitchenController');

router.get('/', kitchenController.index);
router.get('/index', kitchenController.index);
router.get('/orders', kitchenController.viewKitchenOrders);
router.post('/orders/:orderId/complete', kitchenController.completeOrder);

module.exports = router;
