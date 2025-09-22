const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { uploadGeneral, uploadProof } = require('../middleware/upload');

router.get('/index', AdminController.dashboard);
router.get('/dashboard', AdminController.dashboard);
router.get('/users', AdminController.getUsers);
router.get('/orders', AdminController.getOrders);
router.get('/staff', AdminController.getStaff);
router.get('/reviews', AdminController.getReviews);

router.post('/staff/add', AdminController.addStaff);
router.delete('/staff/:id', AdminController.deleteStaff);

router.post('/kitchenStaff/add', AdminController.addKitchenStaff);
router.delete('/kitchenStaff/:id', AdminController.deleteKitchenStaff);

router.get('/products', AdminController.getProducts);
router.post('/products/add', uploadGeneral.single('productImage'), AdminController.createProduct);
router.get('/products/edit/:id', AdminController.editProductForm); 
router.post('/products/edit/:id', uploadGeneral.single('productImage'), AdminController.editProduct);
router.post('/products/delete/:id', AdminController.deleteProduct);

router.post('/products/report-damage', AdminController.reportDamage);
router.get('/spoilage', AdminController.getSpoilage);
router.get("/productMonitoring", AdminController.productMonitoring);

router.get('/sales', AdminController.getSales);
router.get('/sales/export/pdf', AdminController.exportSalesPDF);
router.get('/sales/export/csv', AdminController.exportSalesCSV);
router.get('/sales/export/excel', AdminController.exportSalesExcel);

module.exports = router;
