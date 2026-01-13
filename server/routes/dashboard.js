const express = require('express');
const router = express.Router();
const database = require('../database');

// Helper function to build date filter from start/end dates or period
function buildDateFilter(req, dateColumn = 'date') {
  const { start, end, period } = req.query;

  // If start and end dates are provided, use them
  if (start && end) {
    return `AND ${dateColumn} >= '${start}' AND ${dateColumn} < '${end}'::date + INTERVAL '1 day'`;
  }

  // Otherwise use period
  switch (period) {
    case 'today':
      return `AND DATE(${dateColumn}) = CURRENT_DATE`;
    case 'yesterday':
      return `AND DATE(${dateColumn}) = CURRENT_DATE - INTERVAL '1 day'`;
    case 'thisWeek':
      return `AND ${dateColumn} >= DATE_TRUNC('week', CURRENT_DATE)`;
    case 'thisMonth':
      return `AND ${dateColumn} >= DATE_TRUNC('month', CURRENT_DATE)`;
    case 'thisYear':
      return `AND ${dateColumn} >= DATE_TRUNC('year', CURRENT_DATE)`;
    case 'previousWeek':
      return `AND ${dateColumn} >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '1 week' AND ${dateColumn} < DATE_TRUNC('week', CURRENT_DATE)`;
    case 'previousMonth':
      return `AND ${dateColumn} >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' AND ${dateColumn} < DATE_TRUNC('month', CURRENT_DATE)`;
    case 'previousYear':
      return `AND ${dateColumn} >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year' AND ${dateColumn} < DATE_TRUNC('year', CURRENT_DATE)`;
    default:
      // Default to this month
      return `AND ${dateColumn} >= DATE_TRUNC('month', CURRENT_DATE)`;
  }
}

// Top selling items
router.get('/top-selling', async (req, res) => {
  try {
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 's.date');

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
      WHERE s.status = 'completed' ${dateFilter}
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
    const { sort = 'quantity' } = req.query;
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

// Sales by channel (for dashboard) - currently all sales are Direct Sales
router.get('/sales-by-channel', async (req, res) => {
  try {
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 'date');

    // Since there's no channel column, group all sales as 'Direct Sales'
    const result = await db.query(`
      SELECT 
        'Direct Sales' as channel,
        COUNT(*) as sale_count,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales
      WHERE status = 'completed' ${dateFilter}
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales by channel:', error);
    res.status(500).json({ error: 'Failed to fetch sales by channel' });
  }
});

// Sales summary (order summary)
router.get('/sales-summary', async (req, res) => {
  try {
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 'date').replace('AND ', 'WHERE ');

    const result = await db.query(`
      SELECT 
        COUNT(*) as total_sales,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN total_amount END), 0) as average_sale
      FROM sales
      ${dateFilter.replace('AND ', 'WHERE ')}
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching sales summary:', error);
    res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});

// Sales trend for chart
router.get('/sales-trend', async (req, res) => {
  try {
    const { period } = req.query;
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 'date').replace('AND ', 'WHERE ');

    // Determine grouping based on period
    let groupFormat = "TO_CHAR(date, 'Mon DD')";
    if (period === 'today' || period === 'yesterday') {
      groupFormat = "TO_CHAR(date, 'HH24:00')";
    } else if (period === 'thisYear' || period === 'previousYear') {
      groupFormat = "TO_CHAR(date, 'Mon YYYY')";
    }

    const result = await db.query(`
      SELECT 
        ${groupFormat} as label,
        DATE(date) as date_key,
        COUNT(*) as sale_count,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM sales
      ${dateFilter.replace('AND ', 'WHERE ')}
      GROUP BY ${groupFormat}, DATE(date)
      ORDER BY DATE(date) ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    res.status(500).json({ error: 'Failed to fetch sales trend' });
  }
});

// Top vendors
router.get('/top-vendors', async (req, res) => {
  try {
    const { sort = 'quantity' } = req.query;
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 'p.date');

    let orderBy = 'total_items DESC';
    if (sort === 'value') {
      orderBy = 'total_spent DESC';
    }

    const result = await db.query(`
      SELECT 
        s.id,
        s.name as vendor_name,
        s.contact_person,
        COUNT(DISTINCT p.id) as purchase_count,
        COALESCE(SUM(pi.quantity), 0) as total_items,
        COALESCE(SUM(p.total_amount), 0) as total_spent
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id ${dateFilter}
      LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
      GROUP BY s.id, s.name, s.contact_person
      HAVING COUNT(p.id) > 0
      ORDER BY ${orderBy}
      LIMIT 10
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching top vendors:', error);
    res.status(500).json({ error: 'Failed to fetch top vendors' });
  }
});

// Receive history
router.get('/receive-history', async (req, res) => {
  try {
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 'p.date');

    const result = await db.query(`
      SELECT 
        p.id,
        p.date,
        COALESCE(p.invoice_number, p.po_number) as reference_number,
        COALESCE(s.name, p.supplier_name, 'Unknown') as vendor_name,
        COALESCE(SUM(pi.quantity), 0) as total_items,
        p.total_amount,
        p.status
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
      WHERE p.status = 'received' ${dateFilter}
      GROUP BY p.id, p.date, p.invoice_number, p.po_number, s.name, p.supplier_name, p.total_amount, p.status
      ORDER BY p.date DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching receive history:', error);
    res.status(500).json({ error: 'Failed to fetch receive history' });
  }
});

// Pending actions
router.get('/pending-actions', async (req, res) => {
  try {
    const db = database.getDb();

    const lowStockResult = await db.query(`
      SELECT id, name, sku, stock_quantity
      FROM items
      WHERE stock_quantity <= 5 AND stock_quantity > 0
      ORDER BY stock_quantity ASC
      LIMIT 10
    `);

    const recentSalesResult = await db.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM sales
      WHERE date >= NOW() - INTERVAL '1 day'
    `);

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

// Purchase summary
router.get('/purchase-summary', async (req, res) => {
  try {
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 'date').replace('AND ', 'WHERE ');

    const result = await db.query(`
      SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(total_amount), 0) as total_spent,
        COALESCE(AVG(total_amount), 0) as average_purchase
      FROM purchases
      ${dateFilter.replace('AND ', 'WHERE ')}
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
    const { period } = req.query;
    const db = database.getDb();
    const dateFilter = buildDateFilter(req, 'date').replace('AND ', 'WHERE ');

    let groupFormat = "TO_CHAR(date, 'Mon DD')";
    if (period === 'today' || period === 'yesterday') {
      groupFormat = "TO_CHAR(date, 'HH24:00')";
    } else if (period === 'thisYear' || period === 'previousYear') {
      groupFormat = "TO_CHAR(date, 'Mon YYYY')";
    }

    const result = await db.query(`
      SELECT 
        ${groupFormat} as label,
        DATE(date) as date_key,
        COUNT(*) as purchase_count,
        COALESCE(SUM(total_amount), 0) as total_spent
      FROM purchases
      ${dateFilter.replace('AND ', 'WHERE ')}
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
