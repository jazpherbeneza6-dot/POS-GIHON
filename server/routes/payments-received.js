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
                   c.shipping_street, c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country,
                   COALESCE(ov.overpayment_amount, 0) AS initial_overpayment
            FROM payments_received pr
            LEFT JOIN customers c ON pr.customer_id = c.id
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(cc.amount), 0) AS overpayment_amount
                FROM customer_credits cc
                WHERE cc.reference_type = 'payment_received'
                  AND cc.reference_id = pr.id
                  AND cc.type = 'OVERPAYMENT'
            ) ov ON true
            ORDER BY pr.created_at DESC
        `);

        // Calculate per-customer applied credits
        const creditResult = await pool.query(`
            SELECT customer_id, COALESCE(SUM(amount), 0) AS total_applied
            FROM customer_credits
            WHERE type = 'CREDIT_APPLIED'
            GROUP BY customer_id
        `);
        const appliedMap = {};
        creditResult.rows.forEach(r => { appliedMap[r.customer_id] = parseFloat(r.total_applied) || 0; });

        // Distribute remaining balance across payments with overpayments per customer
        // Group payments by customer_id, then subtract applied credits proportionally
        const customerOverpayments = {};
        result.rows.forEach(p => {
            const ov = parseFloat(p.initial_overpayment) || 0;
            if (ov > 0) {
                if (!customerOverpayments[p.customer_id]) customerOverpayments[p.customer_id] = [];
                customerOverpayments[p.customer_id].push({ id: p.id, amount: ov });
            }
        });

        // Calculate unused_amount per payment
        const unusedMap = {};
        for (const custId in customerOverpayments) {
            const totalOv = customerOverpayments[custId].reduce((s, x) => s + x.amount, 0);
            const totalApplied = appliedMap[custId] || 0;
            const remaining = Math.max(0, totalOv - totalApplied);

            // Distribute remaining proportionally
            customerOverpayments[custId].forEach(entry => {
                const proportion = totalOv > 0 ? entry.amount / totalOv : 0;
                unusedMap[entry.id] = Math.max(0, parseFloat((remaining * proportion).toFixed(2)));
            });
        }

        // Attach unused_amount to each payment
        const payments = result.rows.map(p => ({
            ...p,
            unused_amount: unusedMap[p.id] || 0
        }));

        res.json(payments);
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

        // DRAFT guard — cannot record payment for a draft invoice
        if (invoice_id) {
            const invCheck = await pool.query('SELECT status FROM invoices WHERE id = $1', [invoice_id]);
            if (invCheck.rows.length > 0 && (invCheck.rows[0].status || '').toUpperCase() === 'DRAFT') {
                return res.status(403).json({ error: 'Cannot record payment for a Draft invoice. Please issue the invoice first.' });
            }
        }

        const result = await pool.query(
            `INSERT INTO payments_received (payment_number, invoice_id, invoice_number, customer_id, customer_name, amount_received, bank_charges, tax_deducted, payment_date, payment_received_on, payment_mode, deposit_to, location, reference_number, notes, status, salesperson_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING *`,
            [payment_number, invoice_id, invoice_number, customer_id, customer_name, amount_received || 0, bank_charges || 0, tax_deducted || false, payment_date || new Date(), payment_received_on || null, payment_mode || 'Cash', deposit_to || 'Petty Cash', location || 'Head Office', reference_number || '', notes || '', status || 'DRAFT', salesperson_name || '']
        );

        // Update invoice balance_due and status based on remaining balance
        if (status === 'PAID') {
            // Collect all invoice IDs and their applied amounts
            const invoiceApplied = [];
            if (invoice_id) {
                // Single invoice payment
                invoiceApplied.push({ id: invoice_id, amount: parseFloat(amount_received) || 0 });
            }
            // Multi-invoice: parse invoice_number field (format: "INV-000001|total|applied, INV-000002|total|applied")
            if (invoice_number && invoice_number.includes('|')) {
                const parts = invoice_number.split(',').map(s => s.trim());
                for (const part of parts) {
                    const segs = part.split('|');
                    if (segs.length >= 3) {
                        const invNum = segs[0].trim();
                        const appliedAmt = parseFloat(segs[2]) || 0;
                        if (appliedAmt > 0) {
                            // Look up invoice id by number
                            const invLookup = await pool.query('SELECT id FROM invoices WHERE invoice_number = $1', [invNum]);
                            if (invLookup.rows.length > 0) {
                                invoiceApplied.push({ id: invLookup.rows[0].id, amount: appliedAmt });
                            }
                        }
                    }
                }
            }

            for (const ia of invoiceApplied) {
                // Subtract payment from balance_due
                await pool.query(
                    `UPDATE invoices SET balance_due = GREATEST(0, COALESCE(balance_due, total) - $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                    [ia.amount, ia.id]
                );
                // Check new balance and set status
                const invCheck = await pool.query('SELECT balance_due, total FROM invoices WHERE id = $1', [ia.id]);
                if (invCheck.rows.length > 0) {
                    const newBalance = parseFloat(invCheck.rows[0].balance_due);
                    if (newBalance <= 0) {
                        await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PAID', ia.id]);
                    } else if (newBalance < parseFloat(invCheck.rows[0].total)) {
                        await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PARTIALLY_PAID', ia.id]);
                    }
                }
            }
        }

        res.status(201).json(result.rows[0]);

        // After response, handle overpayment credit (non-blocking)
        if (status === 'PAID' && customer_id) {
            try {
                const paymentId = result.rows[0].id;
                const totalReceived = parseFloat(amount_received) || 0;

                // Calculate total invoice balance at time of payment
                let totalInvoiceBalance = 0;
                if (invoice_id) {
                    const invBal = await pool.query('SELECT COALESCE(balance_due, total, 0) AS bal FROM invoices WHERE id = $1', [invoice_id]);
                    if (invBal.rows.length > 0) {
                        // balance_due was already reduced above, so add back what we paid
                        totalInvoiceBalance = parseFloat(invBal.rows[0].bal) + totalReceived;
                        // But if invoice is now PAID, the original balance was at most the total
                        const invTotal = await pool.query('SELECT total FROM invoices WHERE id = $1', [invoice_id]);
                        if (invTotal.rows.length > 0) {
                            totalInvoiceBalance = Math.min(totalInvoiceBalance, parseFloat(invTotal.rows[0].total) || 0);
                        }
                    }
                }
                // Multi-invoice: sum up applied amounts
                if (invoice_number && invoice_number.includes('|')) {
                    totalInvoiceBalance = 0;
                    const parts = invoice_number.split(',').map(s => s.trim());
                    for (const part of parts) {
                        const segs = part.split('|');
                        if (segs.length >= 3) {
                            totalInvoiceBalance += parseFloat(segs[2]) || 0;
                        }
                    }
                }

                const excessAmount = Math.max(0, totalReceived - totalInvoiceBalance);
                if (excessAmount > 0.01) {
                    // Create overpayment credit
                    await pool.query(
                        `INSERT INTO customer_credits (customer_id, customer_name, amount, type, reference_type, reference_id, description)
                         VALUES ($1, $2, $3, 'OVERPAYMENT', 'payment_received', $4, $5)`,
                        [customer_id, customer_name || '', excessAmount, paymentId,
                            `Overpayment from Payment #${payment_number} — PHP ${excessAmount.toFixed(2)} stored in Unearned Revenue`]
                    );
                    // Create accounting entry
                    await pool.query(
                        `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
                         VALUES ('EXCESS_PAYMENT', $1, $2, $3, 'Unearned Revenue', 'payment_received', $4, $5)`,
                        [customer_id, customer_name || '', excessAmount, paymentId,
                            `Excess payment of PHP ${excessAmount.toFixed(2)} stored as customer credit`]
                    );
                    console.log(`Created overpayment credit of PHP ${excessAmount.toFixed(2)} for customer ${customer_id}`);
                }
            } catch (creditErr) {
                console.error('Error creating overpayment credit:', creditErr);
            }
        }
    } catch (err) {
        console.error('Error creating payment:', err);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

// PUT update payment (edit) — with transaction-safe credit handling
router.put('/:id', async (req, res) => {
    const pool = database.getDb();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const id = req.params.id;
        const {
            payment_number, invoice_id, invoice_number, customer_id, customer_name,
            amount_received, bank_charges, tax_deducted, payment_date,
            payment_mode, deposit_to, location, reference_number, notes, status, salesperson_name,
            invoice_payments
        } = req.body;

        // 1. Verify payment exists
        const oldResult = await client.query('SELECT * FROM payments_received WHERE id = $1', [id]);
        if (oldResult.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ error: 'Payment not found' });
        }

        // 2. Update payment fields
        const result = await client.query(
            `UPDATE payments_received SET
                payment_number = $1, invoice_id = $2, invoice_number = $3, customer_id = $4, customer_name = $5,
                amount_received = $6, bank_charges = $7, tax_deducted = $8, payment_date = $9,
                payment_mode = $10, deposit_to = $11, location = $12, reference_number = $13,
                notes = $14, status = $15, salesperson_name = $16, updated_at = CURRENT_TIMESTAMP
             WHERE id = $17 RETURNING *`,
            [payment_number, invoice_id, invoice_number, customer_id, customer_name,
                amount_received || 0, bank_charges || 0, tax_deducted || false, payment_date || new Date(),
                payment_mode || 'Cash', deposit_to || 'Petty Cash', location || 'Head Office',
                reference_number || '', notes || '', status || 'DRAFT', salesperson_name || '', id]
        );

        // 3. Calculate excess from invoice_payments
        let totalApplied = 0;
        if (invoice_payments && Array.isArray(invoice_payments)) {
            invoice_payments.forEach(ip => { totalApplied += parseFloat(ip.amount) || 0; });
        }
        const totalReceived = parseFloat(amount_received) || 0;
        const excessAmount = Math.max(0, totalReceived - totalApplied);

        // 4. Handle credits based on status
        const finalStatus = (status || 'DRAFT').toUpperCase();
        const existingCredit = await client.query(
            `SELECT id, amount FROM customer_credits WHERE reference_type = 'payment_received' AND reference_id = $1 AND type = 'OVERPAYMENT'`,
            [id]
        );

        if (finalStatus === 'PAID' && customer_id) {
            if (excessAmount > 0.01) {
                if (existingCredit.rows.length > 0) {
                    // Credit exists — update ONLY if amount changed
                    const oldAmt = parseFloat(existingCredit.rows[0].amount) || 0;
                    if (Math.abs(oldAmt - excessAmount) > 0.001) {
                        await client.query(
                            `UPDATE customer_credits SET amount = $1, description = $2 WHERE id = $3`,
                            [excessAmount, `Overpayment from Payment #${payment_number} — PHP ${excessAmount.toFixed(2)} stored in Unearned Revenue`, existingCredit.rows[0].id]
                        );
                        await client.query(
                            `UPDATE accounting_entries SET amount = $1, description = $2 WHERE reference_type = 'payment_received' AND reference_id = $3 AND entry_type = 'EXCESS_PAYMENT'`,
                            [excessAmount, `Excess payment of PHP ${excessAmount.toFixed(2)} stored as customer credit`, id]
                        );
                    }
                    // If amount same — do nothing (no duplicates)
                } else {
                    // No credit exists — create new
                    await client.query(
                        `INSERT INTO customer_credits (customer_id, customer_name, amount, type, reference_type, reference_id, description)
                         VALUES ($1, $2, $3, 'OVERPAYMENT', 'payment_received', $4, $5)`,
                        [customer_id, customer_name || '', excessAmount, id,
                            `Overpayment from Payment #${payment_number} — PHP ${excessAmount.toFixed(2)} stored in Unearned Revenue`]
                    );
                    await client.query(
                        `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
                         VALUES ('EXCESS_PAYMENT', $1, $2, $3, 'Unearned Revenue', 'payment_received', $4, $5)`,
                        [customer_id, customer_name || '', excessAmount, id,
                            `Excess payment of PHP ${excessAmount.toFixed(2)} stored as customer credit`]
                    );
                }
            } else if (existingCredit.rows.length > 0) {
                // No excess anymore — remove old credit
                await client.query(`DELETE FROM customer_credits WHERE reference_type = 'payment_received' AND reference_id = $1 AND type = 'OVERPAYMENT'`, [id]);
                await client.query(`DELETE FROM accounting_entries WHERE reference_type = 'payment_received' AND reference_id = $1 AND entry_type = 'EXCESS_PAYMENT'`, [id]);
            }
        } else if (finalStatus === 'DRAFT') {
            // Reverted to DRAFT — remove any credits
            if (existingCredit.rows.length > 0) {
                await client.query(`DELETE FROM customer_credits WHERE reference_type = 'payment_received' AND reference_id = $1 AND type = 'OVERPAYMENT'`, [id]);
                await client.query(`DELETE FROM accounting_entries WHERE reference_type = 'payment_received' AND reference_id = $1 AND entry_type = 'EXCESS_PAYMENT'`, [id]);
            }
        }


        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating payment:', err);
        res.status(500).json({ error: 'Failed to update payment' });
    } finally {
        client.release();
    }
});

// PUT update payment status (mark as paid)
router.put('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;

        // Get the current payment before updating
        const currentResult = await pool.query('SELECT * FROM payments_received WHERE id = $1', [req.params.id]);
        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        const currentPayment = currentResult.rows[0];
        const wasDraft = (currentPayment.status || '').toUpperCase() === 'DRAFT';

        // Update the status
        const result = await pool.query(
            'UPDATE payments_received SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        const payment = result.rows[0];

        // If marking as PAID (especially from DRAFT), process invoice balances and credits
        if (status === 'PAID') {
            // Collect all invoice IDs and their applied amounts
            const invoiceApplied = [];

            // Multi-invoice: parse invoice_number field (format: "INV-000001|total|applied, ...")
            if (payment.invoice_number && payment.invoice_number.includes('|')) {
                const parts = payment.invoice_number.split(',').map(s => s.trim());
                for (const part of parts) {
                    const segs = part.split('|');
                    if (segs.length >= 3) {
                        const invNum = segs[0].trim();
                        const appliedAmt = parseFloat(segs[2]) || 0;
                        if (appliedAmt > 0) {
                            const invLookup = await pool.query('SELECT id FROM invoices WHERE invoice_number = $1', [invNum]);
                            if (invLookup.rows.length > 0) {
                                invoiceApplied.push({ id: invLookup.rows[0].id, amount: appliedAmt });
                            }
                        }
                    }
                }
            } else if (payment.invoice_id) {
                // Single invoice payment
                invoiceApplied.push({ id: payment.invoice_id, amount: parseFloat(payment.amount_received) || 0 });
            }

            // Update invoice balances (only if transitioning from DRAFT — avoid double-deduction)
            if (wasDraft) {
                let totalAppliedToInvoices = 0;
                for (const ia of invoiceApplied) {
                    await pool.query(
                        `UPDATE invoices SET balance_due = GREATEST(0, COALESCE(balance_due, total) - $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                        [ia.amount, ia.id]
                    );
                    const invCheck = await pool.query('SELECT balance_due, total FROM invoices WHERE id = $1', [ia.id]);
                    if (invCheck.rows.length > 0) {
                        const newBalance = parseFloat(invCheck.rows[0].balance_due);
                        if (newBalance <= 0) {
                            await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PAID', ia.id]);
                        } else if (newBalance < parseFloat(invCheck.rows[0].total)) {
                            await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PARTIALLY_PAID', ia.id]);
                        }
                    }
                    totalAppliedToInvoices += ia.amount;
                }

                // Calculate excess amount and store as customer credit
                const totalReceived = parseFloat(payment.amount_received) || 0;
                const excessAmount = Math.max(0, totalReceived - totalAppliedToInvoices);
                if (excessAmount > 0 && payment.customer_id) {
                    // Check if credit already exists for this payment (avoid duplicates)
                    const existingCredit = await pool.query(
                        `SELECT id FROM customer_credits WHERE reference_type = 'payment_received' AND reference_id = $1 AND type = 'OVERPAYMENT'`,
                        [payment.id]
                    );
                    if (existingCredit.rows.length === 0) {
                        await pool.query(
                            `INSERT INTO customer_credits (customer_id, customer_name, amount, type, reference_type, reference_id, description)
                             VALUES ($1, $2, $3, 'OVERPAYMENT', 'payment_received', $4, $5)`,
                            [payment.customer_id, payment.customer_name || '', excessAmount, payment.id,
                            `Overpayment from Payment #${payment.payment_number} — PHP ${excessAmount.toFixed(2)} stored in Unearned Revenue`]
                        );
                        await pool.query(
                            `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
                             VALUES ('EXCESS_PAYMENT', $1, $2, $3, 'Unearned Revenue', 'payment_received', $4, $5)`,
                            [payment.customer_id, payment.customer_name || '', excessAmount, payment.id,
                            `Excess payment of PHP ${excessAmount.toFixed(2)} stored as customer credit`]
                        );
                    }
                }
            } else {
                // Was already PAID — just update invoice balances (existing logic)
                if (payment.invoice_id) {
                    const paidAmt = parseFloat(payment.amount_received) || 0;
                    await pool.query(
                        `UPDATE invoices SET balance_due = GREATEST(0, COALESCE(balance_due, total) - $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                        [paidAmt, payment.invoice_id]
                    );
                    const invCheck = await pool.query('SELECT balance_due, total FROM invoices WHERE id = $1', [payment.invoice_id]);
                    if (invCheck.rows.length > 0) {
                        const newBalance = parseFloat(invCheck.rows[0].balance_due);
                        if (newBalance <= 0) {
                            await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PAID', payment.invoice_id]);
                        } else if (newBalance < parseFloat(invCheck.rows[0].total)) {
                            await pool.query('UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['PARTIALLY_PAID', payment.invoice_id]);
                        }
                    }
                }
            }
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating payment status:', err);
        res.status(500).json({ error: 'Failed to update payment status' });
    }
});

// POST refund payment
router.post('/:id/refund', async (req, res) => {
    const pool = database.getDb();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const id = req.params.id;

        // 1. Fetch payment
        const payResult = await client.query('SELECT * FROM payments_received WHERE id = $1', [id]);
        if (payResult.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ error: 'Payment not found' });
        }
        const payment = payResult.rows[0];

        // Only allow refund of PAID payments
        if ((payment.status || '').toUpperCase() !== 'PAID') {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ error: 'Only PAID payments can be refunded.' });
        }

        // 2. Check if credits from this payment have been applied elsewhere
        const creditCheck = await client.query(
            `SELECT cc_overpay.id, cc_overpay.amount as overpay_amount,
                    COALESCE((SELECT SUM(cc_applied.amount) FROM customer_credits cc_applied
                              WHERE cc_applied.customer_id = cc_overpay.customer_id
                              AND cc_applied.type = 'CREDIT_APPLIED'), 0) as total_applied
             FROM customer_credits cc_overpay
             WHERE cc_overpay.reference_type = 'payment_received' AND cc_overpay.reference_id = $1 AND cc_overpay.type = 'OVERPAYMENT'`,
            [id]
        );

        if (creditCheck.rows.length > 0) {
            const overpayAmt = parseFloat(creditCheck.rows[0].overpay_amount) || 0;
            const totalApplied = parseFloat(creditCheck.rows[0].total_applied) || 0;
            // Check if total customer credits balance allows reversal
            const allCredits = await client.query(
                `SELECT type, amount FROM customer_credits WHERE customer_id = $1`,
                [payment.customer_id]
            );
            let balance = 0;
            allCredits.rows.forEach(r => {
                if (r.type === 'OVERPAYMENT') balance += parseFloat(r.amount) || 0;
                if (r.type === 'CREDIT_APPLIED') balance -= parseFloat(r.amount) || 0;
            });
            // If removing this credit would make balance negative, credits have been used
            if (balance - overpayAmt < -0.01) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(400).json({ error: 'Cannot refund. Credits from this payment have already been applied to other invoices.' });
            }
        }

        // 3. Update payment status to REFUNDED
        await client.query(
            `UPDATE payments_received SET status = 'REFUNDED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );

        // 4. Remove overpayment credits for this payment
        await client.query(
            `DELETE FROM customer_credits WHERE reference_type = 'payment_received' AND reference_id = $1 AND type = 'OVERPAYMENT'`,
            [id]
        );
        await client.query(
            `DELETE FROM accounting_entries WHERE reference_type = 'payment_received' AND reference_id = $1 AND entry_type = 'EXCESS_PAYMENT'`,
            [id]
        );

        // 5. Reopen invoices — add payment amount back to balance_due
        const invoiceEntries = (payment.invoice_number || '').split(',').map(s => s.trim()).filter(Boolean);
        for (const entry of invoiceEntries) {
            const parts = entry.split('|');
            const invNum = (parts[0] || '').trim();
            const appliedAmt = parts[2] ? parseFloat(parts[2]) : 0;
            if (invNum && appliedAmt > 0) {
                const invLookup = await client.query('SELECT id, balance_due, total FROM invoices WHERE invoice_number = $1', [invNum]);
                if (invLookup.rows.length > 0) {
                    const inv = invLookup.rows[0];
                    const newBalance = Math.min(parseFloat(inv.total), (parseFloat(inv.balance_due) || 0) + appliedAmt);
                    let newStatus = 'UNPAID';
                    if (newBalance <= 0) newStatus = 'PAID';
                    else if (newBalance < parseFloat(inv.total)) newStatus = 'PARTIALLY_PAID';
                    await client.query(
                        `UPDATE invoices SET balance_due = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
                        [newBalance, newStatus, inv.id]
                    );
                }
            }
        }
        // Also handle single-invoice payments (where invoice_id is set directly)
        if (payment.invoice_id && !payment.invoice_number.includes('|')) {
            const paidAmt = parseFloat(payment.amount_received) || 0;
            const invResult = await client.query('SELECT id, balance_due, total FROM invoices WHERE id = $1', [payment.invoice_id]);
            if (invResult.rows.length > 0) {
                const inv = invResult.rows[0];
                const newBalance = Math.min(parseFloat(inv.total), (parseFloat(inv.balance_due) || 0) + paidAmt);
                let newStatus = newBalance >= parseFloat(inv.total) ? 'UNPAID' : 'PARTIALLY_PAID';
                await client.query(
                    `UPDATE invoices SET balance_due = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
                    [newBalance, newStatus, inv.id]
                );
            }
        }

        // 6. Create refund accounting entry
        const refundAmt = parseFloat(payment.amount_received) || 0;
        await client.query(
            `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
             VALUES ('REFUND', $1, $2, $3, 'Cash', 'payment_received', $4, $5)`,
            [payment.customer_id, payment.customer_name || '', refundAmt, id,
            `Refund of Payment #${payment.payment_number} — PHP ${refundAmt.toFixed(2)} returned to customer`]
        );

        await client.query('COMMIT');
        res.json({ message: 'Payment refunded successfully', payment_id: id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error refunding payment:', err);
        res.status(500).json({ error: 'Failed to refund payment' });
    } finally {
        client.release();
    }
});

// POST void payment
router.post('/:id/void', async (req, res) => {
    const pool = database.getDb();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const id = req.params.id;

        const payResult = await client.query('SELECT * FROM payments_received WHERE id = $1', [id]);
        if (payResult.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ error: 'Payment not found' });
        }
        const payment = payResult.rows[0];

        if ((payment.status || '').toUpperCase() !== 'PAID') {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ error: 'Only PAID payments can be voided.' });
        }

        // Update status to VOID
        await client.query(`UPDATE payments_received SET status = 'VOID', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);

        // Remove overpayment credits
        await client.query(`DELETE FROM customer_credits WHERE reference_type = 'payment_received' AND reference_id = $1 AND type = 'OVERPAYMENT'`, [id]);
        await client.query(`DELETE FROM accounting_entries WHERE reference_type = 'payment_received' AND reference_id = $1 AND entry_type = 'EXCESS_PAYMENT'`, [id]);

        // Reopen invoices
        const invoiceEntries = (payment.invoice_number || '').split(',').map(s => s.trim()).filter(Boolean);
        for (const entry of invoiceEntries) {
            const parts = entry.split('|');
            const invNum = (parts[0] || '').trim();
            const appliedAmt = parts[2] ? parseFloat(parts[2]) : 0;
            if (invNum && appliedAmt > 0) {
                const invLookup = await client.query('SELECT id, balance_due, total FROM invoices WHERE invoice_number = $1', [invNum]);
                if (invLookup.rows.length > 0) {
                    const inv = invLookup.rows[0];
                    const newBalance = Math.min(parseFloat(inv.total), (parseFloat(inv.balance_due) || 0) + appliedAmt);
                    const newStatus = newBalance >= parseFloat(inv.total) ? 'UNPAID' : 'PARTIALLY_PAID';
                    await client.query(`UPDATE invoices SET balance_due = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [newBalance, newStatus, inv.id]);
                }
            }
        }
        if (payment.invoice_id && !(payment.invoice_number || '').includes('|')) {
            const paidAmt = parseFloat(payment.amount_received) || 0;
            const invResult = await client.query('SELECT id, balance_due, total FROM invoices WHERE id = $1', [payment.invoice_id]);
            if (invResult.rows.length > 0) {
                const inv = invResult.rows[0];
                const newBalance = Math.min(parseFloat(inv.total), (parseFloat(inv.balance_due) || 0) + paidAmt);
                const newStatus = newBalance >= parseFloat(inv.total) ? 'UNPAID' : 'PARTIALLY_PAID';
                await client.query(`UPDATE invoices SET balance_due = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [newBalance, newStatus, inv.id]);
            }
        }

        // Create void accounting entry
        const voidAmt = parseFloat(payment.amount_received) || 0;
        await client.query(
            `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
             VALUES ('VOID', $1, $2, $3, 'Cash', 'payment_received', $4, $5)`,
            [payment.customer_id, payment.customer_name || '', voidAmt, id,
            `Void of Payment #${payment.payment_number} — PHP ${voidAmt.toFixed(2)}`]
        );

        await client.query('COMMIT');
        res.json({ message: 'Payment voided successfully', payment_id: id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error voiding payment:', err);
        res.status(500).json({ error: 'Failed to void payment' });
    } finally {
        client.release();
    }
});

// DELETE payment (with accounting cleanup for PAID payments)
router.delete('/:id', async (req, res) => {
    const pool = database.getDb();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const id = req.params.id;

        const payResult = await client.query('SELECT * FROM payments_received WHERE id = $1', [id]);
        if (payResult.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ error: 'Payment not found' });
        }
        const payment = payResult.rows[0];

        // If payment was PAID, clean up credits and revert invoices
        if ((payment.status || '').toUpperCase() === 'PAID') {
            // Reopen invoices
            const invoiceEntries = (payment.invoice_number || '').split(',').map(s => s.trim()).filter(Boolean);
            for (const entry of invoiceEntries) {
                const parts = entry.split('|');
                const invNum = (parts[0] || '').trim();
                const appliedAmt = parts[2] ? parseFloat(parts[2]) : 0;
                if (invNum && appliedAmt > 0) {
                    const invLookup = await client.query('SELECT id, balance_due, total FROM invoices WHERE invoice_number = $1', [invNum]);
                    if (invLookup.rows.length > 0) {
                        const inv = invLookup.rows[0];
                        const newBalance = Math.min(parseFloat(inv.total), (parseFloat(inv.balance_due) || 0) + appliedAmt);
                        const newStatus = newBalance >= parseFloat(inv.total) ? 'UNPAID' : 'PARTIALLY_PAID';
                        await client.query(`UPDATE invoices SET balance_due = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [newBalance, newStatus, inv.id]);
                    }
                }
            }
            if (payment.invoice_id && !(payment.invoice_number || '').includes('|')) {
                const paidAmt = parseFloat(payment.amount_received) || 0;
                const invResult = await client.query('SELECT id, balance_due, total FROM invoices WHERE id = $1', [payment.invoice_id]);
                if (invResult.rows.length > 0) {
                    const inv = invResult.rows[0];
                    const newBalance = Math.min(parseFloat(inv.total), (parseFloat(inv.balance_due) || 0) + paidAmt);
                    const newStatus = newBalance >= parseFloat(inv.total) ? 'UNPAID' : 'PARTIALLY_PAID';
                    await client.query(`UPDATE invoices SET balance_due = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, [newBalance, newStatus, inv.id]);
                }
            }
        }

        // Always remove associated credits and accounting entries when deleting a payment
        await client.query(`DELETE FROM customer_credits WHERE reference_type = 'payment_received' AND reference_id = $1`, [id]);
        await client.query(`DELETE FROM accounting_entries WHERE reference_type = 'payment_received' AND reference_id = $1`, [id]);

        // Delete the payment record
        await client.query('DELETE FROM payments_received WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ message: 'Payment deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error deleting payment:', err);
        res.status(500).json({ error: 'Failed to delete payment' });
    } finally {
        client.release();
    }
});

module.exports = router;
