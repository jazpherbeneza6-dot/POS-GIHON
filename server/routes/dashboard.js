const express = require('express');
const router = express.Router();
const database = require('../database');

// Top selling items
router.get('/top-selling', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    if (period === 'month') {
      dateFilter = "AND s.date >= NOW() - INTERVAL '1 month'";
    } else if (period === 'week') {
      dateFilter = "AND s.date >= NOW() - INTERVAL '7 days'";
    } else if (period === 'year') {
      dateFilter = "AND s.date >= NOW() - INTERVAL '1 year'";
    }

    const result = await db.query(`
      SELECT 
        i.id,
        i.name,
        i.sku,
        i.barcode,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.total_price) as total_revenue,
        COUNT(DISTINCT si.sale_id) as sale_count
      FROM sales_items si
      JOIN items i ON si.item_id = i.id
      JOIN sales s ON si.sale_id = s.id
      WHERE 1=1 ${dateFilter}
      GROUP BY i.id, i.name, i.sku, i.barcode
      ORDER BY total_quantity_sold DESC
      LIMIT 10
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching top selling items:', error);
    res.status(500).json({ error: 'Failed to fetch top selling items' });
  }
});

// Top stocked items
router.get('/top-stocked', async (req, res) => {
  try {
    const { sort = 'quantity' } = req.query; // 'quantity' or 'value'
    const db = database.getDb();

    let orderBy = 'i.stock_quantity DESC';
    if (sort === 'value') {
      orderBy = '(i.stock_quantity * i.purchase_cost) DESC';
    }

    const result = await db.query(`
      SELECT 
        i.id,
        i.name,
        i.sku,
        i.barcode,
        i.stock_quantity,
        i.purchase_cost,
        (i.stock_quantity * i.purchase_cost) as total_value
      FROM items i
      WHERE i.stock_quantity > 0
      ORDER BY ${orderBy}
      LIMIT 10
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching top stocked items:', error);
    res.status(500).json({ error: 'Failed to fetch top stocked items' });
  }
});

// Sales summary
router.get('/sales-summary', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    if (period === 'month') {
      dateFilter = "date >= NOW() - INTERVAL '1 month'";
    } else if (period === 'week') {
      dateFilter = "date >= NOW() - INTERVAL '7 days'";
    } else if (period === 'year') {
      dateFilter = "date >= NOW() - INTERVAL '1 year'";
    } else if (period === 'today') {
      dateFilter = "DATE(date) = CURRENT_DATE";
    }

    // Only count COMPLETED sales for revenue (not pending or cancelled)
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_sales,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN total_amount END), 0) as average_sale
      FROM sales
      ${dateFilter ? 'WHERE ' + dateFilter : ''}
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});

// Pending actions
router.get('/pending-actions', async (req, res) => {
  try {
    const db = database.getDb();

    // For offline system, we'll check low stock items and recent activities
    const lowStockResult = await db.query(`
      SELECT id, name, sku, stock_quantity
      FROM items
      WHERE stock_quantity <= 5 AND stock_quantity > 0
      ORDER BY stock_quantity ASC
      LIMIT 10
    `);

    // Recent sales (last 24 hours)
    const recentSalesResult = await db.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM sales
      WHERE date >= NOW() - INTERVAL '1 day'
    `);

    // Recent purchases (last 24 hours)
    const recentPurchasesResult = await db.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM purchases
      WHERE date >= NOW() - INTERVAL '1 day'
    `);

    res.json({
      lowStockItems: lowStockResult.rows,
      recentSales: recentSalesResult.rows[0] || { count: 0, total: 0 },
      recentPurchases: recentPurchasesResult.rows[0] || { count: 0, total: 0 }
    });
  } catch (error) {
    console.error('Error fetching pending actions:', error);
    res.status(500).json({ error: 'Failed to fetch pending actions' });
  }
});

// Sales trend for chart
router.get('/sales-trend', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    let groupFormat = '';

    if (period === 'today') {
      dateFilter = "WHERE DATE(date) = CURRENT_DATE";
      groupFormat = "TO_CHAR(date, 'HH24:00')"; // Group by hour for today
    } else if (period === 'week') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '7 days'";
      groupFormat = "TO_CHAR(date, 'Mon DD')"; // Group by day for week
    } else if (period === 'month') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '1 month'";
      groupFormat = "TO_CHAR(date, 'Mon DD')"; // Group by day for month
    } else if (period === 'year') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '1 year'";
      groupFormat = "TO_CHAR(date, 'Mon YYYY')"; // Group by month for year
    }

    const result = await db.query(`
      SELECT 
        ${groupFormat} as label,
        DATE(date) as date_key,
        COUNT(*) as sale_count,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales
      ${dateFilter}
      GROUP BY ${groupFormat}, DATE(date)
      ORDER BY DATE(date) ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    res.status(500).json({ error: 'Failed to fetch sales trend' });
  }
});

// Purchase summary
router.get('/purchase-summary', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    if (period === 'month') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '1 month'";
    } else if (period === 'week') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '7 days'";
    } else if (period === 'year') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '1 year'";
    } else if (period === 'today') {
      dateFilter = "WHERE DATE(date) = CURRENT_DATE";
    }

    const result = await db.query(`
      SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(total_amount), 0) as total_spent,
        COALESCE(AVG(total_amount), 0) as average_purchase
      FROM purchases
      ${dateFilter}
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching purchase summary:', error);
    res.status(500).json({ error: 'Failed to fetch purchase summary' });
  }
});

// Purchase trend for chart
router.get('/purchase-trend', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    let groupFormat = '';

    if (period === 'today') {
      dateFilter = "WHERE DATE(date) = CURRENT_DATE";
      groupFormat = "TO_CHAR(date, 'HH24:00')";
    } else if (period === 'week') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '7 days'";
      groupFormat = "TO_CHAR(date, 'Mon DD')";
    } else if (period === 'month') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '1 month'";
      groupFormat = "TO_CHAR(date, 'Mon DD')";
    } else if (period === 'year') {
      dateFilter = "WHERE date >= NOW() - INTERVAL '1 year'";
      groupFormat = "TO_CHAR(date, 'Mon YYYY')";
    }

    const result = await db.query(`
      SELECT 
        ${groupFormat} as label,
        DATE(date) as date_key,
        COUNT(*) as purchase_count,
        COALESCE(SUM(total_amount), 0) as total_spent
      FROM purchases
      ${dateFilter}
      GROUP BY ${groupFormat}, DATE(date)
      ORDER BY DATE(date) ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching purchase trend:', error);
    res.status(500).json({ error: 'Failed to fetch purchase trend' });
  }
});

module.exports = router;
