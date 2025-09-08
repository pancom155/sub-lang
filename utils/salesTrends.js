const CompletedOrder = require('../models/CompletedOrder');
const moment = require('moment');

async function fetchWeeklyProductSalesTrends() {
    const completedOrders = await CompletedOrder.find();

    const weeklySalesMap = {};

    completedOrders.forEach(order => {
        const weekKey = moment(order.createdAt).format('YYYY-[W]WW');
        weeklySalesMap[weekKey] = (weeklySalesMap[weekKey] || 0) + (order.totalAmount || 0);
    });

    const weeklyTrends = Object.entries(weeklySalesMap).map(([week, total]) => ({ week, total }));

    weeklyTrends.sort((a, b) => a.week.localeCompare(b.week));

    return weeklyTrends;
}

async function fetchMonthlyProductSalesTrends() {
    const completedOrders = await CompletedOrder.find();

    const monthlySalesMap = {};

    completedOrders.forEach(order => {
        const monthKey = moment(order.createdAt).format('YYYY-MM');
        monthlySalesMap[monthKey] = (monthlySalesMap[monthKey] || 0) + (order.totalAmount || 0);
    });

    return monthlySalesMap;
}

module.exports = {
    fetchWeeklyProductSalesTrends,
    fetchMonthlyProductSalesTrends
};
