const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const isAuthenticated = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    next();
};

// Route to display the user's profile
router.post('/edit-profile', isAuthenticated, upload.single('profilePicture'), async (req, res) => {
    try {
        const { firstName, lastName, phone, address, username } = req.body;
        const updateData = {
            firstName,
            lastName,
            phone,
            address,
            username,
        };

        if (req.file) {
            updateData.profilePicture = '/uploads/' + req.file.filename;
        }

        await User.findByIdAndUpdate(req.user._id, updateData);
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
