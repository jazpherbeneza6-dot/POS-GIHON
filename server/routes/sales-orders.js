const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all sales orders
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM sales_orders ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales orders:', err);
        res.status(500).json({ error: 'Failed to fetch sales orders' });
    }
});

// GET single sales order by ID (with customer address data)
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const orderResult = await pool.query(
            `SELECT so.*,
                    c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country,
                    c.shipping_street, c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country
             FROM sales_orders so
             LEFT JOIN customers c ON so.customer_id = c.id
             WHERE so.id = $1`,
            [req.params.id]
        );
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sales order not found' });
        }
        const order = orderResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM sales_order_items WHERE sales_order_id = $1', [order.id]);
        order.items = itemsResult.rows;

        res.json(order);
    } catch (err) {
        console.error('Error fetching sales order:', err);
        res.status(500).json({ error: 'Failed to fetch sales order' });
    }
});

// POST create new sales order
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            order_date,
            reference_number,
            customer_id,
            customer_name,
            salesperson_name,
            payment_terms,
            status,
            notes,
            sub_total,
            discount,
            total,
            items
        } = req.body;

        // Generate order number: SO-XXXXX
        const countResult = await pool.query('SELECT COUNT(*) FROM sales_orders');
        const count = parseInt(countResult.rows[0].count) + 1;
        const order_number = 'SO-' + String(count).padStart(5, '0');

        const result = await pool.query(
            `INSERT INTO sales_orders (order_number, order_date, reference_number, customer_id, customer_name, salesperson_name, payment_terms, status, notes, sub_total, discount, total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [order_number, order_date || new Date(), reference_number, customer_id, customer_name, salesperson_name, payment_terms, status || 'DRAFT', notes, sub_total || 0, discount || 0, total || 0]
        );

        const order = result.rows[0];

        // Insert order items if provided
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO sales_order_items (sales_order_id, item_name, quantity, rate, tax, amount)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [order.id, item.item_name, item.quantity || 1, item.rate || 0, item.tax, item.amount || 0]
                );
            }
        }

        res.status(201).json(order);
    } catch (err) {
        console.error('Error creating sales order:', err);
        res.status(500).json({ error: 'Failed to create sales order' });
    }
});

// PUT update sales order status
router.put('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE sales_orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sales order not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating sales order status:', err);
        res.status(500).json({ error: 'Failed to update sales order status' });
    }
});

// DELETE sales order
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM sales_order_items WHERE sales_order_id = $1', [req.params.id]);
        await pool.query('DELETE FROM sales_orders WHERE id = $1', [req.params.id]);
        res.json({ message: 'Sales order deleted' });
    } catch (err) {
        console.error('Error deleting sales order:', err);
        res.status(500).json({ error: 'Failed to delete sales order' });
    }
});

module.exports = router;
