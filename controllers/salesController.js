const CompletedOrder = require('../models/CompletedOrder');
const moment = require('moment');

exports.getSalesPage = async (req, res) => {
  try {
    const completedOrders = await CompletedOrder.find().populate('items.productId').sort({ createdAt: -1 });

    let totalSales = 0;
    let salesData = [];

    // DAILY SALES BY DAY OF WEEK (Monday=0 to Sunday=6)
    const startOfWeek = moment().startOf('isoWeek'); // Monday
    const endOfWeek = moment().endOf('isoWeek'); // Sunday

    // Initialize dailySales for 7 days of the week
    const dailySales = {
      0: 0, // Monday
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0  // Sunday
    };

    completedOrders.forEach(order => {
      totalSales += order.totalAmount || 0;

      // Collect salesData per item (for weekly, monthly, yearly grouping)
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

      // If order is in current week, add to dailySales by day of week
      const orderDate = moment(order.createdAt);
      if (orderDate.isBetween(startOfWeek, endOfWeek, null, '[]')) {
        const dayIndex = orderDate.isoWeekday() - 1; // isoWeekday: Mon=1...Sun=7
        dailySales[dayIndex] += order.totalAmount || 0;
      }
    });

    // Helper function to group sales by given date format
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

    res.render('admin/sales', {
      totalSales,
      weeklyLabels,
      weeklySales,
      monthlyLabels,
      monthlySales,
      yearlyLabels,
      yearlySales,
      dailySales  // <-- daily sales keyed by day index (0=Mon, ... 6=Sun)
    });

  } catch (error) {
    console.error('Error loading sales data:', error);
    res.status(500).send('Server Error');
  }
};
