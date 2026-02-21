const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all sales returns
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT sr.*, COALESCE(SUM(sri.return_quantity), 0) AS total_return_qty
            FROM sales_returns sr
            LEFT JOIN sales_return_items sri ON sri.sales_return_id = sr.id
            GROUP BY sr.id
            ORDER BY sr.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales returns:', err);
        res.status(500).json({ error: 'Failed to fetch sales returns' });
    }
});

// GET next RMA number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT COUNT(*) FROM sales_returns');
        const count = parseInt(result.rows[0].count) + 1;
        const rma_number = 'RMA-' + String(count).padStart(5, '0');
        res.json({ rma_number });
    } catch (err) {
        console.error('Error getting next RMA number:', err);
        res.status(500).json({ error: 'Failed to get next RMA number' });
    }
});

// GET sales returns by sales order ID
router.get('/by-order/:orderId', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(
            'SELECT * FROM sales_returns WHERE sales_order_id = $1 ORDER BY created_at DESC',
            [req.params.orderId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales returns for order:', err);
        res.status(500).json({ error: 'Failed to fetch sales returns' });
    }
});

// GET single sales return by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const returnResult = await pool.query('SELECT * FROM sales_returns WHERE id = $1', [req.params.id]);
        if (returnResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sales return not found' });
        }
        const salesReturn = returnResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM sales_return_items WHERE sales_return_id = $1', [salesReturn.id]);
        salesReturn.items = itemsResult.rows;

        res.json(salesReturn);
    } catch (err) {
        console.error('Error fetching sales return:', err);
        res.status(500).json({ error: 'Failed to fetch sales return' });
    }
});

// POST create new sales return
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            rma_number,
            return_date,
            warehouse_location,
            reason,
            credit_only,
            sales_order_id,
            sales_order_number,
            customer_name,
            status,
            items
        } = req.body;

        const result = await pool.query(
            `INSERT INTO sales_returns (rma_number, return_date, warehouse_location, reason, credit_only, sales_order_id, sales_order_number, customer_name, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [rma_number, return_date || new Date(), warehouse_location || 'Head Office', reason || '', credit_only || false, sales_order_id, sales_order_number, customer_name, status || 'DRAFT']
        );

        const salesReturn = result.rows[0];

        // Insert return items
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO sales_return_items (sales_return_id, item_name, item_id, shipped_quantity, returned_quantity, return_quantity, rate, amount)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [salesReturn.id, item.item_name, item.item_id || null, item.shipped_quantity || 0, item.returned_quantity || 0, item.return_quantity || 0, item.rate || 0, item.amount || 0]
                );
            }
        }

        res.status(201).json(salesReturn);
    } catch (err) {
        console.error('Error creating sales return:', err);
        res.status(500).json({ error: 'Failed to create sales return' });
    }
});

// DELETE sales return
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM sales_return_items WHERE sales_return_id = $1', [req.params.id]);
        await pool.query('DELETE FROM sales_returns WHERE id = $1', [req.params.id]);
        res.json({ message: 'Sales return deleted' });
    } catch (err) {
        console.error('Error deleting sales return:', err);
        res.status(500).json({ error: 'Failed to delete sales return' });
    }
});

module.exports = router;
