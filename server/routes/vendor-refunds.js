const express = require('express');
const router = express.Router();
const database = require('../database');

// GET next refund number
router.get('/next-number', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT COUNT(*) as cnt FROM vendor_refunds');
        const count = parseInt(result.rows[0].cnt) || 0;
        res.json({ refund_number: 'RF-' + String(count + 1).padStart(5, '0') });
    } catch (error) {
        console.error('Error generating next refund number:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET all vendor refunds
router.get('/', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT * FROM vendor_refunds ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching vendor refunds:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET refunds by vendor credit ID (must be before /:id to avoid matching 'by-credit' as id)
router.get('/by-credit/:creditId', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(
            'SELECT * FROM vendor_refunds WHERE vendor_credit_id = $1 ORDER BY created_at DESC',
            [req.params.creditId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching refunds by credit:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET single vendor refund
router.get('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT * FROM vendor_refunds WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vendor refund not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching vendor refund:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST create vendor refund
router.post('/', async (req, res) => {
    try {
        const {
            refund_number, vendor_credit_id, credit_number,
            supplier_id, supplier_name,
            refund_amount, refund_date, payment_mode, deposit_to,
            reference_number, notes, currency_code, exchange_rate
        } = req.body;

        if (!vendor_credit_id) {
            return res.status(400).json({ error: 'Vendor credit ID is required' });
        }
        if (!refund_amount || parseFloat(refund_amount) <= 0) {
            return res.status(400).json({ error: 'Refund amount must be greater than 0' });
        }

        const db = database.getDb();

        // Fetch the vendor credit to validate
        const creditResult = await db.query('SELECT * FROM vendor_credits WHERE id = $1', [vendor_credit_id]);
        if (creditResult.rows.length === 0) {
            return res.status(404).json({ error: 'Vendor credit not found' });
        }
        const credit = creditResult.rows[0];
        const creditTotal = parseFloat(credit.total_amount) || 0;
        const alreadyRefunded = parseFloat(credit.refunded_amount) || 0;
        const remainingBalance = creditTotal - alreadyRefunded;
        const amt = parseFloat(refund_amount);

        if (amt > remainingBalance + 0.001) { // small tolerance for floating point
            return res.status(400).json({
                error: `Refund amount (${amt.toFixed(2)}) exceeds remaining credit balance (${remainingBalance.toFixed(2)})`
            });
        }

        // Auto-generate refund number if not provided
        let finalRefundNumber = refund_number;
        if (!finalRefundNumber) {
            const countResult = await db.query('SELECT COUNT(*) as cnt FROM vendor_refunds');
            const count = parseInt(countResult.rows[0].cnt) || 0;
            finalRefundNumber = 'RF-' + String(count + 1).padStart(5, '0');
        }

        const exRate = parseFloat(exchange_rate) || parseFloat(credit.exchange_rate) || 1;
        const cc = currency_code || credit.currency_code || 'PHP';

        let refundId;
        await database.transaction(async (client) => {
            // 1. Insert the refund record
            const refundResult = await client.query(`
                INSERT INTO vendor_refunds (
                    refund_number, vendor_credit_id, credit_number,
                    supplier_id, supplier_name,
                    refund_amount, refund_date, payment_mode, deposit_to,
                    reference_number, notes, currency_code, exchange_rate, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'PAID')
                RETURNING id
            `, [
                finalRefundNumber,
                vendor_credit_id,
                credit_number || credit.credit_number,
                supplier_id || credit.supplier_id,
                supplier_name || credit.supplier_name,
                amt,
                refund_date || new Date(),
                payment_mode || 'Cash',
                deposit_to || 'Petty Cash',
                reference_number || null,
                notes || null,
                cc,
                exRate
            ]);
            refundId = refundResult.rows[0].id;

            // 2. Update vendor credit: increment refunded_amount, possibly close
            const newRefunded = alreadyRefunded + amt;
            const newStatus = (newRefunded >= creditTotal - 0.001) ? 'closed' : credit.status;
            await client.query(
                `UPDATE vendor_credits SET refunded_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
                [newRefunded, newStatus, vendor_credit_id]
            );

            // 3. Create accounting entries (double-entry)
            const baseCurrencyAmt = amt * exRate;
            // Debit: Vendor Credits account (reduces the vendor credit liability)
            await client.query(
                `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                ['VENDOR_REFUND_DEBIT', supplier_id || credit.supplier_id, supplier_name || credit.supplier_name,
                    baseCurrencyAmt, 'Vendor Credits', 'vendor_refund', refundId,
                    `Refund ${finalRefundNumber} against ${credit_number || credit.credit_number}`]
            );
            // Credit: Deposit To account (cash/bank goes out)
            await client.query(
                `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                ['VENDOR_REFUND_CREDIT', supplier_id || credit.supplier_id, supplier_name || credit.supplier_name,
                    baseCurrencyAmt, deposit_to || 'Petty Cash', 'vendor_refund', refundId,
                    `Refund ${finalRefundNumber} from ${deposit_to || 'Petty Cash'}`]
            );
        });

        const result = await db.query('SELECT * FROM vendor_refunds WHERE id = $1', [refundId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating vendor refund:', error);
        res.status(500).json({ error: 'Failed to create vendor refund: ' + error.message });
    }
});

module.exports = router;
