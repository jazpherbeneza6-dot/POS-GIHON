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
            payment_mode, paid_through, location, reference_number, notes, status,
            currency_code, exchange_rate
        } = req.body;

        const result = await pool.query(
            `INSERT INTO payments_made (payment_number, bill_id, bill_number, supplier_id, supplier_name, amount_paid, bank_charges, tax_deducted, payment_date, payment_made_on, payment_mode, paid_through, location, reference_number, notes, status, currency_code, exchange_rate)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             RETURNING *`,
            [payment_number, bill_id || null, bill_number || null, supplier_id || null, supplier_name || null, amount_paid || 0, bank_charges || 0, tax_deducted || false, payment_date || new Date(), payment_made_on || null, payment_mode || 'Cash', paid_through || 'Petty Cash', location || 'Head Office', reference_number || '', notes || '', status || 'DRAFT', currency_code || 'PHP', parseFloat(exchange_rate) || 1]
        );

        // If status is PAID, update the bill status to PAID
        if (status === 'PAID' && bill_id) {
            await pool.query('UPDATE bills SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['paid', bill_id]);

            // Auto-close PO if all conditions met
            const billRow = await pool.query('SELECT purchase_order_id FROM bills WHERE id = $1', [bill_id]);
            if (billRow.rows.length > 0 && billRow.rows[0].purchase_order_id) {
                const poId = billRow.rows[0].purchase_order_id;
                const poResult = await pool.query('SELECT status FROM purchases WHERE id = $1', [poId]);
                if (poResult.rows.length > 0 && poResult.rows[0].status !== 'CLOSED' && poResult.rows[0].status !== 'CANCELLED') {
                    const orderedRes = await pool.query('SELECT COALESCE(SUM(quantity),0) as total FROM purchase_items WHERE purchase_id = $1', [poId]);
                    const billedRes = await pool.query(`SELECT COALESCE(SUM(bi.quantity),0) as total FROM bill_items bi JOIN bills b ON bi.bill_id = b.id WHERE b.purchase_order_id = $1 AND UPPER(COALESCE(b.status,'')) != 'DRAFT'`, [poId]);
                    const receivedRes = await pool.query(`SELECT COALESCE(SUM(pri.quantity_to_receive),0) as total FROM purchase_receive_items pri JOIN purchase_receives pr ON pri.receive_id = pr.id WHERE pr.purchase_id = $1 AND pr.status = 'received'`, [poId]);
                    const returnedRes = await pool.query(`SELECT COALESCE(SUM(pri2.return_quantity),0) as total FROM purchase_return_items pri2 JOIN purchase_returns pr2 ON pri2.purchase_return_id = pr2.id WHERE pr2.purchase_order_id = $1`, [poId]);
                    const totalOrdered = parseFloat(orderedRes.rows[0].total) || 0;
                    const totalBilled = parseFloat(billedRes.rows[0].total) || 0;
                    const netReceived = (parseFloat(receivedRes.rows[0].total) || 0) - (parseFloat(returnedRes.rows[0].total) || 0);
                    const unpaidBillsRes = await pool.query(`SELECT COUNT(*) as cnt FROM bills WHERE purchase_order_id = $1 AND UPPER(COALESCE(status,'')) NOT IN ('PAID','DRAFT')`, [poId]);
                    const hasUnpaidBills = parseInt(unpaidBillsRes.rows[0].cnt) > 0;
                    if (totalOrdered > 0 && !hasUnpaidBills) {
                        let canClose = false;
                        if (netReceived > totalOrdered) {
                            canClose = totalBilled >= netReceived;
                        } else {
                            canClose = totalBilled >= totalOrdered && netReceived >= totalOrdered;
                        }
                        if (canClose) {
                            await pool.query(`UPDATE purchases SET status = 'CLOSED', payment_status = 'PAID' WHERE id = $1`, [poId]);
                        }
                    }
                }
            }
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

            // Auto-close PO if all conditions met (non-blocking — don't fail the payment)
            try {
                const billRow = await pool.query('SELECT purchase_order_id FROM bills WHERE id = $1', [payment.bill_id]);
                if (billRow.rows.length > 0 && billRow.rows[0].purchase_order_id) {
                    const poId = billRow.rows[0].purchase_order_id;
                    const poResult = await pool.query('SELECT status FROM purchases WHERE id = $1', [poId]);
                    if (poResult.rows.length > 0 && poResult.rows[0].status !== 'CLOSED' && poResult.rows[0].status !== 'CANCELLED') {
                        const orderedRes = await pool.query('SELECT COALESCE(SUM(quantity),0) as total FROM purchase_items WHERE purchase_id = $1', [poId]);
                        const billedRes = await pool.query(`SELECT COALESCE(SUM(bi.quantity),0) as total FROM bill_items bi JOIN bills b ON bi.bill_id = b.id WHERE b.purchase_order_id = $1 AND UPPER(COALESCE(b.status,'')) != 'DRAFT'`, [poId]);
                        const receivedRes = await pool.query(`SELECT COALESCE(SUM(pri.quantity_to_receive),0) as total FROM purchase_receive_items pri JOIN purchase_receives pr ON pri.receive_id = pr.id WHERE pr.purchase_id = $1 AND pr.status = 'received'`, [poId]);
                        const returnedRes = await pool.query(`SELECT COALESCE(SUM(pri2.return_quantity),0) as total FROM purchase_return_items pri2 JOIN purchase_returns pr2 ON pri2.purchase_return_id = pr2.id WHERE pr2.purchase_order_id = $1`, [poId]);
                        const totalOrdered = parseFloat(orderedRes.rows[0].total) || 0;
                        const totalBilled = parseFloat(billedRes.rows[0].total) || 0;
                        const netReceived = (parseFloat(receivedRes.rows[0].total) || 0) - (parseFloat(returnedRes.rows[0].total) || 0);
                        const unpaidBillsRes = await pool.query(`SELECT COUNT(*) as cnt FROM bills WHERE purchase_order_id = $1 AND UPPER(COALESCE(status,'')) NOT IN ('PAID','DRAFT')`, [poId]);
                        const hasUnpaidBills = parseInt(unpaidBillsRes.rows[0].cnt) > 0;
                        if (totalOrdered > 0 && !hasUnpaidBills) {
                            let canClose = false;
                            if (netReceived > totalOrdered) {
                                canClose = totalBilled >= netReceived;
                            } else {
                                canClose = totalBilled >= totalOrdered && netReceived >= totalOrdered;
                            }
                            if (canClose) {
                                await pool.query(`UPDATE purchases SET status = 'CLOSED', payment_status = 'PAID' WHERE id = $1`, [poId]);
                            }
                        }
                    }
                }
            } catch (autoCloseErr) {
                console.error('PO auto-close error (non-blocking):', autoCloseErr.message);
            }
        }

        res.json(payment);
    } catch (err) {
        console.error('Error marking payment as paid:', err);
        res.status(500).json({ error: 'Failed to mark payment as paid' });
    }
});

// PUT update existing payment
router.put('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            payment_number, bill_id, bill_number, supplier_id, supplier_name,
            amount_paid, bank_charges, tax_deducted, payment_date,
            payment_mode, paid_through, reference_number, notes, status,
            currency_code, exchange_rate
        } = req.body;

        const result = await pool.query(
            `UPDATE payments_made SET
                payment_number = $1, bill_id = $2, bill_number = $3,
                supplier_id = $4, supplier_name = $5, amount_paid = $6,
                bank_charges = $7, tax_deducted = $8, payment_date = $9,
                payment_mode = $10, paid_through = $11, reference_number = $12,
                notes = $13, status = $14, currency_code = $15, exchange_rate = $16,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $17 RETURNING *`,
            [payment_number, bill_id || null, bill_number || null,
                supplier_id || null, supplier_name || null, amount_paid || 0,
                bank_charges || 0, tax_deducted || false, payment_date || new Date(),
                payment_mode || 'Cash', paid_through || 'Petty Cash',
                reference_number || '', notes || '', status || 'DRAFT',
                currency_code || 'PHP', parseFloat(exchange_rate) || 1,
                req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        // If status is PAID, update the bill status
        if (status === 'PAID' && bill_id) {
            await pool.query('UPDATE bills SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['paid', bill_id]);
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating payment:', err);
        res.status(500).json({ error: 'Failed to update payment' });
    }
});

// PATCH void a payment — full reversal
router.patch('/:id/void', async (req, res) => {
    const pool = database.getDb();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch the payment
        const paymentRes = await client.query('SELECT * FROM payments_made WHERE id = $1', [req.params.id]);
        if (paymentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Payment not found' });
        }
        const payment = paymentRes.rows[0];

        // 2. Mark payment as VOID
        await client.query(
            `UPDATE payments_made SET status = 'VOID', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [req.params.id]
        );

        // 3. Revert the linked bill status from PAID → OPEN
        if (payment.bill_id) {
            const billRes = await client.query('SELECT * FROM bills WHERE id = $1', [payment.bill_id]);
            if (billRes.rows.length > 0) {
                const bill = billRes.rows[0];
                if ((bill.status || '').toLowerCase() === 'paid') {
                    await client.query(
                        `UPDATE bills SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                        [payment.bill_id]
                    );
                }

                // 4. Revert PO auto-close if applicable
                if (bill.purchase_order_id) {
                    const poRes = await client.query('SELECT * FROM purchases WHERE id = $1', [bill.purchase_order_id]);
                    if (poRes.rows.length > 0 && poRes.rows[0].status === 'CLOSED') {
                        await client.query(
                            `UPDATE purchases SET status = 'BILLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                            [bill.purchase_order_id]
                        );
                    }
                }
            }
        }

        // 5. Remove vendor credits created from this payment's overpayment
        if (payment.payment_number && payment.supplier_id) {
            const reason = `Overpayment from Payment #${payment.payment_number}`;
            await client.query(
                `DELETE FROM vendor_credits WHERE supplier_id = $1 AND reason = $2`,
                [payment.supplier_id, reason]
            );
        }

        await client.query('COMMIT');

        // Re-fetch updated payment
        const updated = await pool.query('SELECT * FROM payments_made WHERE id = $1', [req.params.id]);
        res.json(updated.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error voiding payment:', err);
        res.status(500).json({ error: 'Failed to void payment' });
    } finally {
        client.release();
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
