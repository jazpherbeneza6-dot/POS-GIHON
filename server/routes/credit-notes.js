const express = require('express');
const router = express.Router();
const database = require('../database');

// Helper: look up customer_id by name
async function getCustomerId(client, customerName) {
    if (!customerName) return null;
    const r = await client.query(
        `SELECT id FROM customers WHERE 
         CONCAT(COALESCE(salutation,''), ' ', COALESCE(first_name,''), ' ', COALESCE(last_name,'')) ILIKE $1
         OR CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')) ILIKE $1
         LIMIT 1`,
        [customerName.trim()]
    );
    return r.rows.length > 0 ? r.rows[0].id : null;
}

// Helper: create accounting entries + customer credit for an OPEN credit note
async function createOpenEntries(client, cn) {
    const amount = parseFloat(cn.total || 0);
    if (amount <= 0) return;

    const customerId = await getCustomerId(client, cn.customer_name);

    // 1. Accounting entry — Debit: Sales Returns and Allowances
    await client.query(
        `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['CREDIT_NOTE', customerId, cn.customer_name || '', amount,
            'Sales Returns and Allowances', 'credit_note', cn.id,
            `Credit Note ${cn.credit_note_number} - Debit Sales Returns and Allowances`]
    );

    // 2. Accounting entry — Credit: Customer Credits / Unearned Revenue
    await client.query(
        `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['CREDIT_NOTE', customerId, cn.customer_name || '', amount,
            'Unearned Revenue', 'credit_note', cn.id,
            `Credit Note ${cn.credit_note_number} - Credit Customer Credits / Unearned Revenue`]
    );

    // 3. Customer credit entry — adds to Unused Credits
    if (customerId) {
        await client.query(
            `INSERT INTO customer_credits (customer_id, customer_name, amount, type, reference_type, reference_id, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [customerId, cn.customer_name || '', amount, 'CREDIT_NOTE',
                'credit_note', cn.id,
                `Credit Note ${cn.credit_note_number} - PHP ${amount.toFixed(2)} added as customer credit`]
        );
    }
}

// GET all credit notes
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT cn.*, 
                   COALESCE(json_agg(
                       json_build_object(
                           'id', cni.id,
                           'item_name', cni.item_name,
                           'item_id', cni.item_id,
                           'quantity', cni.quantity,
                           'rate', cni.rate,
                           'discount', cni.discount,
                           'discount_type', cni.discount_type,
                           'tax', cni.tax,
                           'amount', cni.amount
                       )
                   ) FILTER (WHERE cni.id IS NOT NULL), '[]') as items
            FROM credit_notes cn
            LEFT JOIN credit_note_items cni ON cni.credit_note_id = cn.id
            GROUP BY cn.id
            ORDER BY cn.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching credit notes:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET credit notes by sales_return_id
router.get('/by-return/:returnId', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM credit_notes WHERE sales_return_id = $1', [req.params.returnId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching credit note by return:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET single credit note
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const cnResult = await pool.query('SELECT * FROM credit_notes WHERE id = $1', [req.params.id]);
        if (cnResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });

        const cn = cnResult.rows[0];
        const itemsResult = await pool.query('SELECT * FROM credit_note_items WHERE credit_note_id = $1', [cn.id]);
        cn.items = itemsResult.rows;
        res.json(cn);
    } catch (err) {
        console.error('Error fetching credit note:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST create credit note
router.post('/', async (req, res) => {
    try {
        const {
            credit_note_number, customer_name, reference, credit_note_date,
            salesperson, status, sales_return_id, sub_total, discount,
            shipping_charges, adjustment, total, customer_notes,
            terms_conditions, items
        } = req.body;

        const result = await database.transaction(async (client) => {
            const cnResult = await client.query(
                `INSERT INTO credit_notes 
                 (credit_note_number, customer_name, reference, credit_note_date, salesperson, status, sales_return_id, sub_total, discount, shipping_charges, adjustment, total, customer_notes, terms_conditions)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 RETURNING *`,
                [credit_note_number, customer_name, reference, credit_note_date || new Date(),
                    salesperson, status || 'DRAFT', sales_return_id || null,
                    sub_total || 0, discount || 0, shipping_charges || 0, adjustment || 0, total || 0,
                    customer_notes || '', terms_conditions || '']
            );
            const cn = cnResult.rows[0];

            // Insert items
            if (items && items.length > 0) {
                for (const item of items) {
                    await client.query(
                        `INSERT INTO credit_note_items (credit_note_id, item_name, item_id, quantity, rate, discount, discount_type, tax, amount)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [cn.id, item.item_name || '', item.item_id || null,
                        item.quantity || 0, item.rate || 0, item.discount || 0,
                        item.discount_type || '%', item.tax || 0, item.amount || 0]
                    );
                }
            }

            // Update sales return refund_status if linked
            if (sales_return_id) {
                await client.query(
                    "UPDATE sales_returns SET refund_status = 'Pending' WHERE id = $1",
                    [sales_return_id]
                );
            }

            // If saving directly as OPEN, create accounting + credit entries
            if ((status || 'DRAFT').toUpperCase() === 'OPEN') {
                await createOpenEntries(client, cn);
            }

            return cn;
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Error creating credit note:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT update credit note (e.g., Convert to Open)
router.put('/:id', async (req, res) => {
    try {
        const { status } = req.body;

        const result = await database.transaction(async (client) => {
            // Get current credit note to check current status
            const currentResult = await client.query('SELECT * FROM credit_notes WHERE id = $1', [req.params.id]);
            if (currentResult.rows.length === 0) throw new Error('Not found');
            const current = currentResult.rows[0];

            // Duplicate protection: if already OPEN, don't re-process
            if (current.status === 'OPEN' && status === 'OPEN') {
                return current; // Already open, no-op
            }

            const updateResult = await client.query(
                `UPDATE credit_notes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
                [status, req.params.id]
            );
            const cn = updateResult.rows[0];

            // If converting DRAFT → OPEN, create accounting + credit entries
            if (current.status === 'DRAFT' && status === 'OPEN') {
                await createOpenEntries(client, cn);
            }

            return cn;
        });

        res.json(result);
    } catch (err) {
        if (err.message === 'Not found') return res.status(404).json({ error: 'Not found' });
        console.error('Error updating credit note:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE credit note
router.delete('/:id', async (req, res) => {
    try {
        await database.transaction(async (client) => {
            // Get the credit note first
            const cnResult = await client.query('SELECT * FROM credit_notes WHERE id = $1', [req.params.id]);
            if (cnResult.rows.length === 0) throw new Error('Not found');
            const cn = cnResult.rows[0];

            // Clear refund_status on linked return
            if (cn.sales_return_id) {
                await client.query(
                    "UPDATE sales_returns SET refund_status = '' WHERE id = $1",
                    [cn.sales_return_id]
                );
            }

            // Remove accounting entries and customer credits if OPEN
            if (cn.status === 'OPEN') {
                await client.query(
                    "DELETE FROM accounting_entries WHERE reference_type = 'credit_note' AND reference_id = $1",
                    [cn.id]
                );
                await client.query(
                    "DELETE FROM customer_credits WHERE reference_type = 'credit_note' AND reference_id = $1",
                    [cn.id]
                );
            }

            await client.query('DELETE FROM credit_notes WHERE id = $1', [req.params.id]);
        });

        res.json({ message: 'Deleted' });
    } catch (err) {
        if (err.message === 'Not found') return res.status(404).json({ error: 'Not found' });
        console.error('Error deleting credit note:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST refund a credit note
router.post('/:id/refund', async (req, res) => {
    try {
        const { amount, refund_date, payment_mode, from_account, reference, description } = req.body;
        const cnId = parseInt(req.params.id);

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid refund amount.' });
        }

        const result = await database.transaction(async (client) => {
            // 1. Get the credit note
            const cnResult = await client.query('SELECT * FROM credit_notes WHERE id = $1', [cnId]);
            if (cnResult.rows.length === 0) throw new Error('Credit note not found');
            const cn = cnResult.rows[0];
            const total = parseFloat(cn.total || 0);

            // 2. Validate amount
            if (amount > total) {
                throw new Error('Refund amount exceeds credit note balance.');
            }

            // 3. Get customer_id
            const customerId = await getCustomerId(client, cn.customer_name);

            // 4. Generate refund number
            const refNumResult = await client.query("SELECT COUNT(*)::int AS count FROM refunds");
            const refundNumber = 'RF-' + String(refNumResult.rows[0].count + 1).padStart(5, '0');

            // 5. Create refund record
            const refundResult = await client.query(
                `INSERT INTO refunds (refund_number, credit_note_id, customer_id, customer_name, amount, refund_date, payment_mode, from_account, reference, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                [refundNumber, cnId, customerId, cn.customer_name || '', amount,
                    refund_date || new Date().toISOString().split('T')[0],
                    payment_mode || 'Cash', from_account || 'Petty Cash',
                    reference || '', description || '']
            );
            const refund = refundResult.rows[0];

            // 6. Accounting entries
            // Debit: Customer Credits / Unearned Revenue (reduce customer credit)
            await client.query(
                `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                ['REFUND', customerId, cn.customer_name || '', amount,
                    'Unearned Revenue', 'refund', refund.id,
                    `Refund ${refundNumber} - Debit Customer Credits (${cn.credit_note_number})`]
            );

            // Credit: Cash/Bank (money going out)
            await client.query(
                `INSERT INTO accounting_entries (entry_type, customer_id, customer_name, amount, account, reference_type, reference_id, description)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                ['REFUND', customerId, cn.customer_name || '', amount,
                    from_account || 'Petty Cash', 'refund', refund.id,
                    `Refund ${refundNumber} - Credit ${from_account || 'Petty Cash'} (${cn.credit_note_number})`]
            );

            // 7. Deduct from customer credits
            if (customerId) {
                await client.query(
                    `INSERT INTO customer_credits (customer_id, customer_name, amount, type, reference_type, reference_id, description)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [customerId, cn.customer_name || '', -amount, 'REFUND',
                        'refund', refund.id,
                        `Refund ${refundNumber} - PHP ${amount.toFixed(2)} refunded from ${cn.credit_note_number}`]
                );
            }

            // 8. Update credit note status to CLOSED
            await client.query(
                `UPDATE credit_notes SET status = 'CLOSED', updated_at = NOW() WHERE id = $1`,
                [cnId]
            );

            // 9. Update linked sales return refund_status if exists
            if (cn.sales_return_id) {
                await client.query(
                    "UPDATE sales_returns SET refund_status = 'Refunded' WHERE id = $1",
                    [cn.sales_return_id]
                );
            }

            return refund;
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Error processing refund:', err);
        if (err.message.includes('exceeds') || err.message.includes('Invalid')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

// GET refunds for a credit note
router.get('/:id/refunds', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM refunds WHERE credit_note_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching refunds:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
