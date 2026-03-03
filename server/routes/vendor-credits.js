const express = require('express');
const router = express.Router();
const database = require('../database');

// GET next vendor credit number
router.get('/next-number', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT COUNT(*) as cnt FROM vendor_credits');
        const count = parseInt(result.rows[0].cnt) || 0;
        res.json({ credit_number: 'VC-' + String(count + 1).padStart(5, '0') });
    } catch (error) {
        console.error('Error generating next vendor credit number:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET all vendor credits
router.get('/', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT * FROM vendor_credits ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching vendor credits:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET single vendor credit
router.get('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const creditResult = await db.query('SELECT * FROM vendor_credits WHERE id = $1', [req.params.id]);
        if (creditResult.rows.length === 0) {
            return res.status(404).json({ error: 'Vendor credit not found' });
        }
        const itemsResult = await db.query('SELECT * FROM vendor_credit_items WHERE vendor_credit_id = $1 ORDER BY id', [req.params.id]);
        res.json({ ...creditResult.rows[0], items: itemsResult.rows });
    } catch (error) {
        console.error('Error fetching vendor credit:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST create vendor credit
router.post('/', async (req, res) => {
    try {
        const {
            credit_number, bill_id, bill_number, supplier_id, supplier_name,
            credit_date, reference, reason, discount_percent, adjustment,
            items, status
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one item is required' });
        }

        const db = database.getDb();

        // Auto-generate credit number if not provided
        let finalCreditNumber = credit_number;
        if (!finalCreditNumber) {
            const countResult = await db.query('SELECT COUNT(*) as cnt FROM vendor_credits');
            const count = parseInt(countResult.rows[0].cnt) || 0;
            finalCreditNumber = 'VC-' + String(count + 1).padStart(5, '0');
        }

        // Calculate totals
        let subTotal = 0;
        for (const item of items) {
            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            subTotal += qty * rate;
        }

        const discPct = parseFloat(discount_percent) || 0;
        const adj = parseFloat(adjustment) || 0;
        const discountAmt = subTotal * (discPct / 100);
        const totalAmount = subTotal - discountAmt + adj;

        let creditId;
        await database.transaction(async (client) => {
            const creditResult = await client.query(`
                INSERT INTO vendor_credits (credit_number, bill_id, bill_number, supplier_id, supplier_name,
                    credit_date, reference, reason, discount_percent, adjustment, sub_total, total_amount, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
            `, [
                finalCreditNumber,
                bill_id || null,
                bill_number || null,
                supplier_id || null,
                supplier_name || null,
                credit_date || new Date(),
                reference || null,
                reason || null,
                discPct,
                adj,
                subTotal,
                totalAmount,
                status || 'draft'
            ]);

            creditId = creditResult.rows[0].id;

            for (const item of items) {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.rate) || 0;
                const amount = qty * rate;

                await client.query(`
                    INSERT INTO vendor_credit_items (vendor_credit_id, item_id, item_name, account, account_type, quantity, rate, amount)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    creditId,
                    item.item_id || null,
                    item.item_name || null,
                    item.account || null,
                    item.account_type || 'inventory',
                    qty,
                    rate,
                    amount
                ]);
            }
        });

        const result = await db.query('SELECT * FROM vendor_credits WHERE id = $1', [creditId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating vendor credit:', error);
        res.status(500).json({ error: 'Failed to create vendor credit: ' + error.message });
    }
});

// PUT update vendor credit (status, etc.)
router.put('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        const result = await db.query('UPDATE vendor_credits SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vendor credit not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating vendor credit:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE vendor credit
router.delete('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        await db.query('DELETE FROM vendor_credit_items WHERE vendor_credit_id = $1', [req.params.id]);
        const result = await db.query('DELETE FROM vendor_credits WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vendor credit not found' });
        }
        res.json({ message: 'Vendor credit deleted successfully' });
    } catch (error) {
        console.error('Error deleting vendor credit:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
