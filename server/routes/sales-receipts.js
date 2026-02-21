const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all sales receipts
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM sales_receipts ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales receipts:', err);
        res.status(500).json({ error: 'Failed to fetch sales receipts' });
    }
});

// GET next available receipt number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT COUNT(*) FROM sales_receipts');
        const count = parseInt(result.rows[0].count) + 1;
        const receipt_number = 'SR-' + String(count).padStart(5, '0');
        res.json({ receipt_number });
    } catch (err) {
        console.error('Error getting next receipt number:', err);
        res.status(500).json({ error: 'Failed to get next receipt number' });
    }
});

// GET single sales receipt by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const receiptResult = await pool.query(
            `SELECT sr.*, c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country
             FROM sales_receipts sr
             LEFT JOIN customers c ON sr.customer_id = c.id
             WHERE sr.id = $1`,
            [req.params.id]
        );
        if (receiptResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sales receipt not found' });
        }
        const receipt = receiptResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM sales_receipt_items WHERE sales_receipt_id = $1', [receipt.id]);
        receipt.items = itemsResult.rows;

        res.json(receipt);
    } catch (err) {
        console.error('Error fetching sales receipt:', err);
        res.status(500).json({ error: 'Failed to fetch sales receipt' });
    }
});

// POST create new sales receipt
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            receipt_date,
            reference_number,
            customer_id,
            customer_name,
            salesperson_name,
            payment_mode,
            deposit_to,
            status,
            notes,
            terms_conditions,
            sub_total,
            discount,
            shipping_charges,
            adjustment,
            total,
            items
        } = req.body;

        // Generate receipt number: SR-XXXXX
        const countResult = await pool.query('SELECT COUNT(*) FROM sales_receipts');
        const count = parseInt(countResult.rows[0].count) + 1;
        const receipt_number = 'SR-' + String(count).padStart(5, '0');

        const result = await pool.query(
            `INSERT INTO sales_receipts (receipt_number, receipt_date, reference_number, customer_id, customer_name, salesperson_name, payment_mode, deposit_to, status, notes, terms_conditions, sub_total, discount, shipping_charges, adjustment, total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [receipt_number, receipt_date || new Date(), reference_number, customer_id, customer_name, salesperson_name, payment_mode || '', deposit_to || '', status || 'DRAFT', notes, terms_conditions, sub_total || 0, discount || 0, shipping_charges || 0, adjustment || 0, total || 0]
        );

        const receipt = result.rows[0];

        // Insert receipt items
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO sales_receipt_items (sales_receipt_id, item_id, item_name, quantity, rate, tax, amount, discounts)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [receipt.id, item.item_id || null, item.item_name, item.quantity || 1, item.rate || 0, item.tax || null, item.amount || 0, JSON.stringify(item.discounts || [])]
                );
            }
        }

        res.status(201).json(receipt);
    } catch (err) {
        console.error('Error creating sales receipt:', err);
        res.status(500).json({ error: 'Failed to create sales receipt' });
    }
});

// PUT update sales receipt status
router.put('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE sales_receipts SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sales receipt not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating sales receipt status:', err);
        res.status(500).json({ error: 'Failed to update sales receipt status' });
    }
});

// DELETE sales receipt
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM sales_receipt_items WHERE sales_receipt_id = $1', [req.params.id]);
        await pool.query('DELETE FROM sales_receipts WHERE id = $1', [req.params.id]);
        res.json({ message: 'Sales receipt deleted' });
    } catch (err) {
        console.error('Error deleting sales receipt:', err);
        res.status(500).json({ error: 'Failed to delete sales receipt' });
    }
});

module.exports = router;
