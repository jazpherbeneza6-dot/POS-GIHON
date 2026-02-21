const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all invoices
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching invoices:', err);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// GET next available invoice number (must be before /:id)
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT COUNT(*) FROM invoices');
        const count = parseInt(result.rows[0].count) + 1;
        const invoice_number = 'INV-' + String(count).padStart(6, '0');
        res.json({ invoice_number });
    } catch (err) {
        console.error('Error getting next invoice number:', err);
        res.status(500).json({ error: 'Failed to get next invoice number' });
    }
});

// GET single invoice by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const invoiceResult = await pool.query(
            `SELECT inv.*,
                    c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country,
                    c.shipping_street, c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country
             FROM invoices inv
             LEFT JOIN customers c ON inv.customer_id = c.id
             WHERE inv.id = $1`,
            [req.params.id]
        );
        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const invoice = invoiceResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
        invoice.items = itemsResult.rows;

        res.json(invoice);
    } catch (err) {
        console.error('Error fetching invoice:', err);
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

// POST create new invoice
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            invoice_date,
            due_date,
            order_number,
            customer_id,
            customer_name,
            salesperson_name,
            payment_terms,
            subject,
            status,
            notes,
            terms_conditions,
            sub_total,
            discount,
            discount_type,
            discount_value,
            shipping_charges,
            adjustment,
            total,
            items
        } = req.body;

        // Generate invoice number: INV-XXXXXX
        const countResult = await pool.query('SELECT COUNT(*) FROM invoices');
        const count = parseInt(countResult.rows[0].count) + 1;
        const invoice_number = 'INV-' + String(count).padStart(6, '0');

        const result = await pool.query(
            `INSERT INTO invoices (invoice_number, invoice_date, due_date, order_number, customer_id, customer_name, salesperson_name, payment_terms, subject, status, notes, terms_conditions, sub_total, discount, discount_type, discount_value, shipping_charges, adjustment, total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
             RETURNING *`,
            [invoice_number, invoice_date || new Date(), due_date || null, order_number || '', customer_id, customer_name, salesperson_name, payment_terms, subject || '', status || 'DRAFT', notes || '', terms_conditions || '', sub_total || 0, discount || 0, discount_type || '%', discount_value || 0, shipping_charges || 0, adjustment || 0, total || 0]
        );

        const invoice = result.rows[0];

        // Insert invoice items if provided
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO invoice_items (invoice_id, item_name, quantity, rate, tax, amount, discounts)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [invoice.id, item.item_name, item.quantity || 1, item.rate || 0, item.tax, item.amount || 0, JSON.stringify(item.discounts || [])]
                );
            }
        }

        res.status(201).json(invoice);
    } catch (err) {
        console.error('Error creating invoice:', err);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// PUT update invoice status
router.put('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE invoices SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating invoice status:', err);
        res.status(500).json({ error: 'Failed to update invoice status' });
    }
});

// DELETE invoice
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
        await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
        res.json({ message: 'Invoice deleted' });
    } catch (err) {
        console.error('Error deleting invoice:', err);
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

module.exports = router;
