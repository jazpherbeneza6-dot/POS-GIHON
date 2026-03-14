const express = require('express');
const router = express.Router();
const database = require('../database');

// Ensure table exists
async function ensureTable() {
    const pool = database.getDb();
    await pool.query(`
        CREATE TABLE IF NOT EXISTS shipment_preferences (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// GET all shipment preferences
router.get('/', async (req, res) => {
    try {
        await ensureTable();
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM shipment_preferences ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching shipment preferences:', err);
        res.status(500).json({ error: 'Failed to fetch shipment preferences' });
    }
});

// POST create new shipment preference
router.post('/', async (req, res) => {
    try {
        await ensureTable();
        const pool = database.getDb();
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const result = await pool.query(
            'INSERT INTO shipment_preferences (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
            [name.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating shipment preference:', err);
        res.status(500).json({ error: 'Failed to create shipment preference' });
    }
});

// DELETE shipment preference
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM shipment_preferences WHERE id = $1', [req.params.id]);
        res.json({ message: 'Shipment preference deleted' });
    } catch (err) {
        console.error('Error deleting shipment preference:', err);
        res.status(500).json({ error: 'Failed to delete shipment preference' });
    }
});

module.exports = router;
