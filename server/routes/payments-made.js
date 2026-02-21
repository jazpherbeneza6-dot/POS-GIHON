const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all payments made
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT pm.*
            FROM payments_made pm
            ORDER BY pm.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching payments made:', err);
        res.status(500).json({ error: 'Failed to fetch payments made' });
    }
});

// GET next payment number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT COUNT(*) FROM payments_made');
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
        const result = await pool.query('SELECT * FROM payments_made WHERE id = $1', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching payment:', err);
        res.status(500).json({ error: 'Failed to fetch payment' });
    }
});

// POST create new payment made
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            payment_number, bill_id, bill_number, supplier_id, supplier_name,
            amount_paid, bank_charges, tax_deducted, payment_date, payment_made_on,
            payment_mode, paid_through, location, reference_number, notes, status
        } = req.body;

        const result = await pool.query(
            `INSERT INTO payments_made (payment_number, bill_id, bill_number, supplier_id, supplier_name, amount_paid, bank_charges, tax_deducted, payment_date, payment_made_on, payment_mode, paid_through, location, reference_number, notes, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [payment_number, bill_id || null, bill_number || null, supplier_id || null, supplier_name || null, amount_paid || 0, bank_charges || 0, tax_deducted || false, payment_date || new Date(), payment_made_on || null, payment_mode || 'Cash', paid_through || 'Petty Cash', location || 'Head Office', reference_number || '', notes || '', status || 'DRAFT']
        );

        // If status is PAID, update the bill status to PAID
        if (status === 'PAID' && bill_id) {
            await pool.query('UPDATE bills SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['paid', bill_id]);
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating payment made:', err);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

// PATCH mark payment as paid
router.patch('/:id/mark-paid', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(
            `UPDATE payments_made SET status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const payment = result.rows[0];

        // Also update the linked bill status to paid
        if (payment.bill_id) {
            await pool.query('UPDATE bills SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['paid', payment.bill_id]);
        }

        res.json(payment);
    } catch (err) {
        console.error('Error marking payment as paid:', err);
        res.status(500).json({ error: 'Failed to mark payment as paid' });
    }
});

// DELETE payment
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('DELETE FROM payments_made WHERE id = $1 RETURNING *', [req.params.id]);
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
