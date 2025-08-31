const User = require('../models/User');
const Product = require('../models/Product');
const bcrypt = require('bcrypt');
const Order = require('../models/Order'); 
const Staff = require('../models/Staff');
const CompletedOrder = require('../models/CompletedOrder');
const moment = require('moment');
const KitchenStaff = require('../models/KitchenStaff');
const { Parser } = require('json2csv');

const calculateTotalSales = async () => {
  try {
    const completedOrders = await CompletedOrder.find();
    let totalSales = 0;
    
    completedOrders.forEach(order => {
      totalSales += order.totalAmount; 
    });
    
    return totalSales;
  } catch (err) {
    console.error('Error calculating total sales:', err);
    return 0;
  }
};

const getMostBoughtProducts = async (limit = 5) => {
  try {
    const result = await CompletedOrder.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          totalQuantity: { $sum: '$items.quantity' },
        }
      },
      {
        $sort: { totalQuantity: -1 } 
      },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          productName: '$product.productName',
          totalQuantity: 1,
          price: '$product.price',
          productImage: '$product.productImage',
          category: '$product.category',
        }
      }
    ]);
    return result;
  } catch (error) {
    console.error('Error fetching most bought products:', error);
    return [];
  }
};

exports.dashboard = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 3;
    const skip = (page - 1) * limit;

    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    const totalStaff = await Staff.countDocuments();
    const totalKitchenStaff = await KitchenStaff.countDocuments();

    const weeklyTrends = await fetchWeeklyProductSalesTrends();
    const monthlyProductTrends = await fetchMonthlyProductSalesTrends();
    const dailyProductSales = await fetchDailyProductSales();

    const pendingOrdersCount = await Order.countDocuments({ status: 'Pending' });
    const completedOrdersCount = await Order.countDocuments({ status: 'Completed' });
    const cancelledOrdersCount = await Order.countDocuments({ status: 'Cancelled' });

    const orders = await Order.find({});
    const completedOrders = await Order.find({ status: 'Completed' });
    const totalSales = completedOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

    const products = await Product.find();
    const productStockChartData = products.map(product => ({
      name: product.productName,
      stock: product.stock
    }));

    let totalStocks = 0;
    let lowStockWarning = [];
    products.forEach(product => {
      totalStocks += product.stock;
      if (product.stock < 20) lowStockWarning.push(product.productName || product.name);
    });

    const productSalesMap = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const pid = item.productId.toString();
        productSalesMap[pid] = (productSalesMap[pid] || 0) + item.quantity;
      });
    });

    const topProductIds = Object.entries(productSalesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);

    const mostBoughtProducts = await Product.find({ _id: { $in: topProductIds } });
    const mostBoughtProductsWithQty = mostBoughtProducts.map(product => ({
      productName: product.productName || product.name,
      productImage: product.productImage || '/images/default.jpg',
      totalQuantity: productSalesMap[product._id.toString()] || 0
    }));

    const startOfDay = moment().startOf('day').toDate();
    const endOfDay = moment().endOf('day').toDate();

    const todaysOrders = await Order.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).populate('items.productId');

    const kitchenCompletedOrders = await CompletedOrder.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).populate('items.productId');

    const combinedOrders = [...todaysOrders, ...kitchenCompletedOrders];
    const allDailyOrders = combinedOrders.map(order => {
      const productMap = {};
      order.items.forEach(item => {
        const productName = item.productId?.productName || item.productId?.name || "Unknown Product";
        productMap[productName] = (productMap[productName] || 0) + item.quantity;
      });
      const productList = Object.entries(productMap)
        .map(([name, qty]) => `${name} (x${qty})`)
        .join(', ');

      return {
        orderId: order._id.toString(),
        status: order.status || 'Completed',
        productList,
        totalAmount: order.totalAmount || 0,
        image: order.items[0]?.productId?.productImage || '/images/default.jpg'
      };
    });

    const paginatedDailyOrders = allDailyOrders.slice(skip, skip + limit);
    const totalDailyOrders = allDailyOrders.length;
    const totalPages = Math.ceil(totalDailyOrders / limit);

    const completedKitchenOrders = await CompletedOrder.find().populate('items.productId').sort({ createdAt: -1 });

    let salesData = [];
    const startOfWeek = moment().startOf('isoWeek');
    const endOfWeek = moment().endOf('isoWeek');

    const dailySales = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    completedKitchenOrders.forEach(order => {
      order.items.forEach(item => {
        const product = item.productId;
        const itemTotal = item.quantity * (product?.price || 0);

        salesData.push({
          date: order.createdAt,
          product: product?.productName || 'Unknown',
          quantity: item.quantity,
          total: itemTotal
        });
      });

      const orderDate = moment(order.createdAt);
      if (orderDate.isBetween(startOfWeek, endOfWeek, null, '[]')) {
        const dayIndex = orderDate.isoWeekday() - 1;
        dailySales[dayIndex] += order.totalAmount || 0;
      }
    });

    const groupSales = (format) => {
      const grouped = {};
      salesData.forEach(sale => {
        const key = moment(sale.date).format(format);
        if (!grouped[key]) grouped[key] = 0;
        grouped[key] += sale.total;
      });
      return grouped;
    };

    const currentYear = moment().year();
    const currentMonth = moment().month();

    const getWeeksInMonth = (year, month) => {
      let weeks = [];
      const startDate = moment([year, month, 1]).startOf('isoWeek');
      const endDate = moment([year, month]).endOf('month');
      let current = startDate.clone();
      while (current.isBefore(endDate) || current.isSame(endDate, 'week')) {
        weeks.push(current.format('GGGG-[W]WW'));
        current.add(1, 'week');
      }
      return weeks;
    };

    const weeklyLabels = getWeeksInMonth(currentYear, currentMonth);
    const weeklySales = groupSales('GGGG-[W]WW');

    const monthlyLabels = [];
    for (let m = 0; m < 12; m++) {
      monthlyLabels.push(moment([currentYear, m]).format('YYYY-MM'));
    }
    const monthlySales = groupSales('YYYY-MM');

    const yearlyLabels = [currentYear.toString()];
    const yearlySales = groupSales('YYYY');

    const now = new Date();
    const selectedMonth = parseInt(req.query.month) || (now.getMonth() + 1);
    const selectedYear = parseInt(req.query.year) || now.getFullYear();

    const month = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' });
    const year = selectedYear;
    const startDate = new Date(year, selectedMonth - 1, 1);
    const endDate = new Date(year, selectedMonth, 0, 23, 59, 59, 999);

    const allProductSales = await Product.aggregate([
      {
        $lookup: {
          from: 'completedorders',
          let: { productId: '$_id' },
          pipeline: [
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { $unwind: '$items' },
            {
              $match: {
                $expr: { $eq: ['$items.productId', '$$productId'] }
              }
            },
            {
              $group: {
                _id: '$items.productId',
                totalQuantity: { $sum: '$items.quantity' }
              }
            }
          ],
          as: 'salesData'
        }
      },
      {
        $addFields: {
          totalQuantity: {
            $ifNull: [{ $arrayElemAt: ['$salesData.totalQuantity', 0] }, 0]
          }
        }
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          price: 1,
          productImage: 1,
          category: 1,
          totalQuantity: 1
        }
      },
      { $sort: { totalQuantity: -1 } }
    ]);

async function fetchDailyProductSales() {
  const start = moment().startOf('day').hour(7).minute(0).second(0).toDate();
  const end = moment().startOf('day').hour(17).minute(0).second(0).toDate();

  const orders = await CompletedOrder.find({
    createdAt: { $gte: start, $lte: end }
  }).populate('items.productId');
  const salesMap = {};
  const hours = [];
  for (let h = 7; h <= 17; h++) {
    hours.push(moment().startOf('day').hour(h).minute(0).second(0));
  }

  orders.forEach(order => {
    order.items.forEach(item => {
      const product = item.productId;
      if (!product) return;

      const productName = product.productName || 'Unknown Product';
      const productImage = product.productImage || ''; 

      if (!salesMap[productName]) {
        salesMap[productName] = {
          productName,
          productImage,
          salesByTime: {}
        };
        hours.forEach(hour => {
          salesMap[productName].salesByTime[hour.format('h:mm A')] = 0;
        });
      }

      const orderHour = moment(order.createdAt).startOf('hour');
      const hourStr = orderHour.format('h:mm A');

      if (salesMap[productName].salesByTime.hasOwnProperty(hourStr)) {
        salesMap[productName].salesByTime[hourStr] += item.quantity;
      }
    });
  });

  // Transform salesMap to array and convert salesByTime object to array
  const result = Object.values(salesMap).map(product => ({
    productName: product.productName,
    productImage: product.productImage,
    salesByTime: Object.entries(product.salesByTime).map(([time, quantity]) => ({
      time,
      quantity
    }))
  }));

  return result;
}

async function fetchMonthlyProductSalesTrends() {
  const start = moment().startOf('month').toDate();
  const end = moment().endOf('month').toDate();

  const orders = await CompletedOrder.find({
    createdAt: { $gte: start, $lte: end }
  }).populate('items.productId');

  const trendsMap = {};

  orders.forEach(order => {
    const day = moment(order.createdAt).format('YYYY-MM-DD');

    order.items.forEach(item => {
      const name = item.productId?.productName || 'Unknown Product';

      if (!trendsMap[name]) trendsMap[name] = {};
      if (!trendsMap[name][day]) trendsMap[name][day] = 0;

      trendsMap[name][day] += item.quantity;
    });
  });

  return Object.entries(trendsMap).map(([productName, dailyData]) => ({
    productName,
    dailySales: Object.entries(dailyData).map(([date, quantity]) => ({
      date,
      quantity
    }))
  }));
}

async function fetchWeeklyProductSalesTrends() {
  const start = moment().startOf('isoWeek').toDate(); // Monday
  const end = moment().endOf('isoWeek').toDate();     // Sunday

  const orders = await CompletedOrder.find({
    createdAt: { $gte: start, $lte: end }
  }).populate('items.productId');

  const trendsMap = {};

  orders.forEach(order => {
    const day = moment(order.createdAt).format('dddd');

    order.items.forEach(item => {
      const name = item.productId?.productName || 'Unknown Product';
      if (!trendsMap[name]) trendsMap[name] = {};
      if (!trendsMap[name][day]) trendsMap[name][day] = 0;

      trendsMap[name][day] += item.quantity;
    });
  });

  return Object.entries(trendsMap).map(([productName, dailyData]) => ({
    productName,
    dailySales: Object.entries(dailyData).map(([date, quantity]) => ({
      date,
      quantity
    }))
  }));
}

    res.render('admin/index', {
      totalUsers,
      totalOrders,
      totalProducts,
      totalStaff,
      totalKitchenStaff,
      totalSales,
      totalStocks,
      lowStockWarning,
      mostBoughtProducts: mostBoughtProductsWithQty,
      dailyOrders: paginatedDailyOrders,
      pendingOrdersCount,
      completedOrdersCount,
      cancelledOrdersCount,
      productStockChartData,
      products,
      currentPage: page,
      totalPages,
      limit,

      weeklyLabels,
      weeklySales,
      monthlyLabels,
      monthlySales,
      yearlyLabels,
      yearlySales,
      dailySales,
      dailyProductSales,
      weeklyTrends,
      monthlyProductTrends,
      mostBoughtProducts: allProductSales,
      month,
      year,
      successMessage: res.locals.successMessage || null
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
};


exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; 
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await CompletedOrder.countDocuments();

    const totalPages = Math.ceil(totalOrders / limit);

    const completedOrders = await CompletedOrder.find()
      .populate('items.productId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render('admin/orders', {
      orders: completedOrders,
      currentPage: page,
      totalPages: totalPages,
    });
  } catch (error) {
    console.error('Error loading completed orders:', error);
    res.status(500).send('Server error');
  }
};

exports.getStaff = async (req, res) => {
  try {
    const staff = await Staff.find();
    const kitchenStaff = await KitchenStaff.find();

    res.render('admin/staff', {
      staff,
      kitchenStaff,
      successMessage: req.flash('success'),
      errorMessage: req.flash('error'),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.getReviews = (req, res) => {
  res.render('admin/reviews');
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.render('admin/users', { users });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.render('admin/products', {
      products,
      successMessage: res.locals.successMessage,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.createProduct = async (req, res) => {
  const { productName, price, stock, productImage, category } = req.body;

  try {
    const newProduct = new Product({
      productName,
      price,
      stock,
      productImage,
      category,
      reviews: [],
    });

    await newProduct.save();
    req.flash('success', 'Product added successfully!');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error adding product');
    res.redirect('/admin/products');
  }
};

exports.editProductForm = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).send('Product not found');
    res.render('admin/editProduct', { product });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.editProduct = async (req, res) => {
  const { id } = req.params;
  const { productName, price, stock, productImage, category } = req.body;

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).send('Product not found');

    product.productName = productName;
    product.price = price;
    product.stock = stock;
    product.productImage = productImage;
    product.category = category;

    await product.save();

    req.flash('success', 'Product updated successfully!');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Server error while updating product.');
    res.redirect('/admin/products');
  }
};

exports.deleteProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).send('Product not found');
    }

    res.locals.successMessage = {
      title: 'Deleted!',
      text: 'Product deleted successfully!',
    };

    res.redirect('/admin/products');
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).send('Server Error');
  }
};

exports.addStock = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).send('Product not found');

    product.stock += Number(quantity);
    await product.save();
    res.locals.successMessage = { title: 'Stock Updated!', text: 'Stock added successfully!' };
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.decreaseStock = async (req, res) => {
  const { id, quantity } = req.params;

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).send('Product not found');

    product.stock -= Number(quantity);
    if (product.stock < 1) {
      await product.remove();
    } else {
      await product.save();
    }

    res.locals.successMessage = { title: 'Stock Reduced!', text: 'Stock reduced after checkout!' };
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

exports.addStaff = async (req, res) => {
  try {
    const { s_username, s_fname, s_lname, s_email, s_password } = req.body;

    if (!s_email.endsWith('@staff.com')) {
      req.flash('error', 'Email must end with @staff.com');
      return res.redirect('/admin/staff');
    }

    const existingStaff = await Staff.findOne({ email: s_email });
    if (existingStaff) {
      req.flash('error', 'Email already exists.');
      return res.redirect('/admin/staff');
    }

    const hashedPassword = await bcrypt.hash(s_password, 10);

    const newStaff = new Staff({
      s_username,
      s_fname,
      s_lname,
      email: s_email,
      s_password: hashedPassword,
    });

    await newStaff.save();

    req.flash('success', 'Staff account added successfully.');
    res.redirect('/admin/staff');
  } catch (error) {
    console.error('Error adding staff:', error);
    req.flash('error', 'Internal Server Error');
    res.redirect('/admin/staff');
  }
};

exports.addKitchenStaff = async (req, res) => {
  try {
    const { username, firstName, lastName, email, password } = req.body;

    if (!email.endsWith('@kitchen.com')) {
      req.flash('error', 'Email must end with @kitchen.com');
      return res.redirect('/admin/staff');
    }

    const existingKitchenStaff = await KitchenStaff.findOne({ email });
    if (existingKitchenStaff) {
      req.flash('error', 'Email already exists.');
      return res.redirect('/admin/staff');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newKitchenStaff = new KitchenStaff({
      username,
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    await newKitchenStaff.save();

    req.flash('success', 'Kitchen staff account added successfully.');
    res.redirect('/admin/staff');
  } catch (error) {
    console.error('Error adding kitchen staff:', error);
    req.flash('error', 'Internal Server Error');
    res.redirect('/admin/staff');
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const staffId = req.params.id;
    await Staff.findByIdAndDelete(staffId);

    req.flash('deleteSuccess', 'Staff account deleted successfully.');
    res.redirect('/admin/staff');
  } catch (error) {
    console.error('Error deleting staff:', error);
    req.flash('error', 'Internal Server Error');
    res.redirect('/admin/staff');
  }
};

exports.deleteKitchenStaff = async (req, res) => {
  try {
    const kitchenStaffId = req.params.id;
    await KitchenStaff.findByIdAndDelete(kitchenStaffId);

    req.flash('deleteSuccess', 'Kitchen staff account deleted successfully.');
    res.redirect('/admin/staff');
  } catch (error) {
    console.error('Error deleting kitchen staff:', error);
    req.flash('error', 'Internal Server Error');
    res.redirect('/admin/staff');
  }
};

exports.reportDamage = async (req, res) => {
  // Destructure 'damaged' since that is the input name in your form
  const { productId, damaged } = req.body;

  // Parse damaged quantity to integer
  const damagedQty = parseInt(damaged, 10);

  // Validate damagedQty
  if (isNaN(damagedQty) || damagedQty <= 0) {
    return res.status(400).send('Invalid damaged quantity');
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).send('Product not found');

    // Calculate lost income
    const incomeLoss = damagedQty * product.price;

    // Safely update product fields, handle undefined fields
    product.stock = (product.stock || 0) - damagedQty;
    product.damaged = (product.damaged || 0) + damagedQty;
    product.lostIncome = (product.lostIncome || 0) + incomeLoss;

    await product.save();

    res.redirect('/admin/index');
  } catch (error) {
    console.error('Error reporting damage:', error);
    res.status(500).send('Internal Server Error');
  }
};