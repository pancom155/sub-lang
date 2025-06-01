const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const profileRoutes = require('./routes/profile');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const methodOverride = require('method-override');
const staffRoutes = require('./routes/staffRoutes');
const indexRoutes = require('./routes/indexRoutes');
const staffProcessRoutes = require('./routes/staffProcessRoutes');
const salesRoutes = require('./routes/salesRoutes');
const flash = require('connect-flash');
const kitchenRoutes = require('./routes/KitchenRoutes');
const multer = require('multer');
require('./passportConfig'); 

const app = express();

const mongoURI = 'mongodb+srv://aguilarcyruzjaeg:qwaswex12@cluster0.0onfw.mongodb.net/coffee';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'secretkey',
  resave: false,
  saveUninitialized: false
}));

app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.static('uploads'));

app.use('/staff', staffProcessRoutes);
app.use('/api/orders', orderRoutes);
app.use('/', profileRoutes);
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/', reviewRoutes);
app.use('/admin/staff', staffRoutes);
app.use('/admin/sales', salesRoutes);
app.use('/', indexRoutes);
app.use('/kitchen', kitchenRoutes);

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, './uploads'); 
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
