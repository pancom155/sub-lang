const express = require('express');
const router = express.Router();
const StaffController = require('../controllers/staffController');

// Define routes for staff management
router.post('/add', StaffController.addStaff);
router.delete('/:id', StaffController.deleteStaff);

module.exports = router;
