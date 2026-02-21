const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all packages
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM packages ORDER BY created_at DESC');
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

// DELETE package
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM package_items WHERE package_id = $1', [req.params.id]);
        await pool.query('DELETE FROM packages WHERE id = $1', [req.params.id]);
        res.json({ message: 'Package deleted' });
    } catch (err) {
        console.error('Error deleting package:', err);
        res.status(500).json({ error: 'Failed to delete package' });
    }
});

module.exports = router;
