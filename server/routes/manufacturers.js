const express = require('express');
const router = express.Router();
const database = require('../database');

// Get all manufacturers
router.get('/', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT * FROM manufacturers ORDER BY name ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching manufacturers:', error);
        res.status(500).json({ error: 'Failed to fetch manufacturers' });
    }
});

// Add new manufacturer
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Manufacturer name is required' });
        }

        const db = database.getDb();
        const result = await db.query(
            'INSERT INTO manufacturers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
            [name.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'Manufacturer already exists' });
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding manufacturer:', error);
        res.status(500).json({ error: 'Failed to add manufacturer' });
    }
});

// Delete manufacturer
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = database.getDb();
        await db.query('DELETE FROM manufacturers WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting manufacturer:', error);
        res.status(500).json({ error: 'Failed to delete manufacturer' });
    }
});

module.exports = router;
