const express = require('express');
const router = express.Router();
const database = require('../database');

// GET Receive History Report
router.get('/reports/receive-history', async (req, res) => {
    try {
        const db = database.getDb();
        const { from, to } = req.query;

        let dateFilter = '';
        let params = [];

        if (from && to) {
            dateFilter = 'AND pr.receive_date >= $1 AND pr.receive_date <= $2';
            params = [from, to + 'T23:59:59.999'];
        }

        const result = await db.query(`
            SELECT pr.id, pr.receive_date, pr.receive_number,
                   p.po_number AS purchase_order_number,
                   COALESCE(pr.supplier_name, s.name) AS vendor_name,
                   pr.status,
                   COALESCE(SUM(pri.quantity_to_receive), 0) AS quantity_received
            FROM purchase_receives pr
            LEFT JOIN purchases p ON pr.purchase_id = p.id
            LEFT JOIN suppliers s ON pr.supplier_id = s.id
            LEFT JOIN purchase_receive_items pri ON pri.receive_id = pr.id
            WHERE 1=1 ${dateFilter}
            GROUP BY pr.id, pr.receive_date, pr.receive_number, p.po_number,
                     pr.supplier_name, s.name, pr.status
            ORDER BY pr.receive_date ASC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching receive history report:', err);
        res.status(500).json({ error: 'Failed to fetch receive history report' });
    }
});

// Create purchase receive
router.post('/', async (req, res) => {
    try {
        const { purchase_id, supplier_id, supplier_name, receive_date, notes, status, items } = req.body;

        if (!purchase_id) {
            return res.status(400).json({ error: 'purchase_id is required' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one item is required' });
        }

        const db = database.getDb();
        const finalStatus = status || 'draft';

        const poCheck = await db.query('SELECT status, receive_status FROM purchases WHERE id = $1', [purchase_id]);
        if (poCheck.rows.length > 0 && (poCheck.rows[0].receive_status || '').toUpperCase() === 'RECEIVED') {
            return res.status(400).json({ error: 'This Purchase Order has already been fully received.' });
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
      SELECT pr.*, p.po_number
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
             COALESCE(SUM(CASE WHEN pr.status = 'draft' THEN pri.quantity_to_receive ELSE 0 END), 0) as total_in_transit
      FROM purchase_receive_items pri
      JOIN purchase_receives pr ON pri.receive_id = pr.id
      WHERE pr.purchase_id = $1 AND pr.status IN ('received', 'draft')
      GROUP BY pri.item_id, pri.item_name
    `, [poId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching receives by PO:', error);
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

// PATCH mark purchase receive as received
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

module.exports = router;
