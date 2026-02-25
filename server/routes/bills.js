const express = require('express');
const router = express.Router();
const database = require('../database');

// GET Vendor Balance Summary Report
router.get('/reports/vendor-balance-summary', async (req, res) => {
    try {
        const db = database.getDb();
        const { from, to } = req.query;

        let params = [];
        let billRangeFilter = '';
        let paymentRangeFilter = '';
        let billAllFilter = '';
        let paymentAllFilter = '';

        if (from && to) {
            billRangeFilter = 'AND bill_date >= $1 AND bill_date <= $2';
            paymentRangeFilter = 'AND payment_date >= $1 AND payment_date <= $2';
            billAllFilter = 'AND bill_date <= $2';
            paymentAllFilter = 'AND payment_date <= $2';
            params.push(from, to + 'T23:59:59.999');
        }

        const result = await db.query(`
            SELECT
                vendor.supplier_name AS vendor_name,
                COALESCE(bill_range.total, 0) AS billed_amount,
                COALESCE(pay_range.total, 0) AS amount_paid,
                COALESCE(bill_all.total, 0) - COALESCE(pay_all.total, 0) AS closing_balance
            FROM (
                SELECT DISTINCT supplier_name FROM bills WHERE supplier_name IS NOT NULL AND supplier_name <> ''
                UNION
                SELECT DISTINCT supplier_name FROM payments_made WHERE supplier_name IS NOT NULL AND supplier_name <> ''
            ) vendor
            LEFT JOIN (
                SELECT supplier_name, SUM(COALESCE(total_amount, 0)) AS total
                FROM bills WHERE supplier_name IS NOT NULL ${billRangeFilter}
                GROUP BY supplier_name
            ) bill_range ON bill_range.supplier_name = vendor.supplier_name
            LEFT JOIN (
                SELECT supplier_name, SUM(COALESCE(amount_paid, 0)) AS total
                FROM payments_made WHERE supplier_name IS NOT NULL ${paymentRangeFilter}
                GROUP BY supplier_name
            ) pay_range ON pay_range.supplier_name = vendor.supplier_name
            LEFT JOIN (
                SELECT supplier_name, SUM(COALESCE(total_amount, 0)) AS total
                FROM bills WHERE supplier_name IS NOT NULL ${billAllFilter}
                GROUP BY supplier_name
            ) bill_all ON bill_all.supplier_name = vendor.supplier_name
            LEFT JOIN (
                SELECT supplier_name, SUM(COALESCE(amount_paid, 0)) AS total
                FROM payments_made WHERE supplier_name IS NOT NULL ${paymentAllFilter}
                GROUP BY supplier_name
            ) pay_all ON pay_all.supplier_name = vendor.supplier_name
            ORDER BY vendor.supplier_name ASC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching vendor balance summary report:', err);
        res.status(500).json({ error: 'Failed to fetch vendor balance summary report' });
    }
});

// GET Bill Details Report
router.get('/reports/bill-details', async (req, res) => {
    try {
        const db = database.getDb();
        const { from, to } = req.query;

        let dateFilter = '';
        let params = [];

        if (from && to) {
            dateFilter = 'WHERE b.bill_date >= $1 AND b.bill_date <= $2';
            params = [from, to + 'T23:59:59.999'];
        }

        const result = await db.query(`
            SELECT b.id, b.status, b.bill_date, b.due_date, b.bill_number,
                   b.supplier_name, b.total_amount,
                   COALESCE(SUM(pm.amount_paid), 0) AS total_paid,
                   (b.total_amount - COALESCE(SUM(pm.amount_paid), 0)) AS balance
            FROM bills b
            LEFT JOIN payments_made pm ON b.id = pm.bill_id
            ${dateFilter}
            GROUP BY b.id, b.status, b.bill_date, b.due_date, b.bill_number,
                     b.supplier_name, b.total_amount
            ORDER BY b.bill_date ASC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching bill details report:', err);
        res.status(500).json({ error: 'Failed to fetch bill details report' });
    }
});

// Get next bill number
router.get('/next-number', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT COUNT(*) as cnt FROM bills');
        const count = parseInt(result.rows[0].cnt) || 0;
        res.json({ bill_number: 'BILL-' + String(count + 1).padStart(5, '0') });
    } catch (error) {
        console.error('Error generating next bill number:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create bill
router.post('/', async (req, res) => {
    try {
        const {
            bill_number, purchase_order_id, supplier_id, supplier_name,
            order_number, bill_date, due_date, payment_terms, subject,
            notes, discount_percent, adjustment, items, status
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one item is required' });
        }

        const db = database.getDb();

        // Auto-generate bill number if not provided
        let finalBillNumber = bill_number;
        if (!finalBillNumber) {
            const countResult = await db.query('SELECT COUNT(*) as cnt FROM bills');
            const count = parseInt(countResult.rows[0].cnt) || 0;
            finalBillNumber = 'BILL-' + String(count + 1).padStart(5, '0');
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

        let billId;
        await database.transaction(async (client) => {
            const billResult = await client.query(`
        INSERT INTO bills (bill_number, purchase_order_id, supplier_id, supplier_name,
          order_number, bill_date, due_date, payment_terms, subject, notes,
          discount_percent, adjustment, sub_total, total_amount, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `, [
                finalBillNumber,
                purchase_order_id || null,
                supplier_id || null,
                supplier_name || null,
                order_number || null,
                bill_date || new Date(),
                due_date || null,
                payment_terms || 'due-on-receipt',
                subject || null,
                notes || null,
                discPct,
                adj,
                subTotal,
                totalAmount,
                status || 'draft'
            ]);

            billId = billResult.rows[0].id;

            for (const item of items) {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.rate) || 0;
                const amount = qty * rate;

                await client.query(`
          INSERT INTO bill_items (bill_id, item_id, item_name, account, account_type, quantity, rate, tax_percent, amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
                    billId,
                    item.item_id || null,
                    item.item_name || null,
                    item.account || null,
                    item.account_type || 'inventory',
                    qty,
                    rate,
                    parseFloat(item.tax_percent) || 0,
                    amount
                ]);
            }

            // Update PO bill_status when a bill is created
            if (purchase_order_id) {
                await client.query(
                    `UPDATE purchases SET bill_status = 'BILLED' WHERE id = $1`,
                    [purchase_order_id]
                );

                // Auto-close: PO becomes CLOSED when billed
                const poResult = await client.query('SELECT * FROM purchases WHERE id = $1', [purchase_order_id]);
                if (poResult.rows.length > 0) {
                    const po = poResult.rows[0];
                    if (po.status !== 'CLOSED' && po.status !== 'CANCELLED') {
                        await client.query(`UPDATE purchases SET status = 'CLOSED' WHERE id = $1`, [purchase_order_id]);
                    }
                }
            }
        });

        const result = await db.query('SELECT * FROM bills WHERE id = $1', [billId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating bill:', error);
        res.status(500).json({ error: 'Failed to create bill' });
    }
});

// Get all bills
router.get('/', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(`
      SELECT b.*, COUNT(bi.id) as item_count
      FROM bills b
      LEFT JOIN bill_items bi ON b.id = bi.bill_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching bills:', error);
        res.status(500).json({ error: 'Failed to fetch bills' });
    }
});

// Get bill by ID
router.get('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const billResult = await db.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
        if (billResult.rows.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }

        const itemsResult = await db.query(
            'SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY id',
            [req.params.id]
        );

        res.json({ ...billResult.rows[0], items: itemsResult.rows });
    } catch (error) {
        console.error('Error fetching bill:', error);
        res.status(500).json({ error: 'Failed to fetch bill' });
    }
});

// Update bill
router.put('/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const db = database.getDb();

        const existing = await db.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }

        if (status) {
            await db.query('UPDATE bills SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
        }

        const result = await db.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating bill:', error);
        res.status(500).json({ error: 'Failed to update bill' });
    }
});

// Delete bill
router.delete('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const existing = await db.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }

        // If linked to PO, revert bill_status and possibly reopen
        if (existing.rows[0].purchase_order_id) {
            const poId = existing.rows[0].purchase_order_id;
            // Check if there are other bills for this PO
            const otherBills = await db.query(
                'SELECT COUNT(*) as cnt FROM bills WHERE purchase_order_id = $1 AND id != $2',
                [poId, req.params.id]
            );
            const remainingBills = parseInt(otherBills.rows[0].cnt) || 0;
            const newBillStatus = remainingBills > 0 ? 'BILLED' : 'UNBILLED';
            await db.query(
                `UPDATE purchases SET bill_status = $1 WHERE id = $2`,
                [newBillStatus, poId]
            );
            // If PO was auto-closed, reopen to ISSUED
            if (newBillStatus === 'UNBILLED') {
                await db.query(
                    `UPDATE purchases SET status = 'ISSUED' WHERE id = $1 AND status = 'CLOSED'`,
                    [poId]
                );
            }
        }

        await db.query('DELETE FROM bills WHERE id = $1', [req.params.id]);
        res.json({ message: 'Bill deleted successfully' });
    } catch (error) {
        console.error('Error deleting bill:', error);
        res.status(500).json({ error: 'Failed to delete bill' });
    }
});

module.exports = router;
