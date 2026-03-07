const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all packages
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT p.*,
                   s.carrier,
                   s.tracking_number,
                   s.ship_date AS shipment_date,
                   s.shipment_order_number
            FROM packages p
            LEFT JOIN shipments s ON s.package_id = p.id
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching packages:', err);
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

// GET next package number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT COUNT(*) FROM packages');
        const count = parseInt(result.rows[0].count) + 1;
        const package_number = 'PKG-' + String(count).padStart(5, '0');
        res.json({ package_number });
    } catch (err) {
        console.error('Error getting next package number:', err);
        res.status(500).json({ error: 'Failed to get next package number' });
    }
});

// GET packages by sales order ID
router.get('/by-order/:orderId', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(
            'SELECT * FROM packages WHERE sales_order_id = $1 ORDER BY created_at DESC',
            [req.params.orderId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching packages for order:', err);
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

// GET single package by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const pkgResult = await pool.query('SELECT * FROM packages WHERE id = $1', [req.params.id]);
        if (pkgResult.rows.length === 0) {
            return res.status(404).json({ error: 'Package not found' });
        }
        const pkg = pkgResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM package_items WHERE package_id = $1', [pkg.id]);
        pkg.items = itemsResult.rows;

        res.json(pkg);
    } catch (err) {
        console.error('Error fetching package:', err);
        res.status(500).json({ error: 'Failed to fetch package' });
    }
});

// POST create new package
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            package_number,
            sales_order_id,
            sales_order_number,
            customer_name,
            package_date,
            internal_notes,
            items
        } = req.body;

        // DRAFT guard — cannot create package for a draft order
        if (sales_order_id) {
            const soCheck = await pool.query('SELECT status FROM sales_orders WHERE id = $1', [sales_order_id]);
            if (soCheck.rows.length > 0 && (soCheck.rows[0].status || '').toUpperCase() === 'DRAFT') {
                return res.status(403).json({ error: 'Cannot process a Draft order. Please confirm the order first.' });
            }
        }

        // Note: Stock was already deducted when the sales order was created,
        // so no additional stock check is needed here.

        const result = await pool.query(
            `INSERT INTO packages (package_number, sales_order_id, sales_order_number, customer_name, package_date, internal_notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [package_number, sales_order_id, sales_order_number, customer_name, package_date || new Date(), internal_notes || '']
        );

        const pkg = result.rows[0];

        // Insert package items
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO package_items (package_id, item_name, item_id, ordered_quantity, packed_quantity, quantity_to_pack)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [pkg.id, item.item_name, item.item_id || null, item.ordered_quantity || 0, item.packed_quantity || 0, item.quantity_to_pack || 0]
                );
            }
        }

        res.status(201).json(pkg);
    } catch (err) {
        console.error('Error creating package:', err);
        res.status(500).json({ error: 'Failed to create package' });
    }
});

// PUT update package
router.put('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            package_number,
            sales_order_id,
            sales_order_number,
            customer_name,
            package_date,
            internal_notes,
            status,
            items
        } = req.body;

        const result = await pool.query(
            `UPDATE packages SET
                package_number = COALESCE($1, package_number),
                sales_order_id = COALESCE($2, sales_order_id),
                sales_order_number = COALESCE($3, sales_order_number),
                customer_name = COALESCE($4, customer_name),
                package_date = COALESCE($5, package_date),
                internal_notes = COALESCE($6, internal_notes),
                status = COALESCE($7, status),
                updated_at = NOW()
             WHERE id = $8
             RETURNING *`,
            [package_number, sales_order_id, sales_order_number, customer_name, package_date, internal_notes, status, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Package not found' });
        }

        const pkg = result.rows[0];

        // Sync status to associated shipment
        if (status) {
            const shipmentExists = await pool.query('SELECT id FROM shipments WHERE package_id = $1', [req.params.id]);
            if (shipmentExists.rows.length > 0) {
                const isDelivered = status.toUpperCase() === 'DELIVERED';
                await pool.query(
                    `UPDATE shipments SET status = $1, already_delivered = $2, updated_at = CURRENT_TIMESTAMP WHERE package_id = $3`,
                    [status.toUpperCase(), isDelivered, req.params.id]
                );
            }
        }

        // Auto-update sales order fulfillment status
        const soId = pkg.sales_order_id;
        if (soId) {
            try {
                const pkgResult = await pool.query(
                    'SELECT id, status FROM packages WHERE sales_order_id = $1', [soId]
                );
                const packages = pkgResult.rows;
                if (packages.length > 0) {
                    const allDelivered = packages.every(p => p.status === 'DELIVERED');
                    const allShipped = packages.every(p => p.status === 'SHIPPED' || p.status === 'DELIVERED');
                    const someShipped = packages.some(p => p.status === 'SHIPPED' || p.status === 'DELIVERED');
                    const soResult = await pool.query('SELECT status FROM sales_orders WHERE id = $1', [soId]);
                    if (soResult.rows.length > 0) {
                        const currentStatus = soResult.rows[0].status;
                        if (currentStatus !== 'CLOSED' && currentStatus !== 'CANCELLED') {
                            let newStatus = currentStatus;
                            if (allDelivered) newStatus = 'DELIVERED';
                            else if (allShipped) newStatus = 'SHIPPED';
                            else if (someShipped) newStatus = 'PARTIALLY SHIPPED';
                            else if (['SHIPPED', 'DELIVERED', 'PARTIALLY SHIPPED'].includes(currentStatus)) newStatus = 'CONFIRMED';
                            if (newStatus !== currentStatus) {
                                await pool.query('UPDATE sales_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStatus, soId]);
                            }
                        }
                    }
                }
            } catch (e) { console.error('Error syncing SO status:', e); }
        }

        // Replace package items
        if (items) {
            await pool.query('DELETE FROM package_items WHERE package_id = $1', [pkg.id]);
            for (const item of items) {
                await pool.query(
                    `INSERT INTO package_items (package_id, item_name, item_id, ordered_quantity, packed_quantity, quantity_to_pack)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [pkg.id, item.item_name, item.item_id || null, item.ordered_quantity || 0, item.packed_quantity || 0, item.quantity_to_pack || 0]
                );
            }
        }

        res.json(pkg);
    } catch (err) {
        console.error('Error updating package:', err);
        res.status(500).json({ error: 'Failed to update package' });
    }
});

// DELETE package
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM shipments WHERE package_id = $1', [req.params.id]);
        await pool.query('DELETE FROM package_items WHERE package_id = $1', [req.params.id]);
        await pool.query('DELETE FROM packages WHERE id = $1', [req.params.id]);
        res.json({ message: 'Package deleted' });
    } catch (err) {
        console.error('Error deleting package:', err);
        res.status(500).json({ error: 'Failed to delete package' });
    }
});

module.exports = router;
