const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all payments received
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT pr.*, 
                   c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country,
                   c.shipping_street, c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country
            FROM payments_received pr
            LEFT JOIN customers c ON pr.customer_id = c.id
            ORDER BY pr.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching payments received:', err);
        res.status(500).json({ error: 'Failed to fetch payments received' });
    }
});

// GET next payment number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT COUNT(*) FROM payments_received');
        const count = parseInt(result.rows[0].count) + 1;
        res.json({ next_number: String(count) });
    } catch (err) {
        console.error('Error getting next payment number:', err);
        res.status(500).json({ error: 'Failed to get next payment number' });
    }
});

// GET single payment by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT pr.*, 
                   c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country,
                   c.shipping_street, c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country
            FROM payments_received pr
            LEFT JOIN customers c ON pr.customer_id = c.id
            WHERE pr.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const payment = result.rows[0];

        // Also fetch the associated invoice details
        if (payment.invoice_id) {
            const invResult = await pool.query('SELECT invoice_number, invoice_date, total FROM invoices WHERE id = $1', [payment.invoice_id]);
            if (invResult.rows.length > 0) {
                payment.invoice = invResult.rows[0];
            }
        }

        res.json(payment);
    } catch (err) {
        console.error('Error fetching payment:', err);
        res.status(500).json({ error: 'Failed to fetch payment' });
    }
});

// POST create new payment
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            payment_number, invoice_id, invoice_number, customer_id, customer_name,
            amount_received, bank_charges, tax_deducted, payment_date, payment_received_on,
            payment_mode, deposit_to, location, reference_number, notes, status, salesperson_name
        } = req.body;

        const result = await pool.query(
            `INSERT INTO payments_received (payment_number, invoice_id, invoice_number, customer_id, customer_name, amount_received, bank_charges, tax_deducted, payment_date, payment_received_on, payment_mode, deposit_to, location, reference_number, notes, status, salesperson_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING *`,
            [payment_number, invoice_id, invoice_number, customer_id, customer_name, amount_received || 0, bank_charges || 0, tax_deducted || false, payment_date || new Date(), payment_received_on || null, payment_mode || 'Cash', deposit_to || 'Petty Cash', location || 'Head Office', reference_number || '', notes || '', status || 'DRAFT', salesperson_name || '']
        );

        // If status is PAID, update the invoice status to PAID
        if (status === 'PAID' && invoice_id) {
            await pool.query('UPDATE invoices SET status = $1 WHERE id = $2', ['PAID', invoice_id]);
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating payment:', err);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

// PUT update payment status (mark as paid)
router.put('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE payments_received SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        // If marking as PAID, also update the invoice
        const payment = result.rows[0];
        if (status === 'PAID' && payment.invoice_id) {
            await pool.query('UPDATE invoices SET status = $1 WHERE id = $2', ['PAID', payment.invoice_id]);
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating payment status:', err);
        res.status(500).json({ error: 'Failed to update payment status' });
    }
});

// DELETE payment
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('DELETE FROM payments_received WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        res.json({ message: 'Payment deleted successfully' });
    } catch (err) {
        console.error('Error deleting payment:', err);
        res.status(500).json({ error: 'Failed to delete payment' });
    }
});

module.exports = router;
