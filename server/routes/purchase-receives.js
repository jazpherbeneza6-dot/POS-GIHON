const express = require('express');
const router = express.Router();
const database = require('../database');

// Create purchase receive
router.post('/', async (req, res) => {
    try {
        const { purchase_id, supplier_id, supplier_name, receive_date, notes, status, items, purchase_return_id } = req.body;

        if (!purchase_id) {
            return res.status(400).json({ error: 'purchase_id is required' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one item is required' });
        }

        const db = database.getDb();
        const finalStatus = status || 'draft';

        const poCheck = await db.query('SELECT status, receive_status FROM purchases WHERE id = $1', [purchase_id]);
        if (poCheck.rows.length > 0 && (poCheck.rows[0].receive_status || '').toUpperCase() === 'RECEIVED'
            && (poCheck.rows[0].status || '').toUpperCase() !== 'AWAITING REPLACEMENT') {
            // Check if there are pending replacement returns — allow receiving if so
            const pendingRepl = await db.query(
                `SELECT id FROM purchase_returns WHERE purchase_order_id = $1 AND resolution_type = 'replacement' AND (replacement_status IS NULL OR replacement_status NOT IN ('RECEIVED'))`,
                [purchase_id]
            );
            if (pendingRepl.rows.length === 0) {
                return res.status(400).json({ error: 'This Purchase Order has already been fully received.' });
            }
        }

        // Generate receive number
        const countResult = await db.query('SELECT COUNT(*) as cnt FROM purchase_receives');
        const count = parseInt(countResult.rows[0].cnt) || 0;
        const receiveNumber = 'PR-' + String(count + 1).padStart(5, '0');

        let receiveId;
        await database.transaction(async (client) => {
            // Create receive record
            const receiveResult = await client.query(`
        INSERT INTO purchase_receives (purchase_id, receive_number, receive_date, supplier_id, supplier_name, notes, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
                purchase_id,
                receiveNumber,
                receive_date || new Date().toISOString().split('T')[0],
                supplier_id || null,
                supplier_name || null,
                notes || null,
                finalStatus
            ]);

            receiveId = receiveResult.rows[0].id;

            // Insert receive items
            for (const item of items) {
                const qtyToReceive = parseFloat(item.quantity_to_receive) || 0;
                if (qtyToReceive <= 0) continue;

                await client.query(`
          INSERT INTO purchase_receive_items (receive_id, item_id, item_name, quantity_ordered, quantity_received, quantity_to_receive)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
                    receiveId,
                    item.item_id || null,
                    item.item_name || null,
                    parseFloat(item.ordered_qty) || 0,
                    parseFloat(item.previously_received_qty) || 0,
                    qtyToReceive
                ]);

                // If status is 'received', update stock and log transaction
                if (finalStatus === 'received' && item.item_id) {
                    await client.query(`
            UPDATE items 
            SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [qtyToReceive, item.item_id]);

                    await client.query(`
            INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
            VALUES ($1, 'IN', $2, $3, $4)
          `, [item.item_id, qtyToReceive, receiveNumber, `Purchase Receive: ${receiveNumber}`]);
                }
            }

            // Update parent PO status based on total ordered vs total received
            if (finalStatus === 'received') {
                // Get total ordered quantity from PO items
                const orderedResult = await client.query(`
          SELECT COALESCE(SUM(quantity), 0) as total_ordered
          FROM purchase_items
          WHERE purchase_id = $1
        `, [purchase_id]);

                // Get total received quantity from all confirmed receives for this PO
                const receivedResult = await client.query(`
          SELECT COALESCE(SUM(pri.quantity_to_receive), 0) as total_received
          FROM purchase_receive_items pri
          JOIN purchase_receives pr ON pri.receive_id = pr.id
          WHERE pr.purchase_id = $1 AND pr.status = 'received'
        `, [purchase_id]);

                const totalOrdered = parseFloat(orderedResult.rows[0].total_ordered) || 0;
                const totalReceived = parseFloat(receivedResult.rows[0].total_received) || 0;

                let newReceiveStatus;
                if (totalReceived >= totalOrdered) {
                    newReceiveStatus = 'RECEIVED';
                } else if (totalReceived > 0) {
                    newReceiveStatus = 'PARTIALLY RECEIVED';
                }

                if (newReceiveStatus) {
                    await client.query('UPDATE purchases SET receive_status = $1 WHERE id = $2', [newReceiveStatus, purchase_id]);

                    // Auto-close: if fully received AND fully billed → CLOSED
                    if (newReceiveStatus === 'RECEIVED') {
                        const billCheck = await client.query('SELECT bill_status, status FROM purchases WHERE id = $1', [purchase_id]);
                        if (billCheck.rows.length > 0 && (billCheck.rows[0].bill_status || '').toUpperCase() === 'BILLED'
                            && (billCheck.rows[0].status || '').toUpperCase() !== 'CLOSED'
                            && (billCheck.rows[0].status || '').toUpperCase() !== 'CANCELLED') {
                            // Check for ANY unresolved returns before closing
                            const unresolvedReturns = await client.query(
                                `SELECT id FROM purchase_returns WHERE purchase_order_id = $1 AND UPPER(COALESCE(status,'')) = 'CONFIRMED' AND (
                                    (resolution_type = 'replacement' AND (replacement_status IS NULL OR UPPER(replacement_status) != 'RECEIVED'))
                                    OR (resolution_type = 'credit' AND (credit_status IS NULL OR LOWER(credit_status) != 'credited'))
                                )`,
                                [purchase_id]
                            );
                            if (unresolvedReturns.rows.length === 0) {
                                // Surplus-aware auto-close
                                const billedRes = await client.query(`SELECT COALESCE(SUM(bi.quantity),0) as total FROM bill_items bi JOIN bills b ON bi.bill_id = b.id WHERE b.purchase_order_id = $1 AND UPPER(COALESCE(b.status,'')) != 'DRAFT'`, [purchase_id]);
                                const returnedRes = await client.query(`SELECT COALESCE(SUM(pri2.return_quantity),0) as total FROM purchase_return_items pri2 JOIN purchase_returns pr2 ON pri2.purchase_return_id = pr2.id WHERE pr2.purchase_order_id = $1`, [purchase_id]);
                                const unpaidBillsRes = await client.query(`SELECT COUNT(*) as cnt FROM bills WHERE purchase_order_id = $1 AND UPPER(COALESCE(status,'')) NOT IN ('PAID','DRAFT')`, [purchase_id]);
                                const totalBilled = parseFloat(billedRes.rows[0].total) || 0;
                                const netRcv = totalReceived - (parseFloat(returnedRes.rows[0].total) || 0);
                                const hasUnpaidBills = parseInt(unpaidBillsRes.rows[0].cnt) > 0;
                                let canClose = false;
                                if (netRcv > totalOrdered) {
                                    canClose = totalBilled >= netRcv && !hasUnpaidBills;
                                } else {
                                    canClose = totalBilled >= totalOrdered && !hasUnpaidBills;
                                }
                                if (canClose) {
                                    await client.query("UPDATE purchases SET status = 'CLOSED' WHERE id = $1", [purchase_id]);
                                }
                            }
                        }
                    }
                }

                // Log the receive action for PO history
                const totalQtyReceived = items.reduce((sum, item) => sum + (parseFloat(item.quantity_to_receive) || 0), 0);
                await client.query(
                    `INSERT INTO activity_log (entity_type, entity_id, entity_name, action, description)
                     VALUES ('purchase_order', $1, $2, 'receive_recorded', $3)`,
                    [purchase_id, receiveNumber, `Receive ${receiveNumber} recorded — ${totalQtyReceived} units added.`]
                );

                // Auto-update linked Sales Orders: if PO received, check if linked SOs can move from ON HOLD → CONFIRMED
                if (newReceiveStatus === 'RECEIVED' || newReceiveStatus === 'PARTIALLY RECEIVED') {
                    const poResult = await client.query('SELECT po_number, reference_number FROM purchases WHERE id = $1', [purchase_id]);
                    if (poResult.rows.length > 0) {
                        const poNum = poResult.rows[0].po_number;
                        const refNum = poResult.rows[0].reference_number;
                        // Find SOs linked by reference_number matching order_number
                        const soLookup = refNum
                            ? await client.query("SELECT id, status FROM sales_orders WHERE order_number = $1 AND status = 'ON HOLD'", [refNum])
                            : { rows: [] };
                        for (const so of soLookup.rows) {
                            // Check if ALL items in this SO now have sufficient stock
                            const soItems = await client.query('SELECT item_id, quantity FROM sales_order_items WHERE sales_order_id = $1', [so.id]);
                            let allSufficient = true;
                            for (const si of soItems.rows) {
                                if (si.item_id) {
                                    const stockCheck = await client.query('SELECT stock_quantity FROM items WHERE id = $1', [si.item_id]);
                                    if (stockCheck.rows.length > 0) {
                                        const stock = parseFloat(stockCheck.rows[0].stock_quantity) || 0;
                                        const needed = parseFloat(si.quantity) || 0;
                                        if (stock < needed) { allSufficient = false; break; }
                                    }
                                }
                            }
                            if (allSufficient) {
                                await client.query("UPDATE sales_orders SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [so.id]);
                            }
                        }
                    }
                }

                // ── REPLACEMENT WORKFLOW: update PRN and PO if this is a replacement receive ──
                if (purchase_return_id) {
                    await client.query(
                        `UPDATE purchase_returns SET replacement_status = 'RECEIVED', replacement_receive_id = $1 WHERE id = $2`,
                        [receiveId, purchase_return_id]
                    );
                    // AUTO-CLOSE PRN: check if both AND conditions are now met
                    try {
                        const { checkAndAutoClose } = require('./purchase-returns');
                        await checkAndAutoClose(client, purchase_return_id);
                    } catch (e) { console.error('PRN auto-close check failed:', e.message); }
                }
                // If PO has replacement returns awaiting, auto-detect and mark as RECEIVED
                const poStatusCheck = await client.query('SELECT status, receive_status, bill_status FROM purchases WHERE id = $1', [purchase_id]);
                const poStatusUpper = (poStatusCheck.rows[0]?.status || '').toUpperCase();
                if (poStatusCheck.rows.length > 0 && (poStatusUpper === 'AWAITING REPLACEMENT' || poStatusUpper === 'ISSUED')) {
                    // If no explicit purchase_return_id was provided, auto-link to awaiting replacement returns
                    if (!purchase_return_id) {
                        const awaitingReturns = await client.query(
                            `SELECT id FROM purchase_returns WHERE purchase_order_id = $1 AND resolution_type = 'replacement' AND (replacement_status IS NULL OR replacement_status IN ('AWAITING','PARTIALLY_RECEIVED'))`,
                            [purchase_id]
                        );
                        for (const ret of awaitingReturns.rows) {
                            await client.query(
                                `UPDATE purchase_returns SET replacement_status = 'RECEIVED', replacement_receive_id = $1 WHERE id = $2`,
                                [receiveId, ret.id]
                            );
                            // AUTO-CLOSE PRN: check if both AND conditions are now met
                            try {
                                const { checkAndAutoClose } = require('./purchase-returns');
                                await checkAndAutoClose(client, ret.id);
                            } catch (e) { console.error('PRN auto-close check failed:', e.message); }
                        }
                    }
                    // Check if all replacements are now fulfilled
                    const pendingRepl = await client.query(
                        `SELECT id FROM purchase_returns WHERE purchase_order_id = $1 AND resolution_type = 'replacement' AND replacement_status IN ('AWAITING','PARTIALLY_RECEIVED')`,
                        [purchase_id]
                    );
                    if (pendingRepl.rows.length === 0) {
                        const po = poStatusCheck.rows[0];
                        // Surplus-aware: only close if billed covers received
                        let newPOStatus = 'ISSUED';
                        if ((po.receive_status || '').toUpperCase() === 'RECEIVED' && (po.bill_status || '').toUpperCase() === 'BILLED') {
                            const ordRes = await client.query('SELECT COALESCE(SUM(quantity),0) as total FROM purchase_items WHERE purchase_id = $1', [purchase_id]);
                            const blRes = await client.query(`SELECT COALESCE(SUM(bi.quantity),0) as total FROM bill_items bi JOIN bills b ON bi.bill_id = b.id WHERE b.purchase_order_id = $1 AND UPPER(COALESCE(b.status,'')) != 'DRAFT'`, [purchase_id]);
                            const rcvRes = await client.query(`SELECT COALESCE(SUM(pri.quantity_to_receive),0) as total FROM purchase_receive_items pri JOIN purchase_receives pr ON pri.receive_id = pr.id WHERE pr.purchase_id = $1 AND pr.status = 'received'`, [purchase_id]);
                            const retRes = await client.query(`SELECT COALESCE(SUM(pri2.return_quantity),0) as total FROM purchase_return_items pri2 JOIN purchase_returns pr2 ON pri2.purchase_return_id = pr2.id WHERE pr2.purchase_order_id = $1`, [purchase_id]);
                            const unpRes = await client.query(`SELECT COUNT(*) as cnt FROM bills WHERE purchase_order_id = $1 AND UPPER(COALESCE(status,'')) NOT IN ('PAID','DRAFT')`, [purchase_id]);
                            const tOrd = parseFloat(ordRes.rows[0].total) || 0;
                            const tBil = parseFloat(blRes.rows[0].total) || 0;
                            const nRcv = (parseFloat(rcvRes.rows[0].total) || 0) - (parseFloat(retRes.rows[0].total) || 0);
                            const hasUnp = parseInt(unpRes.rows[0].cnt) > 0;
                            if (nRcv > tOrd) {
                                newPOStatus = (tBil >= nRcv && !hasUnp) ? 'CLOSED' : 'ISSUED';
                            } else {
                                newPOStatus = (tBil >= tOrd && !hasUnp) ? 'CLOSED' : 'ISSUED';
                            }
                        }
                        await client.query('UPDATE purchases SET status = $1 WHERE id = $2', [newPOStatus, purchase_id]);
                    }
                }
            }
        });

        const result = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [receiveId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating purchase receive:', error);
        res.status(500).json({ error: 'Failed to save purchase receive: ' + error.message });
    }
});

// Get next receive number (for display before saving)
router.get('/next-number', async (req, res) => {
    try {
        const db = database.getDb();
        const countResult = await db.query('SELECT COUNT(*) as cnt FROM purchase_receives');
        const count = parseInt(countResult.rows[0].cnt) || 0;
        const receiveNumber = 'PR-' + String(count + 1).padStart(5, '0');
        res.json({ receive_number: receiveNumber });
    } catch (error) {
        console.error('Error generating next receive number:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all purchase receives
router.get('/', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(`
      SELECT pr.*, p.po_number,
             (SELECT COALESCE(SUM(pri.quantity_to_receive),0) FROM purchase_receive_items pri WHERE pri.receive_id = pr.id) as total_items,
             (SELECT json_agg(json_build_object('item_name', pri.item_name, 'qty', pri.quantity_to_receive))
              FROM purchase_receive_items pri WHERE pri.receive_id = pr.id) as receive_items_detail
      FROM purchase_receives pr
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      ORDER BY pr.created_at DESC
    `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching purchase receives:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get receives by purchase order ID (to calculate already received and in-transit)
router.get('/by-po/:poId', async (req, res) => {
    try {
        const db = database.getDb();
        const { poId } = req.params;

        // Get total received AND in-transit per item for this PO
        // Group by both item_id and item_name to handle cases where item_id is null
        const result = await db.query(`
      SELECT pri.item_id, pri.item_name,
             COALESCE(SUM(CASE WHEN pr.status = 'received' THEN pri.quantity_to_receive ELSE 0 END), 0) as total_received,
             COALESCE(SUM(CASE WHEN pr.status IN ('draft', 'in_transit') THEN pri.quantity_to_receive ELSE 0 END), 0) as total_in_transit
      FROM purchase_receive_items pri
      JOIN purchase_receives pr ON pri.receive_id = pr.id
      WHERE pr.purchase_id = $1 AND pr.status IN ('received', 'draft', 'in_transit')
      GROUP BY pri.item_id, pri.item_name
    `, [poId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching receives by PO:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET preview info for confirmation modal (must be before /:id)
router.get('/:id/preview', async (req, res) => {
    try {
        const db = database.getDb();
        const { id } = req.params;

        const prResult = await db.query(`
            SELECT pr.*, p.po_number
            FROM purchase_receives pr
            LEFT JOIN purchases p ON pr.purchase_id = p.id
            WHERE pr.id = $1
        `, [id]);
        if (prResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase receive not found' });
        }

        const pr = prResult.rows[0];

        // Get total quantity
        const qtyResult = await db.query(`
            SELECT COALESCE(SUM(quantity_to_receive), 0) as total_qty
            FROM purchase_receive_items WHERE receive_id = $1
        `, [id]);

        // Check linked bills
        const billResult = await db.query(`
            SELECT b.id, b.bill_number, b.status
            FROM bills b
            WHERE b.purchase_order_id = $1
        `, [pr.purchase_id]);

        res.json({
            id: pr.id,
            receive_number: pr.receive_number,
            status: pr.status,
            po_number: pr.po_number,
            purchase_id: pr.purchase_id,
            total_qty: parseFloat(qtyResult.rows[0].total_qty) || 0,
            linked_bills: billResult.rows
        });
    } catch (error) {
        console.error('Error fetching preview:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single purchase receive
router.get('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const { id } = req.params;

        const receiveResult = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        if (receiveResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase receive not found' });
        }

        const itemsResult = await db.query('SELECT * FROM purchase_receive_items WHERE receive_id = $1', [id]);

        const receive = receiveResult.rows[0];
        receive.items = itemsResult.rows;
        res.json(receive);
    } catch (error) {
        console.error('Error fetching purchase receive:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH touch last-opened timestamp (called only when user views detail)
router.patch('/:id/touch', async (req, res) => {
    try {
        const db = database.getDb();
        await db.query('UPDATE purchase_receives SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.patch('/:id/mark-received', async (req, res) => {
    try {
        const db = database.getDb();
        const { id } = req.params;

        // Get the purchase receive
        const prResult = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        if (prResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase receive not found' });
        }

        const pr = prResult.rows[0];
        if (pr.status === 'received') {
            return res.status(400).json({ error: 'Already marked as received' });
        }

        // Get items for this receive
        const itemsResult = await db.query('SELECT * FROM purchase_receive_items WHERE receive_id = $1', [id]);
        const items = itemsResult.rows;

        await database.transaction(async (client) => {
            // Update status to received
            await client.query('UPDATE purchase_receives SET status = $1 WHERE id = $2', ['received', id]);

            // Update stock and log inventory transactions for each item
            for (const item of items) {
                const qtyToReceive = parseFloat(item.quantity_to_receive) || 0;
                if (item.item_id && qtyToReceive > 0) {
                    await client.query(`
                        UPDATE items 
                        SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [qtyToReceive, item.item_id]);

                    await client.query(`
                        INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
                        VALUES ($1, 'IN', $2, $3, $4)
                    `, [item.item_id, qtyToReceive, pr.receive_number, `Purchase Receive: ${pr.receive_number}`]);
                }
            }

            // Update parent PO status
            if (pr.purchase_id) {
                const orderedResult = await client.query(`
                    SELECT COALESCE(SUM(quantity), 0) as total_ordered
                    FROM purchase_items WHERE purchase_id = $1
                `, [pr.purchase_id]);

                const receivedResult = await client.query(`
                    SELECT COALESCE(SUM(pri.quantity_to_receive), 0) as total_received
                    FROM purchase_receive_items pri
                    JOIN purchase_receives pr2 ON pri.receive_id = pr2.id
                    WHERE pr2.purchase_id = $1 AND pr2.status = 'received'
                `, [pr.purchase_id]);

                const totalOrdered = parseFloat(orderedResult.rows[0].total_ordered) || 0;
                const totalReceived = parseFloat(receivedResult.rows[0].total_received) || 0;

                let newReceiveStatus;
                if (totalReceived >= totalOrdered) {
                    newReceiveStatus = 'RECEIVED';
                } else if (totalReceived > 0) {
                    newReceiveStatus = 'PARTIALLY RECEIVED';
                }

                if (newReceiveStatus) {
                    await client.query('UPDATE purchases SET receive_status = $1 WHERE id = $2', [newReceiveStatus, pr.purchase_id]);

                    // Auto-close: if fully received AND fully billed → CLOSED
                    if (newReceiveStatus === 'RECEIVED') {
                        const billCheck = await client.query('SELECT bill_status, status FROM purchases WHERE id = $1', [pr.purchase_id]);
                        if (billCheck.rows.length > 0 && (billCheck.rows[0].bill_status || '').toUpperCase() === 'BILLED'
                            && (billCheck.rows[0].status || '').toUpperCase() !== 'CLOSED'
                            && (billCheck.rows[0].status || '').toUpperCase() !== 'CANCELLED') {
                            // Surplus-aware auto-close
                            const billedRes = await client.query(`SELECT COALESCE(SUM(bi.quantity),0) as total FROM bill_items bi JOIN bills b ON bi.bill_id = b.id WHERE b.purchase_order_id = $1 AND UPPER(COALESCE(b.status,'')) != 'DRAFT'`, [pr.purchase_id]);
                            const returnedRes = await client.query(`SELECT COALESCE(SUM(pri2.return_quantity),0) as total FROM purchase_return_items pri2 JOIN purchase_returns pr2 ON pri2.purchase_return_id = pr2.id WHERE pr2.purchase_order_id = $1`, [pr.purchase_id]);
                            const unpaidBillsRes = await client.query(`SELECT COUNT(*) as cnt FROM bills WHERE purchase_order_id = $1 AND UPPER(COALESCE(status,'')) NOT IN ('PAID','DRAFT')`, [pr.purchase_id]);
                            const totalBilled = parseFloat(billedRes.rows[0].total) || 0;
                            const netRcv = totalReceived - (parseFloat(returnedRes.rows[0].total) || 0);
                            const hasUnpaidBills = parseInt(unpaidBillsRes.rows[0].cnt) > 0;
                            let canClose = false;
                            if (netRcv > totalOrdered) {
                                canClose = totalBilled >= netRcv && !hasUnpaidBills;
                            } else {
                                canClose = totalBilled >= totalOrdered && !hasUnpaidBills;
                            }
                            if (canClose) {
                                await client.query("UPDATE purchases SET status = 'CLOSED' WHERE id = $1", [pr.purchase_id]);
                            }
                        }
                    }
                }

                // Auto-update linked Sales Orders: ON HOLD → CONFIRMED if stock is now sufficient
                if (newReceiveStatus === 'RECEIVED' || newReceiveStatus === 'PARTIALLY RECEIVED') {
                    const poResult = await client.query('SELECT po_number, reference_number FROM purchases WHERE id = $1', [pr.purchase_id]);
                    if (poResult.rows.length > 0) {
                        const refNum = poResult.rows[0].reference_number;
                        const soLookup = refNum
                            ? await client.query("SELECT id FROM sales_orders WHERE order_number = $1 AND status = 'ON HOLD'", [refNum])
                            : { rows: [] };
                        for (const so of soLookup.rows) {
                            const soItems = await client.query('SELECT item_id, quantity FROM sales_order_items WHERE sales_order_id = $1', [so.id]);
                            let allSufficient = true;
                            for (const si of soItems.rows) {
                                if (si.item_id) {
                                    const stockCheck = await client.query('SELECT stock_quantity FROM items WHERE id = $1', [si.item_id]);
                                    if (stockCheck.rows.length > 0) {
                                        const stock = parseFloat(stockCheck.rows[0].stock_quantity) || 0;
                                        const needed = parseFloat(si.quantity) || 0;
                                        if (stock < needed) { allSufficient = false; break; }
                                    }
                                }
                            }
                            if (allSufficient) {
                                await client.query("UPDATE sales_orders SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [so.id]);
                            }
                        }
                    }
                }
            }
        });

        const updated = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        res.json(updated.rows[0]);
    } catch (error) {
        console.error('Error marking as received:', error);
        res.status(500).json({ error: 'Failed to mark as received: ' + error.message });
    }
});

// Mark as In Transit (supports received → in_transit with stock revert)
router.patch('/:id/mark-transit', async (req, res) => {
    try {
        const db = database.getDb();
        const { id } = req.params;

        const prResult = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        if (prResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase receive not found' });
        }

        const pr = prResult.rows[0];
        if (pr.status === 'in_transit') {
            return res.status(400).json({ error: 'Already in transit' });
        }

        const wasReceived = pr.status === 'received';

        await database.transaction(async (client) => {
            // Update status
            await client.query('UPDATE purchase_receives SET status = $1 WHERE id = $2', ['in_transit', id]);

            // If reverting from received, decrease stock
            if (wasReceived) {
                const itemsResult = await client.query('SELECT * FROM purchase_receive_items WHERE receive_id = $1', [id]);
                for (const item of itemsResult.rows) {
                    const qty = parseFloat(item.quantity_to_receive) || 0;
                    if (item.item_id && qty > 0) {
                        await client.query(`
                            UPDATE items 
                            SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
                            WHERE id = $2
                        `, [qty, item.item_id]);

                        await client.query(`
                            INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
                            VALUES ($1, 'OUT', $2, $3, $4)
                        `, [item.item_id, qty, pr.receive_number, `Stock reverted: ${pr.receive_number} moved to In Transit`]);
                    }
                }

                // Recalculate PO receive_status
                if (pr.purchase_id) {
                    const orderedResult = await client.query(`
                        SELECT COALESCE(SUM(quantity), 0) as total_ordered
                        FROM purchase_items WHERE purchase_id = $1
                    `, [pr.purchase_id]);

                    const receivedResult = await client.query(`
                        SELECT COALESCE(SUM(pri.quantity_to_receive), 0) as total_received
                        FROM purchase_receive_items pri
                        JOIN purchase_receives pr2 ON pri.receive_id = pr2.id
                        WHERE pr2.purchase_id = $1 AND pr2.status = 'received'
                    `, [pr.purchase_id]);

                    const totalOrdered = parseFloat(orderedResult.rows[0].total_ordered) || 0;
                    const totalReceived = parseFloat(receivedResult.rows[0].total_received) || 0;

                    let newReceiveStatus = null;
                    if (totalReceived >= totalOrdered && totalOrdered > 0) {
                        newReceiveStatus = 'RECEIVED';
                    } else if (totalReceived > 0) {
                        newReceiveStatus = 'PARTIALLY RECEIVED';
                    }

                    await client.query('UPDATE purchases SET receive_status = $1 WHERE id = $2', [newReceiveStatus, pr.purchase_id]);
                }
            }
        });

        const updated = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        res.json(updated.rows[0]);
    } catch (error) {
        console.error('Error marking as in transit:', error);
        res.status(500).json({ error: 'Failed to mark as in transit: ' + error.message });
    }
});

// PUT update a draft/in-transit purchase receive
router.put('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const { id } = req.params;
        const { receive_date, notes, status, items } = req.body;

        // Get existing PR
        const prResult = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        if (prResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase receive not found' });
        }

        const pr = prResult.rows[0];
        if (pr.status === 'received') {
            return res.status(400).json({ error: 'Cannot edit a received purchase receive' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one item is required' });
        }

        const finalStatus = status || pr.status;

        await database.transaction(async (client) => {
            // Update the PR header
            await client.query(`
                UPDATE purchase_receives
                SET receive_date = $1, notes = $2, status = $3
                WHERE id = $4
            `, [
                receive_date || pr.receive_date,
                notes !== undefined ? notes : pr.notes,
                finalStatus,
                id
            ]);

            // Delete existing items and re-insert
            await client.query('DELETE FROM purchase_receive_items WHERE receive_id = $1', [id]);

            for (const item of items) {
                const qtyToReceive = parseFloat(item.quantity_to_receive) || 0;
                if (qtyToReceive <= 0) continue;

                await client.query(`
                    INSERT INTO purchase_receive_items (receive_id, item_id, item_name, quantity_ordered, quantity_received, quantity_to_receive)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    id,
                    item.item_id || null,
                    item.item_name || null,
                    parseFloat(item.ordered_qty) || 0,
                    parseFloat(item.previously_received_qty) || 0,
                    qtyToReceive
                ]);

                // If finalizing as received, update stock and log transaction
                if (finalStatus === 'received' && item.item_id) {
                    await client.query(`
                        UPDATE items 
                        SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [qtyToReceive, item.item_id]);

                    await client.query(`
                        INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
                        VALUES ($1, 'IN', $2, $3, $4)
                    `, [item.item_id, qtyToReceive, pr.receive_number, `Purchase Receive: ${pr.receive_number}`]);
                }
            }

            // If finalizing as received, update parent PO status
            if (finalStatus === 'received' && pr.purchase_id) {
                const orderedResult = await client.query(`
                    SELECT COALESCE(SUM(quantity), 0) as total_ordered
                    FROM purchase_items WHERE purchase_id = $1
                `, [pr.purchase_id]);

                const receivedResult = await client.query(`
                    SELECT COALESCE(SUM(pri.quantity_to_receive), 0) as total_received
                    FROM purchase_receive_items pri
                    JOIN purchase_receives pr2 ON pri.receive_id = pr2.id
                    WHERE pr2.purchase_id = $1 AND pr2.status = 'received'
                `, [pr.purchase_id]);

                const totalOrdered = parseFloat(orderedResult.rows[0].total_ordered) || 0;
                const totalReceived = parseFloat(receivedResult.rows[0].total_received) || 0;

                let newReceiveStatus;
                if (totalReceived >= totalOrdered) {
                    newReceiveStatus = 'RECEIVED';
                } else if (totalReceived > 0) {
                    newReceiveStatus = 'PARTIALLY RECEIVED';
                }

                if (newReceiveStatus) {
                    await client.query('UPDATE purchases SET receive_status = $1 WHERE id = $2', [newReceiveStatus, pr.purchase_id]);

                    // Auto-close: if fully received AND fully billed → CLOSED
                    if (newReceiveStatus === 'RECEIVED') {
                        const billCheck = await client.query('SELECT bill_status, status FROM purchases WHERE id = $1', [pr.purchase_id]);
                        if (billCheck.rows.length > 0 && (billCheck.rows[0].bill_status || '').toUpperCase() === 'BILLED'
                            && (billCheck.rows[0].status || '').toUpperCase() !== 'CLOSED'
                            && (billCheck.rows[0].status || '').toUpperCase() !== 'CANCELLED') {
                            // Surplus-aware auto-close
                            const billedRes = await client.query(`SELECT COALESCE(SUM(bi.quantity),0) as total FROM bill_items bi JOIN bills b ON bi.bill_id = b.id WHERE b.purchase_order_id = $1 AND UPPER(COALESCE(b.status,'')) != 'DRAFT'`, [pr.purchase_id]);
                            const returnedRes = await client.query(`SELECT COALESCE(SUM(pri2.return_quantity),0) as total FROM purchase_return_items pri2 JOIN purchase_returns pr2 ON pri2.purchase_return_id = pr2.id WHERE pr2.purchase_order_id = $1`, [pr.purchase_id]);
                            const unpaidBillsRes = await client.query(`SELECT COUNT(*) as cnt FROM bills WHERE purchase_order_id = $1 AND UPPER(COALESCE(status,'')) NOT IN ('PAID','DRAFT')`, [pr.purchase_id]);
                            const totalBilled = parseFloat(billedRes.rows[0].total) || 0;
                            const netRcv = totalReceived - (parseFloat(returnedRes.rows[0].total) || 0);
                            const hasUnpaidBills = parseInt(unpaidBillsRes.rows[0].cnt) > 0;
                            let canClose = false;
                            if (netRcv > totalOrdered) {
                                canClose = totalBilled >= netRcv && !hasUnpaidBills;
                            } else {
                                canClose = totalBilled >= totalOrdered && !hasUnpaidBills;
                            }
                            if (canClose) {
                                await client.query("UPDATE purchases SET status = 'CLOSED' WHERE id = $1", [pr.purchase_id]);
                            }
                        }
                    }
                }

                // Auto-update linked Sales Orders
                if (newReceiveStatus === 'RECEIVED' || newReceiveStatus === 'PARTIALLY RECEIVED') {
                    const poResult = await client.query('SELECT po_number, reference_number FROM purchases WHERE id = $1', [pr.purchase_id]);
                    if (poResult.rows.length > 0) {
                        const refNum = poResult.rows[0].reference_number;
                        const soLookup = refNum
                            ? await client.query("SELECT id FROM sales_orders WHERE order_number = $1 AND status = 'ON HOLD'", [refNum])
                            : { rows: [] };
                        for (const so of soLookup.rows) {
                            const soItems = await client.query('SELECT item_id, quantity FROM sales_order_items WHERE sales_order_id = $1', [so.id]);
                            let allSufficient = true;
                            for (const si of soItems.rows) {
                                if (si.item_id) {
                                    const stockCheck = await client.query('SELECT stock_quantity FROM items WHERE id = $1', [si.item_id]);
                                    if (stockCheck.rows.length > 0) {
                                        const stock = parseFloat(stockCheck.rows[0].stock_quantity) || 0;
                                        const needed = parseFloat(si.quantity) || 0;
                                        if (stock < needed) { allSufficient = false; break; }
                                    }
                                }
                            }
                            if (allSufficient) {
                                await client.query("UPDATE sales_orders SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [so.id]);
                            }
                        }
                    }
                }
            }
        });

        // Return updated PR with items
        const updatedPR = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        const updatedItems = await db.query('SELECT * FROM purchase_receive_items WHERE receive_id = $1', [id]);
        const result = updatedPR.rows[0];
        result.items = updatedItems.rows;
        res.json(result);
    } catch (error) {
        console.error('Error updating purchase receive:', error);
        res.status(500).json({ error: 'Failed to update purchase receive: ' + error.message });
    }
});

// DELETE a purchase receive (with stock revert if was received)
router.delete('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const { id } = req.params;

        const prResult = await db.query('SELECT * FROM purchase_receives WHERE id = $1', [id]);
        if (prResult.rows.length === 0) {
            return res.status(404).json({ error: 'Purchase receive not found' });
        }

        const pr = prResult.rows[0];
        const wasReceived = pr.status === 'received';

        await database.transaction(async (client) => {
            // If was received, revert stock
            if (wasReceived) {
                const itemsResult = await client.query('SELECT * FROM purchase_receive_items WHERE receive_id = $1', [id]);
                for (const item of itemsResult.rows) {
                    const qty = parseFloat(item.quantity_to_receive) || 0;
                    if (item.item_id && qty > 0) {
                        await client.query(`
                            UPDATE items 
                            SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
                            WHERE id = $2
                        `, [qty, item.item_id]);

                        await client.query(`
                            INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
                            VALUES ($1, 'OUT', $2, $3, $4)
                        `, [item.item_id, qty, pr.receive_number, `Stock reverted: ${pr.receive_number} deleted`]);
                    }
                }
            }

            // Delete items and the PR itself
            await client.query('DELETE FROM purchase_receive_items WHERE receive_id = $1', [id]);
            await client.query('DELETE FROM purchase_receives WHERE id = $1', [id]);

            // Recalculate PO receive_status
            if (pr.purchase_id) {
                const orderedResult = await client.query(`
                    SELECT COALESCE(SUM(quantity), 0) as total_ordered
                    FROM purchase_items WHERE purchase_id = $1
                `, [pr.purchase_id]);

                const receivedResult = await client.query(`
                    SELECT COALESCE(SUM(pri.quantity_to_receive), 0) as total_received
                    FROM purchase_receive_items pri
                    JOIN purchase_receives pr2 ON pri.receive_id = pr2.id
                    WHERE pr2.purchase_id = $1 AND pr2.status = 'received'
                `, [pr.purchase_id]);

                const totalOrdered = parseFloat(orderedResult.rows[0].total_ordered) || 0;
                const totalReceived = parseFloat(receivedResult.rows[0].total_received) || 0;

                let newReceiveStatus = null;
                if (totalReceived >= totalOrdered && totalOrdered > 0) {
                    newReceiveStatus = 'RECEIVED';
                } else if (totalReceived > 0) {
                    newReceiveStatus = 'PARTIALLY RECEIVED';
                }

                await client.query('UPDATE purchases SET receive_status = $1 WHERE id = $2', [newReceiveStatus, pr.purchase_id]);
            }
        });

        res.json({ message: 'Purchase receive deleted successfully', stock_reverted: wasReceived });
    } catch (error) {
        console.error('Error deleting purchase receive:', error);
        res.status(500).json({ error: 'Failed to delete purchase receive: ' + error.message });
    }
});

module.exports = router;
