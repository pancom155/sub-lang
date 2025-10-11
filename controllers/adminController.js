const User = require('../models/User');
const Product = require('../models/Product');
const bcrypt = require('bcryptjs');
const Order = require('../models/Order');
const Staff = require('../models/Staff');
const CompletedOrder = require('../models/CompletedOrder');
const Review = require('../models/Review');
const moment = require('moment');
const KitchenStaff = require('../models/KitchenStaff');
const { Parser } = require('json2csv');
const { fetchWeeklyProductSalesTrends, fetchMonthlyProductSalesTrends } = require('../utils/salesTrends');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

let puppeteer;
let chromium;

if (process.env.NODE_ENV === 'production') {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} else {
  puppeteer = require('puppeteer');
}

const resolveImageUrl = (req, img) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  if (!img) return `${origin}/images/default.jpg`;
  if (typeof img !== 'string') return `${origin}/images/default.jpg`;
  if (img.startsWith('http://') || img.startsWith('https://')) return img;
  if (img.startsWith('/')) return `${origin}${img}`;
  return `${origin}/uploads/${img}`;
};

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

    let logoData = null;
    try {
      const logoPath = path.resolve(__dirname, '../public/images/zicon.jpg');
      if (fs.existsSync(logoPath)) {
        const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' });
        logoData = `data:image/jpeg;base64,${logoBase64}`;
      }
    } catch (e) {
      console.warn('Logo not found, skipping logo in PDF.');
    }

    const templatePath = path.join(__dirname, '../views/pdfTemplate.ejs');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Missing template file: ${templatePath}`);
    }

    const html = await ejs.renderFile(templatePath, {
      logoData,
      startDate: start || 'All Time',
      endDate: end || 'All Time',
      generatedAt: new Date().toLocaleString(),
      orders: filteredOrders,
      totalSales
    });

    const browser =
      process.env.NODE_ENV === 'production'
        ? await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless
          })
        : await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });

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
    res.status(500).send(`Internal Server Error: ${err.message}`);
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

    const selectedSalesMonth = parseInt(req.query.salesMonth) || now.getMonth() + 1;
    const selectedSalesYear = parseInt(req.query.salesYear) || now.getFullYear();
    const selectedOrdersMonth = parseInt(req.query.ordersMonth) || now.getMonth() + 1;
    const selectedOrdersYear = parseInt(req.query.ordersYear) || now.getFullYear();

    const salesMonthName = new Date(selectedSalesYear, selectedSalesMonth - 1).toLocaleString("default", { month: "long" });
    const ordersMonthName = new Date(selectedOrdersYear, selectedOrdersMonth - 1).toLocaleString("default", { month: "long" });

    const [totalUsers, totalStaff, totalKitchenStaff] = await Promise.all([
      User.countDocuments(),
      Staff.countDocuments(),
      KitchenStaff.countDocuments(),
    ]);

    const [pendingOrdersCount, completedOrdersCount, cancelledOrdersCount] = await Promise.all([
      Order.countDocuments({ status: "Pending" }),
      Order.countDocuments({ status: "Completed" }),
      Order.countDocuments({ status: "Cancelled" }),
    ]);
    const totalOrders = pendingOrdersCount + completedOrdersCount + cancelledOrdersCount;

    const allCompletedOrders = await CompletedOrder.find().populate("items.productId");

    const totalSales = allCompletedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const monthlySales = allCompletedOrders.reduce((sum, o) => {
      const orderDate = new Date(o.createdAt);
      if (orderDate.getMonth() + 1 === selectedSalesMonth && orderDate.getFullYear() === selectedSalesYear) {
        return sum + (o.totalAmount || 0);
      }
      return sum;
    }, 0);

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
    const stockBreakdown = { total: totalStocks, products: productStockChartData };

    const productSalesMap = {};
    allCompletedOrders.forEach((order) => {
      order.items.forEach((item) => {
        const pid = item.productId?._id?.toString();
        if (!pid) return;
        productSalesMap[pid] = (productSalesMap[pid] || 0) + item.quantity;
      });
    });

    const mostBoughtProductsWithQty = products
      .map((p) => ({
        productName: p.productName || p.name,
        productImage: p.productImage || "/images/default.jpg",
        totalQuantity: productSalesMap[p._id.toString()] || 0,
      }))
      .filter(p => p.totalQuantity > 0) // ✅ remove products with 0 sales
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 6);

    const productTrendData = [];
    for (let i = 5; i >= 0; i--) {
      const start = moment().subtract(i, "months").startOf("month").toDate();
      const end = moment().subtract(i, "months").endOf("month").toDate();
      const monthOrders = allCompletedOrders.filter((o) => o.createdAt >= start && o.createdAt <= end);
      const monthlyTotal = monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      productTrendData.push({ month: moment(start).format("MMM YYYY"), sales: monthlyTotal });
    }

    const monthlyOrdersCount = allCompletedOrders.filter((o) => {
      const orderDate = new Date(o.createdAt);
      return orderDate.getMonth() + 1 === selectedOrdersMonth && orderDate.getFullYear() === selectedOrdersYear;
    }).length;

    const startOfDay = moment().startOf("day").toDate();
    const endOfDay = moment().endOf("day").toDate();
    const todaysOrders = allCompletedOrders.filter(o => new Date(o.createdAt) >= startOfDay && new Date(o.createdAt) <= endOfDay);

    const allDailyOrders = todaysOrders.map((order) => {
      const productMap = {};
      order.items.forEach((item) => {
        const productName = item.productId?.productName || item.productId?.name || "Unknown Product";
        productMap[productName] = (productMap[productName] || 0) + item.quantity;
      });
      const productList = Object.entries(productMap).map(([name, qty]) => `${name} (x${qty})`).join(", ");
      return {
        orderId: order._id.toString(),
        status: order.status || "Completed",
        productList,
        totalAmount: order.totalAmount || 0,
        image: order.items[0]?.productId?.productImage || "/images/default.jpg",
      };
    });

    const reviews = await Review.find().populate("productId");
    const totalReviews = reviews.length;
    const avgRating = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(2) : 0;

    const productRatingsMap = {};
    reviews.forEach(r => {
      if (!r.productId) return;
      const pid = r.productId._id.toString();
      if (!productRatingsMap[pid]) productRatingsMap[pid] = { total: 0, count: 0, name: r.productId.productName, image: r.productId.productImage };
      productRatingsMap[pid].total += r.rating;
      productRatingsMap[pid].count += 1;
    });

    const topRatedProducts = Object.values(productRatingsMap)
      .map(p => ({ ...p, avg: p.total / p.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    const paginatedDailyOrders = allDailyOrders.slice(skip, skip + limit);
    const totalDailyOrders = allDailyOrders.length;
    const totalPages = Math.ceil(totalDailyOrders / limit);

    res.render("admin/index", {
      salesMonth: salesMonthName,
      salesYear: selectedSalesYear,
      selectedSalesMonth,
      selectedSalesYear,
      ordersMonth: ordersMonthName,
      ordersYear: selectedOrdersYear,
      selectedOrdersMonth,
      selectedOrdersYear,
      totalSales,
      monthlySales,
      productTrendData,
      monthlyOrdersCount,
      currentPage: page,
      totalPages,
      limit,
      totalUsers,
      totalStaff,
      totalKitchenStaff,
      totalOrders,
      totalStocks,
      reviewKpi: { totalReviews, avgRating, topRatedProducts },
      usersBreakdown: { total: totalUsers, user: totalUsers, staff: totalStaff, kitchen: totalKitchenStaff },
      ordersBreakdown: { pending: pendingOrdersCount, completed: completedOrdersCount, cancelled: cancelledOrdersCount },
      stockBreakdown,
      products: products.map(p => ({ ...p.toObject(), productImage: p.productImage || '/images/default.jpg' })),
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
    const today = moment().startOf('day');
    const oneWeekAgo = today.clone().subtract(6, 'days'); 

    completedOrders.forEach(order => {
      const day = moment(order.createdAt).startOf('day');
      if (day.isSameOrAfter(oneWeekAgo) && day.isSameOrBefore(today)) {
        const key = day.format('YYYY-MM-DD');
        dailyRevenue[key] = (dailyRevenue[key] || 0) + (order.totalAmount || 0);
      }
    });

    for (let i = 0; i < 7; i++) {
      const d = oneWeekAgo.clone().add(i, 'days').format('YYYY-MM-DD');
      if (!dailyRevenue[d]) dailyRevenue[d] = 0;
    }

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
    const prepared = completedOrders.map(o => {
      const items = o.items.map(it => {
        return {
          productName: it.productId?.productName || it.productId?.name || 'Unknown',
          quantity: it.quantity,
          productImage: resolveImageUrl(req, it.productId?.productImage)
        };
      });
      return {
        ...o.toObject(),
        items,
      };
    });
    res.render('admin/orders', {
      orders: prepared,
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

exports.getReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const [reviews, totalReviews, avgRating, fiveStarCount] = await Promise.all([
      Review.find()
        .populate("productId", "productName productImage")
        .populate("userId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Review.countDocuments(),
      Review.aggregate([{ $group: { _id: null, avg: { $avg: "$rating" } } }]),
      Review.countDocuments({ rating: 5 }),
    ]);

    const totalPages = Math.ceil(totalReviews / limit);

    res.render("admin/reviews", {
      reviews,
      currentPage: page,
      totalPages,
      totalReviews,
      avgRating: avgRating.length > 0 ? avgRating[0].avg.toFixed(1) : 0,
      fiveStarCount,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).send("Server error");
  }
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
    const prepared = products.map(p => ({ ...p.toObject ? p.toObject() : p, productImage: resolveImageUrl(req, p.productImage) }));
    res.render('admin/products', {
      products: prepared,
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
    req.flash('success', 'Product updated successfully!');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error updating product');
    res.redirect('/admin/products');
  }
};

exports.deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      req.flash('error', 'Product not found');
      return res.redirect('/admin/products');
    }
    req.flash('success', 'Product deleted successfully!');
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error deleting product');
    res.redirect('/admin/products');
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

    // Validate all fields
    if (!s_username || !s_fname || !s_lname || !s_email || !s_password) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/admin/staff');
    }

    // Ensure @staff.com domain
    if (!s_email.endsWith('@staff.com')) {
      req.flash('error', 'Email must end with @staff.com');
      return res.redirect('/admin/staff');
    }

    // Check if email or username already exists
    const existingEmail = await Staff.findOne({ s_email });
    if (existingEmail) {
      req.flash('error', 'Email already exists.');
      return res.redirect('/admin/staff');
    }

    const existingUsername = await Staff.findOne({ s_username });
    if (existingUsername) {
      req.flash('error', 'Username already exists.');
      return res.redirect('/admin/staff');
    }

    // ✅ Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(s_password, salt);

    // ✅ Create and save new staff
    const newStaff = new Staff({
      s_username,
      s_fname,
      s_lname,
      s_email,
      s_password: hashedPassword,
    });

    await newStaff.save();

    req.flash('success', 'Staff account created successfully.');
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

exports.productMonitoring = async (req, res) => {
  try {
    const selectedMonth = parseInt(req.query.month) || null; 

    const filter = {};
    if (selectedMonth) {
      filter.createdAt = {
        $gte: new Date(`2025-${selectedMonth}-01`),
        $lt: new Date(`2025-${selectedMonth + 1}-01`),
      };
    }

    const orders = await CompletedOrder.find(filter).populate("items.productId");
    const products = await Product.find();
    const stockLabels = products.map(p => p.productName);
    const stockLevels = products.map(p => p.stock);

    let totalSold = 0;
    let totalSales = 0;
    let totalStock = 0;
    let outOfStock = 0;

    const productsSoldMap = {};

    products.forEach(p => {
      totalStock += p.stock;
      if (p.stock === 0) outOfStock++;
    });

    orders.forEach(order => {
      totalSales += order.totalAmount;

      order.items.forEach(item => {
        const product = item.productId;
        if (!product) return;

        totalSold += item.quantity;

        if (!productsSoldMap[product._id]) {
          productsSoldMap[product._id] = {
            productName: product.productName || product.name,
            productImage: product.productImage || "/images/default.jpg",
            stock: product.stock,
            totalQuantity: 0,
            totalSales: 0,
          };
        }

        productsSoldMap[product._id].totalQuantity += item.quantity;
        productsSoldMap[product._id].totalSales += product.price * item.quantity;
      });
    });

    const months = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];

    const labels = months;
    const salesData = months.map((_, idx) => {
      const monthOrders = orders.filter(order => new Date(order.createdAt).getMonth() === idx);
      return monthOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    });
    const stockData = months.map((_, idx) => {
      const monthOrders = orders.filter(order => new Date(order.createdAt).getMonth() === idx);
      return monthOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
    });

    const productsSold = Object.values(productsSoldMap).sort((a, b) => b.totalQuantity - a.totalQuantity);

    res.render("admin/productMonitoring", {
      labels,
      salesData,
      stockData,
      totalSold,
      totalSales,
      totalStock,
      outOfStock,
      productsSold,
      selectedMonth,
      months,
      stockLabels,  
      stockLevels 
    });
  } catch (err) {
    console.error("Error in productMonitoring:", err);
    res.status(500).send("Server Error");
  }
};