const express = require('express');
const router = express.Router();
const database = require('../database');

// Get all brands
router.get('/', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT * FROM brands ORDER BY name ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching brands:', error);
        res.status(500).json({ error: 'Failed to fetch brands' });
    }
});

// Add new brand
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Brand name is required' });
        }

        const db = database.getDb();
        const result = await db.query(
            'INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
            [name.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(409).json({ error: 'Brand already exists' });
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding brand:', error);
        res.status(500).json({ error: 'Failed to add brand' });
    }
});

// Delete brand
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const db = database.getDb();
        await db.query('DELETE FROM brands WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting brand:', error);
        res.status(500).json({ error: 'Failed to delete brand' });
    }
});

module.exports = router;
