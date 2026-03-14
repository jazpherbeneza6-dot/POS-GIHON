const express = require('express');
const router = express.Router();
const database = require('../database');

// Migration: add columns and rename APPROVED → CONFIRMED
(async () => {
    try {
        const pool = database.getDb();
        await pool.query(`ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS return_reason TEXT DEFAULT ''`);
        // Replacement workflow columns
        await pool.query(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS resolution_type VARCHAR(20) DEFAULT 'credit'`);
        await pool.query(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS replacement_status VARCHAR(30) DEFAULT NULL`);
        await pool.query(`ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS replacement_receive_id INTEGER`);
        // Rename APPROVED → CONFIRMED and SHIPPED → CONFIRMED for three-pillar status
        await pool.query(`UPDATE purchase_returns SET status = 'CONFIRMED' WHERE UPPER(status) IN ('APPROVED', 'SHIPPED')`);
    } catch (e) { /* column may already exist or table not yet created */ }
})();

// ===== AUTO-CLOSURE HELPER =====
// Evaluates the AND condition: Logistics (Received by Vendor) + Resolution (Credited OR Replacement Received)
// If both are satisfied and status is CONFIRMED, auto-transitions to CLOSED.
async function checkAndAutoClose(pool, prnId) {
    const res = await pool.query('SELECT status, return_status, credit_status, replacement_status, resolution_type FROM purchase_returns WHERE id = $1', [prnId]);
    if (res.rows.length === 0) return null;
    const prn = res.rows[0];

    // Only auto-close from CONFIRMED (never from DRAFT, CANCELLED, or already CLOSED)
    if ((prn.status || '').toUpperCase() !== 'CONFIRMED') return prn;

    // Condition 1: Logistics — item received by vendor
    const logisticsMet = (prn.return_status || '').toLowerCase() === 'received by vendor';

    // Condition 2: Resolution fulfilled
    const isReplacement = (prn.resolution_type || 'credit') === 'replacement';
    const isCancelOrder = prn.resolution_type === 'cancel_order';
    const isSurplusOnly = !prn.resolution_type || prn.resolution_type === 'none';
    const resolutionMet = isSurplusOnly || isCancelOrder
        ? true  // surplus & cancel_order need no financial resolution
        : isReplacement
            ? (prn.replacement_status || '').toUpperCase() === 'RECEIVED'
            : (prn.credit_status || '').toLowerCase() === 'credited';

    // AND gate: both must be true
    if (logisticsMet && resolutionMet) {
        const updated = await pool.query(
            `UPDATE purchase_returns SET status = 'CLOSED', updated_at = NOW() WHERE id = $1 RETURNING *`,
            [prnId]
        );
        return updated.rows[0];
    }
    return prn;
}


// ===== STARTUP SCAN: retroactively close PRNs that already meet both conditions =====
(async () => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            UPDATE purchase_returns SET status = 'CLOSED', updated_at = NOW()
            WHERE UPPER(status) = 'CONFIRMED'
              AND LOWER(return_status) = 'received by vendor'
              AND (
                  (COALESCE(resolution_type, 'credit') = 'credit' AND LOWER(credit_status) = 'credited')
                  OR
                  (resolution_type = 'replacement' AND UPPER(replacement_status) = 'RECEIVED')
                  OR
                  (resolution_type = 'cancel_order')
                  OR
                  (resolution_type IS NULL)
              )
            RETURNING prn_number
        `);
        if (result.rows.length > 0) {
            console.log('Auto-closed PRNs on startup:', result.rows.map(r => r.prn_number).join(', '));
        }
    } catch (e) { /* table may not exist yet */ }
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
            resolution_type,
            items
        } = req.body;

        // ===== STRICT ASSOCIATION GUARD: One PO can only have ONE return =====
        if (purchase_order_id) {
            const existingReturn = await pool.query(
                `SELECT id, prn_number, status FROM purchase_returns WHERE purchase_order_id = $1 LIMIT 1`,
                [purchase_order_id]
            );
            if (existingReturn.rows.length > 0) {
                const existing = existingReturn.rows[0];
                return res.status(400).json({
                    error: `This Purchase Order has already been returned. An existing return (${existing.prn_number}) is linked to this PO.`,
                    existing_return_id: existing.id,
                    existing_return_number: existing.prn_number,
                    existing_return_status: existing.status
                });
            }
        }

        const result = await pool.query(
            `INSERT INTO purchase_returns (prn_number, return_date, warehouse_location, reason, purchase_order_id, purchase_order_number, vendor_name, status, return_status, credit_status, resolution_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [prn_number, return_date || new Date(), warehouse_location || 'Head Office', reason || '', purchase_order_id || null, purchase_order_number || '', vendor_name || '', status || 'DRAFT', return_status || 'Pending', credit_status || 'Pending', resolution_type || 'credit']
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

        // Set discrepancy_resolved on the parent PO (user has addressed the surplus)
        if (purchase_order_id) {
            await pool.query(
                `UPDATE purchases SET discrepancy_resolved = TRUE WHERE id = $1`,
                [purchase_order_id]
            );
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
        if (oldReturnStatus !== 'shipped' && oldReturnStatus !== 'received by vendor' && newReturnStatus === 'shipped') {
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
            // Note: Stock decrease happens on Ship. PO status change happens on "Received by Vendor".
        }

        // ── RECEIVED BY VENDOR: return_status changing TO 'received by vendor' ──
        if (oldReturnStatus !== 'received by vendor' && newReturnStatus === 'received by vendor') {
            if ((current.resolution_type || 'credit') === 'replacement' && current.purchase_order_id) {
                // Only set PO to AWAITING REPLACEMENT if replacement hasn't already been received
                if ((current.replacement_status || '').toUpperCase() !== 'RECEIVED') {
                    await pool.query(
                        `UPDATE purchases SET status = 'AWAITING REPLACEMENT' WHERE id = $1`,
                        [current.purchase_order_id]
                    );
                }
            }
        }

        // ── STOCK REVERSAL: return_status reverting FROM shipped/received back to pending ──
        const wasShippedOrReceived = oldReturnStatus === 'shipped' || oldReturnStatus === 'received by vendor';
        const goingBackToPending = newReturnStatus === 'pending';
        if (wasShippedOrReceived && goingBackToPending) {
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

            // ── REPLACEMENT WORKFLOW: revert PO from AWAITING REPLACEMENT ──
            if ((current.resolution_type || 'credit') === 'replacement' && current.purchase_order_id) {
                const otherRepl = await pool.query(
                    `SELECT id FROM purchase_returns WHERE purchase_order_id = $1 AND id != $2 AND resolution_type = 'replacement' AND replacement_status IN ('AWAITING','PARTIALLY_RECEIVED')`,
                    [current.purchase_order_id, req.params.id]
                );
                if (otherRepl.rows.length === 0) {
                    const poData = await pool.query('SELECT receive_status, bill_status FROM purchases WHERE id = $1', [current.purchase_order_id]);
                    if (poData.rows.length > 0) {
                        const po = poData.rows[0];
                        const newPOStatus = ((po.receive_status || '').toUpperCase() === 'RECEIVED' && (po.bill_status || '').toUpperCase() === 'BILLED') ? 'CLOSED' : 'ISSUED';
                        await pool.query('UPDATE purchases SET status = $1 WHERE id = $2', [newPOStatus, current.purchase_order_id]);
                    }
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

        // Replacement workflow: set replacement_status when vendor receives the items
        // Guard: don't overwrite if replacement is already RECEIVED
        const currentReplStatus = (current.replacement_status || '').toUpperCase();
        if (oldReturnStatus !== 'received by vendor' && newReturnStatus === 'received by vendor' && (current.resolution_type || 'credit') === 'replacement' && currentReplStatus !== 'RECEIVED') {
            fields.push(`replacement_status = $${idx++}`); values.push('AWAITING');
        }
        // Revert replacement_status when going back to pending
        if (wasShippedOrReceived && goingBackToPending && (current.resolution_type || 'credit') === 'replacement') {
            fields.push(`replacement_status = $${idx++}`); values.push(null);
        }

        fields.push(`updated_at = NOW()`);

        if (fields.length === 1) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.params.id);
        const result = await pool.query(
            `UPDATE purchase_returns SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );

        // ===== CANCEL ORDER RECONCILIATION =====
        // When a cancel_order return is CONFIRMED, reconcile the linked PO
        const oldStatus = (current.status || '').toUpperCase();
        if (newStatus === 'CONFIRMED' && oldStatus !== 'CONFIRMED' && current.resolution_type === 'cancel_order' && current.purchase_order_id) {
            try {
                // Compute total returned original qty from ALL confirmed/draft returns for this PO
                const allReturns = await pool.query(
                    `SELECT pri.item_id, pri.item_name, pri.return_quantity
                     FROM purchase_return_items pri
                     JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
                     WHERE pr.purchase_order_id = $1 AND UPPER(pr.status) IN ('CONFIRMED','CLOSED')`,
                    [current.purchase_order_id]
                );
                const totalReturnedByItem = {};
                allReturns.rows.forEach(r => {
                    const key = r.item_id || ('name:' + (r.item_name || ''));
                    totalReturnedByItem[key] = (totalReturnedByItem[key] || 0) + (parseFloat(r.return_quantity) || 0);
                });

                // Also include items from THIS return (status is being set to CONFIRMED now)
                items.forEach(item => {
                    const key = item.item_id || ('name:' + (item.item_name || ''));
                    totalReturnedByItem[key] = (totalReturnedByItem[key] || 0) + (parseFloat(item.return_quantity) || 0);
                });

                // Get PO items and receives
                const poRes = await pool.query('SELECT * FROM purchases WHERE id = $1', [current.purchase_order_id]);
                if (poRes.rows.length > 0) {
                    const po = poRes.rows[0];
                    const poItemsRes = await pool.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [current.purchase_order_id]);
                    const poItems = poItemsRes.rows;

                    // Get receives
                    const recvRes = await pool.query(
                        `SELECT item_id, item_name, SUM(COALESCE(received_quantity, quantity_received, 0)) as total_received
                         FROM purchase_receive_items pri
                         JOIN purchase_receives pr ON pr.id = pri.purchase_receive_id
                         WHERE pr.purchase_order_id = $1
                         GROUP BY item_id, item_name`,
                        [current.purchase_order_id]
                    );
                    const receivedByItem = {};
                    recvRes.rows.forEach(r => {
                        const key = r.item_id || ('name:' + (r.item_name || ''));
                        receivedByItem[key] = parseFloat(r.total_received) || 0;
                    });

                    // Check if all items are accounted for: received + returned_original >= ordered
                    let allReconciled = true;
                    let adjustedItems = [];
                    poItems.forEach(item => {
                        const key = item.item_id || ('name:' + (item.item_name || ''));
                        const ordered = parseFloat(item.quantity) || 0;
                        const received = receivedByItem[key] || 0;
                        const returned = totalReturnedByItem[key] || 0;
                        const keptQty = received - returned;
                        if (received < ordered && (received + returned) < ordered) {
                            allReconciled = false;
                        }
                        if (returned > 0) {
                            adjustedItems.push(`${item.item_name}: ${ordered} → ${Math.max(0, keptQty)}`);
                        }
                    });

                    if (allReconciled) {
                        await pool.query(
                            `UPDATE purchases SET receive_status = 'RECEIVED', discrepancy_resolved = TRUE, updated_at = NOW() WHERE id = $1`,
                            [current.purchase_order_id]
                        );

                        // Log history
                        const logMsg = `Item returned prior to billing. Purchase Order requirement adjusted (${adjustedItems.join('; ')}). No financial credit required.`;
                        try {
                            await pool.query(
                                `INSERT INTO activity_log (entity_type, entity_id, action, details, created_at) VALUES ('purchase_order', $1, 'return_reconciled', $2, NOW())`,
                                [current.purchase_order_id, logMsg]
                            );
                        } catch (logErr) { /* activity_log may not exist */ }
                    }
                }
            } catch (reconErr) {
                console.error('Error reconciling PO after cancel_order return:', reconErr);
            }
        }

        // ===== AUTO-CLOSURE CHECK =====
        // After every update, evaluate the AND condition and auto-close if both met
        const autoClosedPrn = await checkAndAutoClose(pool, req.params.id);
        res.json(autoClosedPrn || result.rows[0]);
    } catch (err) {
        console.error('Error updating purchase return:', err);
        res.status(500).json({ error: 'Failed to update purchase return' });
    }
});
// GET purchase returns awaiting replacement for a PO
router.get('/awaiting-replacement/:poId', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(
            `SELECT pr.*, 
                    (SELECT json_agg(json_build_object('item_name', pri.item_name, 'item_id', pri.item_id, 'return_quantity', pri.return_quantity))
                     FROM purchase_return_items pri WHERE pri.purchase_return_id = pr.id) as items
             FROM purchase_returns pr
             WHERE pr.purchase_order_id = $1 
               AND pr.resolution_type = 'replacement' 
               AND pr.replacement_status IN ('AWAITING', 'PARTIALLY_RECEIVED')
             ORDER BY pr.created_at DESC`,
            [req.params.poId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching awaiting replacements:', err);
        res.status(500).json({ error: 'Failed to fetch awaiting replacements' });
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

router.checkAndAutoClose = checkAndAutoClose;
module.exports = router;
