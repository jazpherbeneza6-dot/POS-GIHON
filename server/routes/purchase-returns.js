const express = require('express');
const router = express.Router();
const database = require('../database');

// Migration: add return_reason column if it doesn't exist
(async () => {
    try {
        const pool = database.getDb();
        await pool.query(`ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS return_reason TEXT DEFAULT ''`);
    } catch (e) { /* column may already exist or table not yet created */ }
})();

// GET all purchase returns
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT pr.*, COALESCE(SUM(pri.return_quantity), 0) AS total_return_qty
            FROM purchase_returns pr
            LEFT JOIN purchase_return_items pri ON pri.purchase_return_id = pr.id
            GROUP BY pr.id
            ORDER BY pr.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching purchase returns:', err);
        res.status(500).json({ error: 'Failed to fetch purchase returns' });
    }
});

// GET next PRN number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT COUNT(*) FROM purchase_returns');
        const count = parseInt(result.rows[0].count) + 1;
        const prn_number = 'PRN-' + String(count).padStart(5, '0');
        res.json({ prn_number });
    } catch (err) {
        console.error('Error getting next PRN number:', err);
        res.status(500).json({ error: 'Failed to get next PRN number' });
    }
});

// GET purchase returns by purchase order ID
router.get('/by-po/:poId', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(
            'SELECT * FROM purchase_returns WHERE purchase_order_id = $1 ORDER BY created_at DESC',
            [req.params.poId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching purchase returns for PO:', err);
        res.status(500).json({ error: 'Failed to fetch purchase returns' });
    }
});

// GET single purchase return by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const returnResult = await pool.query('SELECT * FROM purchase_returns WHERE id = $1', [req.params.id]);
        if (returnResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase return not found' });
        }
        const purchaseReturn = returnResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM purchase_return_items WHERE purchase_return_id = $1', [purchaseReturn.id]);
        purchaseReturn.items = itemsResult.rows;

        res.json(purchaseReturn);
    } catch (err) {
        console.error('Error fetching purchase return:', err);
        res.status(500).json({ error: 'Failed to fetch purchase return' });
    }
});

// POST create new purchase return
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            prn_number,
            return_date,
            warehouse_location,
            reason,
            purchase_order_id,
            purchase_order_number,
            vendor_name,
            status,
            return_status,
            credit_status,
            items
        } = req.body;

        const result = await pool.query(
            `INSERT INTO purchase_returns (prn_number, return_date, warehouse_location, reason, purchase_order_id, purchase_order_number, vendor_name, status, return_status, credit_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [prn_number, return_date || new Date(), warehouse_location || 'Head Office', reason || '', purchase_order_id || null, purchase_order_number || '', vendor_name || '', status || 'DRAFT', return_status || 'Pending', credit_status || 'Pending']
        );

        const purchaseReturn = result.rows[0];

        // Insert return items
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO purchase_return_items (purchase_return_id, item_name, item_id, received_quantity, already_returned, return_quantity, rate, amount, return_reason)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [purchaseReturn.id, item.item_name, item.item_id || null, item.received_quantity || 0, item.already_returned || 0, item.return_quantity || 0, item.rate || 0, item.amount || 0, item.return_reason || '']
                );
            }
        }

        res.status(201).json(purchaseReturn);
    } catch (err) {
        console.error('Error creating purchase return:', err);
        res.status(500).json({ error: 'Failed to create purchase return' });
    }
});

// PUT update purchase return (with inventory logic)
router.put('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status, return_status, credit_status, reason } = req.body;

        // Fetch current state of the purchase return
        const currentResult = await pool.query('SELECT * FROM purchase_returns WHERE id = $1', [req.params.id]);
        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase return not found' });
        }
        const current = currentResult.rows[0];
        const oldReturnStatus = (current.return_status || '').toLowerCase();
        const newReturnStatus = (return_status !== undefined ? return_status : current.return_status || '').toLowerCase();
        const newStatus = (status !== undefined ? status : current.status || '').toUpperCase();

        // Fetch items for this return
        const itemsResult = await pool.query('SELECT * FROM purchase_return_items WHERE purchase_return_id = $1', [req.params.id]);
        const items = itemsResult.rows;

        // ── STOCK DECREASE: return_status changing TO 'shipped' ──
        if (oldReturnStatus !== 'shipped' && newReturnStatus === 'shipped') {
            // Validate stock for every item before committing
            for (const item of items) {
                if (!item.item_id) continue;
                const stockRes = await pool.query('SELECT stock_quantity FROM items WHERE id = $1', [item.item_id]);
                if (stockRes.rows.length === 0) continue;
                const currentStock = parseFloat(stockRes.rows[0].stock_quantity) || 0;
                const returnQty = parseFloat(item.return_quantity) || 0;
                if (returnQty > currentStock) {
                    return res.status(400).json({
                        error: `Insufficient stock to perform this return. Item "${item.item_name}" has ${currentStock} in stock but ${returnQty} is being returned.`
                    });
                }
            }
            // All items validated — decrease stock
            for (const item of items) {
                if (!item.item_id) continue;
                const returnQty = parseFloat(item.return_quantity) || 0;
                if (returnQty > 0) {
                    await pool.query(
                        'UPDATE items SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [returnQty, item.item_id]
                    );
                }
            }
        }

        // ── STOCK REVERSAL: return_status changing FROM 'shipped' back to pending (Draft/Cancelled) ──
        if (oldReturnStatus === 'shipped' && newReturnStatus !== 'shipped') {
            for (const item of items) {
                if (!item.item_id) continue;
                const returnQty = parseFloat(item.return_quantity) || 0;
                if (returnQty > 0) {
                    await pool.query(
                        'UPDATE items SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [returnQty, item.item_id]
                    );
                }
            }
        }

        // ── Build and execute the UPDATE query ──
        const fields = [];
        const values = [];
        let idx = 1;

        if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
        if (return_status !== undefined) { fields.push(`return_status = $${idx++}`); values.push(return_status); }
        if (credit_status !== undefined) { fields.push(`credit_status = $${idx++}`); values.push(credit_status); }
        if (reason !== undefined) { fields.push(`reason = $${idx++}`); values.push(reason); }

        fields.push(`updated_at = NOW()`);

        if (fields.length === 1) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.params.id);
        const result = await pool.query(
            `UPDATE purchase_returns SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating purchase return:', err);
        res.status(500).json({ error: 'Failed to update purchase return' });
    }
});

// DELETE purchase return
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM purchase_return_items WHERE purchase_return_id = $1', [req.params.id]);
        await pool.query('DELETE FROM purchase_returns WHERE id = $1', [req.params.id]);
        res.json({ message: 'Purchase return deleted' });
    } catch (err) {
        console.error('Error deleting purchase return:', err);
        res.status(500).json({ error: 'Failed to delete purchase return' });
    }
});

module.exports = router;
