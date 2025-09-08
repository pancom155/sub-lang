const User = require('../models/User');
const Product = require('../models/Product');
const bcrypt = require('bcrypt');
const Order = require('../models/Order'); 
const Staff = require('../models/Staff');
const CompletedOrder = require('../models/CompletedOrder');
const moment = require('moment');
const KitchenStaff = require('../models/KitchenStaff');
const { Parser } = require('json2csv');
const { fetchWeeklyProductSalesTrends, fetchMonthlyProductSalesTrends } = require('../utils/salesTrends');
const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const fs = require('fs');
const ExcelJS = require('exceljs');

const calculateTotalSales = async () => {
  try {
    const completedOrders = await CompletedOrder.find();
    return completedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  } catch (err) {
    console.error('Error calculating total sales:', err);
    return 0;
  }
};

exports.exportSalesCSV = async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = {};
    if (start && end) {
      query.createdAt = { $gte: new Date(start), $lte: new Date(end) };
    }

    const orders = await CompletedOrder.find(query).populate('items.productId');

    const csvData = orders.map(order => {
      const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
      return {
        Customer: `${order.userInfoSnapshot?.firstName || ''} ${order.userInfoSnapshot?.lastName || ''}`.trim() || 'Unknown',
        'Payment Mode': order.paymentMode || 'N/A',
        Total: order.totalAmount ? order.totalAmount.toFixed(2) : '0.00',
        Date: moment(dateObj).format('YYYY-MM-DD'),
        Time: moment(dateObj).format('HH:mm:ss')
      };
    });

    const json2csvParser = new Parser({ fields: ['Customer','Payment Mode','Total','Date','Time'] });
    const csv = json2csvParser.parse(csvData);

    res.header('Content-Type', 'text/csv');
    res.attachment('sales_report.csv');
    return res.send(csv);

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to export CSV');
  }
};

exports.exportSalesExcel = async (req, res) => {
  try {
    const { start, end } = req.query;
    const filter = {};
    if (start && end) filter.createdAt = { $gte: new Date(start), $lte: new Date(end) };

    const orders = await CompletedOrder.find(filter).populate('items.productId');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales');

    worksheet.columns = [
      { header: 'Customer', key: 'customer', width: 30 },
      { header: 'Payment Mode', key: 'payment', width: 15 },
      { header: 'Total (₱)', key: 'total', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Time', key: 'time', width: 15 },
    ];

    orders.forEach(o => {
      worksheet.addRow({
        customer: `${o.userInfoSnapshot?.firstName || ''} ${o.userInfoSnapshot?.lastName || ''}`.trim(),
        payment: o.paymentMode || 'N/A',
        total: o.totalAmount.toFixed(2),
        date: o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '',
        time: o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : ''
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales_${start || 'all'}_${end || 'all'}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to export Excel');
  }
};

exports.exportSalesPDF = async (req, res) => {
  try {
    const { start, end } = req.query;
    const dateFilter = {};
    if (start) dateFilter.$gte = new Date(start);
    if (end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = endDate;
    }
    const query = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
    const orders = await CompletedOrder.find(query).sort({ createdAt: 1 });

    if (!orders.length) {
      return res.send('No completed orders found for the selected date range.');
    }

    const filteredOrders = orders.map(o => ({
      customerName: o.userInfoSnapshot
        ? `${o.userInfoSnapshot.firstName} ${o.userInfoSnapshot.lastName}`
        : 'Guest',
      total: o.totalAmount || 0,
      date: o.createdAt ? o.createdAt.toLocaleDateString() : '',
      time: o.createdAt ? o.createdAt.toLocaleTimeString() : '',
      paymentMode: o.paymentMode || 'N/A'
    }));

    const totalSales = filteredOrders.reduce((sum, o) => sum + o.total, 0);

    const logoPath = path.resolve(__dirname, '../public/images/zicon.jpg');
    const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' });
    const logoData = `data:image/jpeg;base64,${logoBase64}`;

    const templatePath = path.join(__dirname, '../views/pdfTemplate.ejs');
    const html = await ejs.renderFile(templatePath, {
      logoData,
      startDate: start || 'All Time',
      endDate: end || 'All Time',
      generatedAt: new Date().toLocaleString(),
      orders: filteredOrders,
      totalSales
    });

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Sales_${start || 'all'}_to_${end || 'all'}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).send('Internal Server Error');
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
      { $sort: { totalQuantity: -1 } },
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
    const now = new Date();
    const month = now.toLocaleString("default", { month: "long" });
    const year = now.getFullYear();
    const [totalUsers, totalStaff, totalKitchenStaff] = await Promise.all([
      User.countDocuments(),
      Staff.countDocuments(),
      KitchenStaff.countDocuments(),
    ]);
    const [pendingOrdersCount, completedOrdersCount, cancelledOrdersCount] =
      await Promise.all([
        Order.countDocuments({ status: "Pending" }),
        Order.countDocuments({ status: "Completed" }),
        Order.countDocuments({ status: "Cancelled" }),
      ]);
    const totalOrders =
      pendingOrdersCount + completedOrdersCount + cancelledOrdersCount;
    const completedOrders = await Order.find({ status: "Completed" });
    const totalSales = completedOrders.reduce(
      (sum, o) => sum + (o.totalAmount || 0),
      0
    );
    const products = await Product.find();
    const productStockChartData = products.map((p) => ({
      name: p.productName || p.name,
      stock: p.stock,
    }));
    let totalStocks = 0;
    let lowStockWarning = [];
    products.forEach((p) => {
      totalStocks += p.stock;
      if (p.stock < 20) lowStockWarning.push(p.productName || p.name);
    });
    const stockBreakdown = {
      total: totalStocks,
      products: productStockChartData,
    };
    const orders = await Order.find({}).populate("items.productId");
    const productSalesMap = {};
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const pid = item.productId?._id?.toString();
        if (!pid) return;
        productSalesMap[pid] = (productSalesMap[pid] || 0) + item.quantity;
      });
    });
    const topProductIds = Object.entries(productSalesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => id);
    const mostBoughtProducts = await Product.find({
      _id: { $in: topProductIds },
    });
    const mostBoughtProductsWithQty = mostBoughtProducts.map((p) => ({
      productName: p.productName || p.name,
      productImage: p.productImage || "/images/default.jpg",
      totalQuantity: productSalesMap[p._id.toString()] || 0,
    }));
    const startOfDay = moment().startOf("day").toDate();
    const endOfDay = moment().endOf("day").toDate();
    const todaysOrders = await Order.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).populate("items.productId");
    const kitchenCompletedOrders = await CompletedOrder.find({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).populate("items.productId");
    const combinedOrders = [...todaysOrders, ...kitchenCompletedOrders];
    const allDailyOrders = combinedOrders.map((order) => {
      const productMap = {};
      order.items.forEach((item) => {
        const productName =
          item.productId?.productName ||
          item.productId?.name ||
          "Unknown Product";
        productMap[productName] =
          (productMap[productName] || 0) + item.quantity;
      });
      const productList = Object.entries(productMap)
        .map(([name, qty]) => `${name} (x${qty})`)
        .join(", ");
      return {
        orderId: order._id.toString(),
        status: order.status || "Completed",
        productList,
        totalAmount: order.totalAmount || 0,
        image:
          order.items[0]?.productId?.productImage || "/images/default.jpg",
      };
    });
    const paginatedDailyOrders = allDailyOrders.slice(skip, skip + limit);
    const totalDailyOrders = allDailyOrders.length;
    const totalPages = Math.ceil(totalDailyOrders / limit);
    res.render("admin/index", {
      month,
      year,
      currentPage: page,
      totalPages,
      limit,
      totalUsers,
      totalStaff,
      totalKitchenStaff,
      totalOrders,
      totalSales,
      totalStocks,
      usersBreakdown: {
        total: totalUsers,
        user: totalUsers,
        staff: totalStaff,
        kitchen: totalKitchenStaff,
      },
      ordersBreakdown: {
        pending: pendingOrdersCount,
        completed: completedOrdersCount,
        cancelled: cancelledOrdersCount,
      },
      stockBreakdown,
      products,
      lowStockWarning,
      productStockChartData,
      mostBoughtProducts: mostBoughtProductsWithQty,
      dailyOrders: paginatedDailyOrders,
      successMessage: res.locals.successMessage || null,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("Server error");
  }
};

exports.getSales = async (req, res) => {
  try {
    const completedOrders = await CompletedOrder.find().populate('items.productId');
    const totalOrders = await CompletedOrder.countDocuments();
    const totalSales = completedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const dailyRevenue = {};
    completedOrders.forEach(order => {
      const day = moment(order.createdAt).format('YYYY-MM-DD');
      dailyRevenue[day] = (dailyRevenue[day] || 0) + (order.totalAmount || 0);
    });
    const numDays = Object.keys(dailyRevenue).length || 1;
    const avgDaily = totalSales / numDays;
    let bestDay = null;
    let bestRevenue = 0;
    for (const [day, revenue] of Object.entries(dailyRevenue)) {
      if (revenue > bestRevenue) {
        bestRevenue = revenue;
        bestDay = day;
      }
    }
    const formattedBestDay = bestDay ? moment(bestDay).format('MMMM D, YYYY') : 'N/A';
    const customerTotals = {};
    completedOrders.forEach(order => {
      const name = `${order.userInfoSnapshot?.firstName || ''} ${order.userInfoSnapshot?.lastName || ''}`.trim() || 'Unknown';
      customerTotals[name] = (customerTotals[name] || 0) + order.totalAmount;
    });
    const topCustomer = Object.entries(customerTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const weeklyTrends = await fetchWeeklyProductSalesTrends();
    const weeklyLabels = weeklyTrends.map(t => {
      const startOfWeek = moment(t.week, 'YYYY-[W]WW').startOf('week');
      const weekNum = startOfWeek.week() - startOfWeek.clone().startOf('month').week() + 1;
      return `Week ${weekNum} (${startOfWeek.format('MMMM')})`;
    });
    const weeklySales = {};
    weeklyTrends.forEach(t => weeklySales[t.week] = t.total);
    const monthlyTotals = await fetchMonthlyProductSalesTrends();
    const monthlyLabels = [...Array(12).keys()].map(m => moment().month(m).format('MMMM'));
    const monthlySales = {};
    monthlyLabels.forEach(monthName => {
      const monthKey = moment().month(monthName).format('YYYY-MM');
      monthlySales[monthName] = monthlyTotals[monthKey] || 0;
    });
    const yearlySales = {};
    completedOrders.forEach(order => {
      const year = moment(order.createdAt).format('YYYY');
      yearlySales[year] = (yearlySales[year] || 0) + order.totalAmount;
    });
    const yearlyLabels = Object.keys(yearlySales);
    res.render('admin/sales', {
      title: 'Sales Management',
      totalSales,
      dailySales: dailyRevenue,
      avgDaily,
      totalOrders,
      bestDay: formattedBestDay,
      topCustomer,
      weeklyLabels,
      weeklySales,
      monthlyLabels,
      monthlySales,
      yearlyLabels,
      yearlySales
    });
  } catch (err) {
    console.error('Error loading sales page:', err);
    res.status(500).send('Failed to load sales page.');
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
  const { productName, price, stock, category } = req.body;
  try {
    if (!req.file) {
      req.flash('error', 'Product image is required');
      return res.redirect('/admin/products');
    }
    const newProduct = new Product({
      productName,
      price,
      stock,
      productImage: `/uploads/${req.file.filename}`,
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
  try {
    const { productName, price, stock, category } = req.body;
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      req.flash('error', 'Product not found');
      return res.redirect('/admin/products');
    }
    product.productName = productName || product.productName;
    product.price = price || product.price;
    product.stock = stock || product.stock;
    product.category = category || product.category;
    if (req.file) {
      product.productImage = `/uploads/${req.file.filename}`;
    }
    await product.save();
    req.flash('success', '✅ Product updated successfully!');
    res.redirect('/admin/products');
  } catch (err) {
    console.error('Error updating product:', err);
    req.flash('error', '❌ Error updating product');
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
    const newStaff = new Staff({
      s_username,
      s_fname,
      s_lname,
      email: s_email,
      s_password
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
    const newKitchenStaff = new KitchenStaff({
      username,
      firstName,
      lastName,
      email,
      password
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

exports.getSpoilage = async (req, res) => {
  try {
    const products = await Product.find();
    const totalSpoilage = products.reduce((sum, p) => sum + (p.spoilageQty || 0), 0);
    const totalLostIncome = products.reduce((sum, p) => sum + (p.lostIncome || 0), 0);
    const mostWasted = products.reduce(
      (prev, curr) => (curr.lostIncome > prev.lostIncome ? curr : prev),
      { lostIncome: 0 }
    );
    let salesTotal = 0;
    if (typeof Order !== "undefined") {
      const last7days = new Date();
      last7days.setDate(last7days.getDate() - 7);
      const orders = await Order.find({ createdAt: { $gte: last7days } });
      salesTotal = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    } else {
      salesTotal = 50000;
    }
    const salesLostPercent = salesTotal
      ? ((totalLostIncome / salesTotal) * 100).toFixed(1)
      : 0;
    const categoryTotals = {};
    products.forEach(p => {
      const category = p.category || "Uncategorized";
      categoryTotals[category] =
        (categoryTotals[category] || 0) + (p.lostIncome || 0);
    });
    res.render("admin/spoilage", {
      title: "Spoilage Management",
      products,
      kpis: {
        totalSpoilage,
        totalLostIncome,
        mostWasted: mostWasted.productName || "-",
        salesLostPercent,
        categoryTotals
      }
    });
  } catch (error) {
    console.error("Error loading spoilage page:", error);
    res.status(500).render("error", { error: "Failed to load spoilage page." });
  }
};

exports.reportDamage = async (req, res) => {
  const { productId, damaged } = req.body;
  const damagedQty = parseInt(damaged, 10);
  if (isNaN(damagedQty) || damagedQty <= 0) {
    return res.status(400).send('Invalid damaged quantity');
  }
  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).send('Product not found');
    const incomeLoss = damagedQty * product.price;
    product.stock = (product.stock || 0) - damagedQty;
    product.damaged = (product.damaged || 0) + damagedQty;
    product.lostIncome = (product.lostIncome || 0) + incomeLoss;
    await product.save();
    res.redirect('/admin/spoilage');
  } catch (error) {
    console.error('Error reporting damage:', error);
    res.status(500).send('Internal Server Error');
  }
};
