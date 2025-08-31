const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');

// Dashboard and other pages
router.get('/index', AdminController.dashboard);
router.get('/dashboard', AdminController.dashboard);
router.get('/users', AdminController.getUsers);
router.get('/orders', AdminController.getOrders);
router.get('/staff', AdminController.getStaff);
router.get('/reviews', AdminController.getReviews);

// Staff routes
router.get('/staff', AdminController.getStaff);
router.post('/staff/add', AdminController.addStaff);
router.delete('/staff/:id', AdminController.deleteStaff);

// Kitchen staff routes
router.post('/kitchenStaff/add', AdminController.addKitchenStaff);
router.delete('/kitchenStaff/:id', AdminController.deleteKitchenStaff);

// Product routes
router.get('/products', AdminController.getProducts);
router.post('/products/add', AdminController.createProduct);
router.get('/products/edit/:id', AdminController.editProductForm); 
router.post('/products/edit/:id', AdminController.editProduct);
router.post('/products/delete/:id', AdminController.deleteProduct);

router.post('/products/report-damage', AdminController.reportDamage);

module.exports = router;
