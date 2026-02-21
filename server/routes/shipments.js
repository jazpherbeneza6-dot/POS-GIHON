const express = require('express');
const router = express.Router();
const database = require('../database');

// Helper: Recalculate and update sales order status based on its packages/shipments
async function updateSalesOrderFulfillmentStatus(pool, salesOrderId) {
    if (!salesOrderId) return;
    try {
        // Get all packages for this sales order
        const pkgResult = await pool.query(
            'SELECT id, status FROM packages WHERE sales_order_id = $1',
            [salesOrderId]
        );
        const packages = pkgResult.rows;
        if (packages.length === 0) return;

        const allDelivered = packages.every(p => p.status === 'DELIVERED');
        const allShipped = packages.every(p => p.status === 'SHIPPED' || p.status === 'DELIVERED');
        const someShipped = packages.some(p => p.status === 'SHIPPED' || p.status === 'DELIVERED');

        // Get current sales order status
        const soResult = await pool.query('SELECT status FROM sales_orders WHERE id = $1', [salesOrderId]);
        if (soResult.rows.length === 0) return;
        const currentStatus = soResult.rows[0].status;

        // Don't downgrade from CLOSED or CANCELLED
        if (currentStatus === 'CLOSED' || currentStatus === 'CANCELLED') return;

        let newStatus = currentStatus;
        if (allDelivered) {
            newStatus = 'DELIVERED';
        } else if (allShipped) {
            newStatus = 'SHIPPED';
        } else if (someShipped) {
            newStatus = 'PARTIALLY SHIPPED';
        } else {
            // No packages shipped — keep CONFIRMED or revert
            if (currentStatus === 'SHIPPED' || currentStatus === 'DELIVERED' || currentStatus === 'PARTIALLY SHIPPED') {
                newStatus = 'CONFIRMED';
            }
        }

        if (newStatus !== currentStatus) {
            await pool.query(
                'UPDATE sales_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [newStatus, salesOrderId]
            );
            console.log(`Sales order ${salesOrderId} status updated: ${currentStatus} → ${newStatus}`);
        }
    } catch (err) {
        console.error('Error updating sales order fulfillment status:', err);
    }
}

// GET all shipments
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT s.*, p.package_number, p.customer_name, p.sales_order_id, p.sales_order_number
            FROM shipments s
            LEFT JOIN packages p ON s.package_id = p.id
            ORDER BY s.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching shipments:', err);
        res.status(500).json({ error: 'Failed to fetch shipments' });
    }
});

// GET next shipment number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT shipment_order_number FROM shipments 
            ORDER BY id DESC LIMIT 1
        `);
        let nextNum = 'SHP-00001';
        if (result.rows.length > 0) {
            const lastNum = result.rows[0].shipment_order_number;
            const match = lastNum.match(/SHP-(\d+)/);
            if (match) {
                const num = parseInt(match[1]) + 1;
                nextNum = 'SHP-' + String(num).padStart(5, '0');
            }
        }
        res.json({ shipment_order_number: nextNum });
    } catch (err) {
        console.error('Error generating shipment number:', err);
        res.status(500).json({ error: 'Failed to generate shipment number' });
    }
});

// GET shipment by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(`
            SELECT s.*, p.package_number, p.customer_name, p.sales_order_id, p.sales_order_number
            FROM shipments s
            LEFT JOIN packages p ON s.package_id = p.id
            WHERE s.id = $1
        `, [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shipment not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching shipment:', err);
        res.status(500).json({ error: 'Failed to fetch shipment' });
    }
});

// POST create shipment
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            package_id,
            sales_order_id,
            shipment_order_number,
            ship_date,
            carrier,
            tracking_number,
            tracking_url,
            shipping_charges,
            notes,
            already_delivered
        } = req.body;

        const status = already_delivered ? 'DELIVERED' : 'SHIPPED';

        const result = await pool.query(`
            INSERT INTO shipments (
                package_id, sales_order_id, shipment_order_number, ship_date,
                carrier, tracking_number, tracking_url, shipping_charges,
                notes, already_delivered, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            package_id, sales_order_id, shipment_order_number, ship_date,
            carrier, tracking_number || '', tracking_url || '',
            shipping_charges || 0, notes || '', already_delivered || false, status
        ]);

        // Update package status
        const pkgStatus = already_delivered ? 'DELIVERED' : 'SHIPPED';
        await pool.query(
            'UPDATE packages SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [pkgStatus, package_id]
        );

        // Auto-update sales order status based on all packages
        const soId = sales_order_id || (await pool.query('SELECT sales_order_id FROM packages WHERE id = $1', [package_id])).rows[0]?.sales_order_id;
        await updateSalesOrderFulfillmentStatus(pool, soId);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating shipment:', err);
        res.status(500).json({ error: 'Failed to create shipment' });
    }
});

// GET shipment by package ID
router.get('/by-package/:packageId', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query(
            'SELECT * FROM shipments WHERE package_id = $1 ORDER BY id DESC LIMIT 1',
            [req.params.packageId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No shipment found for this package' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching shipment by package:', err);
        res.status(500).json({ error: 'Failed to fetch shipment' });
    }
});

// PATCH mark shipment as delivered
router.patch('/mark-delivered/:packageId', async (req, res) => {
    try {
        const pool = database.getDb();
        const packageId = req.params.packageId;

        // Update shipment status
        await pool.query(
            "UPDATE shipments SET status = 'DELIVERED', already_delivered = true, updated_at = CURRENT_TIMESTAMP WHERE package_id = $1",
            [packageId]
        );

        // Update package status
        await pool.query(
            "UPDATE packages SET status = 'DELIVERED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [packageId]
        );

        // Auto-update sales order status — get sales_order_id from package
        const pkgResult = await pool.query('SELECT sales_order_id FROM packages WHERE id = $1', [packageId]);
        const soId = pkgResult.rows[0]?.sales_order_id;
        await updateSalesOrderFulfillmentStatus(pool, soId);

        res.json({ message: 'Marked as delivered' });
    } catch (err) {
        console.error('Error marking as delivered:', err);
        res.status(500).json({ error: 'Failed to mark as delivered' });
    }
});

// DELETE shipment by package ID
router.delete('/by-package/:packageId', async (req, res) => {
    try {
        const pool = database.getDb();
        const packageId = req.params.packageId;

        // Get the sales_order_id before deleting
        const pkgResult = await pool.query('SELECT sales_order_id FROM packages WHERE id = $1', [packageId]);
        const soId = pkgResult.rows[0]?.sales_order_id;

        await pool.query('DELETE FROM shipments WHERE package_id = $1', [packageId]);

        // Revert package status
        await pool.query(
            "UPDATE packages SET status = 'NOT SHIPPED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [packageId]
        );

        // Auto-update sales order status
        await updateSalesOrderFulfillmentStatus(pool, soId);

        res.json({ message: 'Shipment deleted' });
    } catch (err) {
        console.error('Error deleting shipment:', err);
        res.status(500).json({ error: 'Failed to delete shipment' });
    }
});

// DELETE shipment
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();

        // Get the shipment first to find related package
        const shipment = await pool.query('SELECT * FROM shipments WHERE id = $1', [req.params.id]);
        let soId = null;

        if (shipment.rows.length > 0) {
            const pkgId = shipment.rows[0].package_id;
            soId = shipment.rows[0].sales_order_id;

            // If no sales_order_id on shipment, get it from package
            if (!soId) {
                const pkgResult = await pool.query('SELECT sales_order_id FROM packages WHERE id = $1', [pkgId]);
                soId = pkgResult.rows[0]?.sales_order_id;
            }

            // Check if there are other shipments for this package
            const others = await pool.query(
                'SELECT id FROM shipments WHERE package_id = $1 AND id != $2',
                [pkgId, req.params.id]
            );
            // If no other shipments, revert package to NOT SHIPPED
            if (others.rows.length === 0) {
                await pool.query(
                    "UPDATE packages SET status = 'NOT SHIPPED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                    [pkgId]
                );
            }
        }

        await pool.query('DELETE FROM shipments WHERE id = $1', [req.params.id]);

        // Auto-update sales order status
        await updateSalesOrderFulfillmentStatus(pool, soId);

        res.json({ message: 'Shipment deleted' });
    } catch (err) {
        console.error('Error deleting shipment:', err);
        res.status(500).json({ error: 'Failed to delete shipment' });
    }
});

module.exports = router;
