const express = require('express');
const router = express.Router();
const database = require('../database');

// GET credit balance + history for a customer
router.get('/:customerId', async (req, res) => {
    try {
        const pool = database.getDb();
        const customerId = req.params.customerId;

        // Get all credit entries for this customer
        const result = await pool.query(
            'SELECT * FROM customer_credits WHERE customer_id = $1 ORDER BY created_at DESC',
            [customerId]
        );

        // Calculate net balance — count OVERPAYMENTs from finalized payments + CREDIT_NOTEs
        let balance = 0;
        for (const entry of result.rows) {
            if (entry.type === 'OVERPAYMENT') {
                // Only count credits from PAID payments
                if (entry.reference_type === 'payment_received' && entry.reference_id) {
                    const paymentCheck = await pool.query(
                        'SELECT status FROM payments_received WHERE id = $1',
                        [entry.reference_id]
                    );
                    const paymentStatus = paymentCheck.rows.length > 0 ? (paymentCheck.rows[0].status || '').toUpperCase() : '';
                    if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESS') {
                        balance += parseFloat(entry.amount);
                    }
                } else {
                    balance += parseFloat(entry.amount);
                }
            } else if (entry.type === 'CREDIT_NOTE') {
                // Credit notes always count toward unused credits
                balance += parseFloat(entry.amount);
            } else if (entry.type === 'CREDIT_APPLIED') {
                balance -= parseFloat(entry.amount);
            } else if (entry.type === 'REFUND') {
                // Refund entries have negative amounts — adding reduces balance
                balance += parseFloat(entry.amount);
            }
        }

        res.json({
            customer_id: parseInt(customerId),
            balance: Math.max(0, parseFloat(balance.toFixed(2))),
            entries: result.rows
        });
    } catch (err) {
        console.error('Error fetching customer credits:', err);
        res.status(500).json({ error: 'Failed to fetch customer credits' });
    }
});

// POST store excess payment as credit
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const { customer_id, customer_name, amount, type, reference_type, reference_id, description } = req.body;

        if (!customer_id || !amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'customer_id and a positive amount are required' });
        }

        // Insert credit record
        const creditResult = await pool.query(
            `INSERT INTO customer_credits (customer_id, customer_name, amount, type, reference_type, reference_id, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [customer_id, customer_name || '', parseFloat(amount), type || 'OVERPAYMENT', reference_type || null, reference_id || null, description || '']
        );

        // Insert accounting entry
        await pool.query(
            `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                type || 'EXCESS_PAYMENT',
                customer_id,
                customer_name || '',
                parseFloat(amount),
                'Unearned Revenue',
                reference_type || null,
                reference_id || null,
                description || `Excess payment of PHP ${parseFloat(amount).toFixed(2)} stored as customer credit`
            ]
        );

        res.status(201).json(creditResult.rows[0]);
    } catch (err) {
        console.error('Error storing customer credit:', err);
        res.status(500).json({ error: 'Failed to store customer credit' });
    }
});

// POST apply credits to an invoice
router.post('/apply', async (req, res) => {
    try {
        const pool = database.getDb();
        const { customer_id, customer_name, invoice_id, invoice_number, amount } = req.body;

        if (!customer_id || !invoice_id || !amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'customer_id, invoice_id, and a positive amount are required' });
        }

        const applyAmount = parseFloat(amount);

        // Check available balance
        const creditsResult = await pool.query(
            'SELECT * FROM customer_credits WHERE customer_id = $1',
            [customer_id]
        );
        const balance = creditsResult.rows.reduce((sum, entry) => {
            if (entry.type === 'OVERPAYMENT') return sum + parseFloat(entry.amount);
            if (entry.type === 'CREDIT_NOTE') return sum + parseFloat(entry.amount);
            if (entry.type === 'CREDIT_APPLIED') return sum - parseFloat(entry.amount);
            if (entry.type === 'REFUND') return sum + parseFloat(entry.amount);
            return sum;
        }, 0);

        if (applyAmount > balance + 0.01) {
            return res.status(400).json({ error: `Insufficient credits. Available: PHP ${balance.toFixed(2)}` });
        }

        // Insert credit applied record (negative entry)
        const creditResult = await pool.query(
            `INSERT INTO customer_credits (customer_id, customer_name, amount, type, reference_type, reference_id, description)
             VALUES ($1, $2, $3, 'CREDIT_APPLIED', 'invoice', $4, $5) RETURNING *`,
            [customer_id, customer_name || '', applyAmount, invoice_id, `Credit applied to invoice ${invoice_number || invoice_id}`]
        );

        // Insert accounting entry
        await pool.query(
            `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
             VALUES ('CREDIT_APPLIED', $1, $2, $3, 'Unearned Revenue', 'invoice', $4, $5)`,
            [customer_id, customer_name || '', applyAmount, invoice_id, `Credit of PHP ${applyAmount.toFixed(2)} applied to invoice ${invoice_number || invoice_id}`]
        );

        // Update invoice balance_due
        await pool.query(
            `UPDATE invoices SET balance_due = GREATEST(0, COALESCE(balance_due, total) - $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [applyAmount, invoice_id]
        );

        // Check remaining balance and set appropriate status
        const invResult = await pool.query('SELECT balance_due, total FROM invoices WHERE id = $1', [invoice_id]);
        if (invResult.rows.length > 0) {
            const remainingDue = parseFloat(invResult.rows[0].balance_due);
            if (remainingDue <= 0) {
                await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PAID', invoice_id]);
            } else if (remainingDue < parseFloat(invResult.rows[0].total)) {
                await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PARTIALLY_PAID', invoice_id]);
            }
        }

        res.json({ success: true, credit: creditResult.rows[0], remaining_balance: Math.max(0, balance - applyAmount) });
    } catch (err) {
        console.error('Error applying credit:', err);
        res.status(500).json({ error: 'Failed to apply credit' });
    }
});

module.exports = router;
