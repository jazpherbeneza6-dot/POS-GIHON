const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all invoices
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT inv.*,
                   GREATEST(0,
                     LEAST(
                       COALESCE(inv.balance_due, inv.total),
                       COALESCE(inv.total, 0) - COALESCE(paid.total_paid, 0)
                     )
                   ) AS balance_due,
                   CASE WHEN inv.due_date IS NOT NULL
                        THEN (inv.due_date::date - CURRENT_DATE)
                        ELSE NULL
                   END AS days_diff
            FROM invoices inv
            LEFT JOIN (
                SELECT invoice_id, SUM(amount_received) AS total_paid
                FROM payments_received
                WHERE status = 'PAID'
                GROUP BY invoice_id
            ) paid ON paid.invoice_id = inv.id
            ORDER BY inv.created_at DESC
        `);
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

// GET Receivable Details Report (item-level detail)
router.get('/reports/receivable-details', async (req, res) => {
    try {
        const pool = database.getDb();
        const { from, to } = req.query;

        let dateFilter = '';
        const params = [];

        if (from && to) {
            dateFilter = 'AND inv.invoice_date >= $1 AND inv.invoice_date <= $2';
            params.push(from, to + 'T23:59:59.999');
        }

        const result = await pool.query(`
            SELECT
                inv.customer_name,
                inv.invoice_date AS transaction_date,
                inv.invoice_number AS transaction_number,
                inv.order_number AS reference_number,
                inv.status,
                'Invoice' AS transaction_type,
                ii.item_name,
                COALESCE(ii.quantity, 0) AS quantity_ordered,
                COALESCE(ii.rate, 0) AS bcy_item_price,
                COALESCE(ii.amount, 0) AS bcy_total
            FROM invoices inv
            INNER JOIN invoice_items ii ON ii.invoice_id = inv.id
            WHERE 1=1 ${dateFilter}
            ORDER BY ii.item_name ASC, inv.invoice_date ASC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching receivable details report:', err);
        res.status(500).json({ error: 'Failed to fetch receivable details report' });
    }
});

// GET Receivable Summary Report (invoices + credit notes)
router.get('/reports/receivable-summary', async (req, res) => {
    try {
        const pool = database.getDb();
        const { from, to } = req.query;

        let dateFilter = '';
        const params = [];

        if (from && to) {
            dateFilter = 'AND inv.invoice_date >= $1 AND inv.invoice_date <= $2';
            params.push(from, to + 'T23:59:59.999');
        }

        // Fetch invoices as receivable transactions
        const invoiceResult = await pool.query(`
            SELECT
                inv.customer_name,
                inv.invoice_date AS transaction_date,
                inv.invoice_number AS transaction_number,
                inv.order_number AS reference_number,
                inv.status,
                'Invoice' AS transaction_type,
                COALESCE(inv.total, 0) AS bcy_total,
                COALESCE(inv.total, 0) AS fcy_total,
                COALESCE(inv.total, 0) - COALESCE(paid.total_paid, 0) AS bcy_balance,
                COALESCE(inv.total, 0) - COALESCE(paid.total_paid, 0) AS fcy_balance
            FROM invoices inv
            LEFT JOIN (
                SELECT invoice_id, SUM(amount_received) AS total_paid
                FROM payments_received
                WHERE status = 'PAID'
                GROUP BY invoice_id
            ) paid ON paid.invoice_id = inv.id
            WHERE 1=1 ${dateFilter}
            ORDER BY inv.invoice_date ASC
        `, params);

        let rows = invoiceResult.rows;

        // Try to include credit notes if the table exists
        try {
            let cnDateFilter = '';
            const cnParams = [];
            if (from && to) {
                cnDateFilter = 'AND cn.credit_date >= $1 AND cn.credit_date <= $2';
                cnParams.push(from, to + 'T23:59:59.999');
            }

            const cnResult = await pool.query(`
                SELECT
                    cn.customer_name,
                    cn.credit_date AS transaction_date,
                    cn.credit_number AS transaction_number,
                    '' AS reference_number,
                    cn.status,
                    'Credit Note' AS transaction_type,
                    -1 * COALESCE(cn.total_amount, 0) AS bcy_total,
                    -1 * COALESCE(cn.total_amount, 0) AS fcy_total,
                    COALESCE(cn.balance, -1 * COALESCE(cn.total_amount, 0)) AS bcy_balance,
                    COALESCE(cn.balance, -1 * COALESCE(cn.total_amount, 0)) AS fcy_balance
                FROM customer_credit_notes cn
                WHERE 1=1 ${cnDateFilter}
            `, cnParams);

            rows = rows.concat(cnResult.rows);
        } catch (cnErr) {
            // credit notes table may not exist — gracefully skip
        }

        // Sort combined results by date
        rows.sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

        res.json(rows);
    } catch (err) {
        console.error('Error fetching receivable summary report:', err);
        res.status(500).json({ error: 'Failed to fetch receivable summary report' });
    }
});

// GET Customer Balance Summary Report
router.get('/reports/customer-balance-summary', async (req, res) => {
    try {
        const pool = database.getDb();
        const { from, to } = req.query;

        let params = [];
        let invoiceRangeFilter = '';
        let paymentRangeFilter = '';
        let invoiceAllFilter = '';
        let paymentAllFilter = '';

        if (from && to) {
            // Invoiced / received amounts are scoped to the date range
            invoiceRangeFilter = 'AND invoice_date >= $1 AND invoice_date <= $2';
            paymentRangeFilter = 'AND payment_date >= $1 AND payment_date <= $2';
            // Closing balance is cumulative up to the to_date
            invoiceAllFilter = 'AND invoice_date <= $2';
            paymentAllFilter = 'AND payment_date <= $2';
            params.push(from, to + 'T23:59:59.999');
        }

        const result = await pool.query(`
            SELECT
                cust.customer_name,
                COALESCE(inv_range.total, 0) AS invoiced_amount,
                COALESCE(pay_range.total, 0) AS amount_received,
                COALESCE(inv_all.total, 0) - COALESCE(pay_all.total, 0) AS closing_balance
            FROM (
                SELECT DISTINCT customer_name FROM invoices WHERE customer_name IS NOT NULL AND customer_name <> ''
                UNION
                SELECT DISTINCT customer_name FROM payments_received WHERE customer_name IS NOT NULL AND customer_name <> ''
            ) cust
            LEFT JOIN (
                SELECT customer_name, SUM(COALESCE(total, 0)) AS total
                FROM invoices WHERE customer_name IS NOT NULL ${invoiceRangeFilter}
                GROUP BY customer_name
            ) inv_range ON inv_range.customer_name = cust.customer_name
            LEFT JOIN (
                SELECT customer_name, SUM(COALESCE(amount_received, 0)) AS total
                FROM payments_received WHERE customer_name IS NOT NULL ${paymentRangeFilter}
                GROUP BY customer_name
            ) pay_range ON pay_range.customer_name = cust.customer_name
            LEFT JOIN (
                SELECT customer_name, SUM(COALESCE(total, 0)) AS total
                FROM invoices WHERE customer_name IS NOT NULL ${invoiceAllFilter}
                GROUP BY customer_name
            ) inv_all ON inv_all.customer_name = cust.customer_name
            LEFT JOIN (
                SELECT customer_name, SUM(COALESCE(amount_received, 0)) AS total
                FROM payments_received WHERE customer_name IS NOT NULL ${paymentAllFilter}
                GROUP BY customer_name
            ) pay_all ON pay_all.customer_name = cust.customer_name
            ORDER BY cust.customer_name ASC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching customer balance summary report:', err);
        res.status(500).json({ error: 'Failed to fetch customer balance summary report' });
    }
});

// GET Invoice Details Report (must be before /:id)
router.get('/reports/invoice-details', async (req, res) => {
    try {
        const pool = database.getDb();
        const { from, to } = req.query;

        let dateFilter = '';
        const params = [];

        if (from && to) {
            dateFilter = 'WHERE inv.invoice_date >= $1 AND inv.invoice_date <= $2';
            params.push(from, to + 'T23:59:59.999');
        }

        const result = await pool.query(`
            SELECT inv.id,
                   inv.status,
                   inv.invoice_date,
                   inv.due_date,
                   inv.invoice_number,
                   inv.order_number AS reference_number,
                   inv.customer_name,
                   COALESCE(inv.total, 0) AS bcy_total,
                   COALESCE(inv.total, 0) - COALESCE(paid.total_paid, 0) AS bcy_balance
            FROM invoices inv
            LEFT JOIN (
                SELECT invoice_id, SUM(amount_received) AS total_paid
                FROM payments_received
                WHERE status = 'PAID'
                GROUP BY invoice_id
            ) paid ON paid.invoice_id = inv.id
            ${dateFilter}
            ORDER BY inv.invoice_date ASC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching invoice details report:', err);
        res.status(500).json({ error: 'Failed to fetch invoice details report' });
    }
});

// GET single invoice by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const invoiceResult = await pool.query(
            `SELECT inv.*,
                    c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country,
                    c.shipping_street, c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country,
                    GREATEST(0,
                      LEAST(
                        COALESCE(inv.balance_due, inv.total),
                        COALESCE(inv.total, 0) - COALESCE(paid.total_paid, 0)
                      )
                    ) AS balance_due,
                    CASE WHEN inv.due_date IS NOT NULL
                         THEN (inv.due_date::date - CURRENT_DATE)
                         ELSE NULL
                    END AS days_diff
             FROM invoices inv
             LEFT JOIN customers c ON inv.customer_id = c.id
             LEFT JOIN (
                 SELECT invoice_id, SUM(amount_received) AS total_paid
                 FROM payments_received
                 WHERE status = 'PAID'
                 GROUP BY invoice_id
             ) paid ON paid.invoice_id = inv.id
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

// PUT update full invoice (edit mode)
router.put('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            invoice_date, due_date, order_number, customer_id, customer_name,
            salesperson_name, payment_terms, subject, status, notes,
            terms_conditions, sub_total, discount, discount_type, discount_value,
            shipping_charges, adjustment, total, items
        } = req.body;

        const result = await pool.query(
            `UPDATE invoices SET invoice_date=$1, due_date=$2, order_number=$3, customer_id=$4,
             customer_name=$5, salesperson_name=$6, payment_terms=$7, subject=$8, status=$9,
             notes=$10, terms_conditions=$11, sub_total=$12, discount=$13, discount_type=$14,
             discount_value=$15, shipping_charges=$16, adjustment=$17, total=$18, updated_at=CURRENT_TIMESTAMP
             WHERE id=$19 RETURNING *`,
            [invoice_date, due_date, order_number, customer_id, customer_name, salesperson_name,
                payment_terms, subject, status, notes, terms_conditions, sub_total || 0, discount || 0,
                discount_type || '%', discount_value || 0, shipping_charges || 0, adjustment || 0,
                total || 0, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const invoice = result.rows[0];

        // Replace items
        await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO invoice_items (invoice_id, item_name, quantity, rate, tax, amount, discounts)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [invoice.id, item.item_name, item.quantity || 1, item.rate || 0, item.tax, item.amount || 0, JSON.stringify(item.discounts || [])]
                );
            }
        }

        res.json(invoice);
    } catch (err) {
        console.error('Error updating invoice:', err);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
});

// PUT update invoice status
router.put('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;

        // If voiding, also zero out balance_due
        let query, params;
        if (status === 'VOID') {
            query = 'UPDATE invoices SET status = $1, balance_due = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
            params = [status, req.params.id];
        } else {
            query = 'UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
            params = [status, req.params.id];
        }
        const result = await pool.query(query, params);
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
