const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all delivery methods
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM delivery_methods ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching delivery methods:', err);
        res.status(500).json({ error: 'Failed to fetch delivery methods' });
    }
});

// POST create new delivery method
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const result = await pool.query(
            'INSERT INTO delivery_methods (name) VALUES ($1) RETURNING *',
            [name.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating delivery method:', err);
        res.status(500).json({ error: 'Failed to create delivery method' });
    }
});

// DELETE delivery method
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM delivery_methods WHERE id = $1', [req.params.id]);
        res.json({ message: 'Delivery method deleted' });
    } catch (err) {
        console.error('Error deleting delivery method:', err);
        res.status(500).json({ error: 'Failed to delete delivery method' });
    }
});

module.exports = router;
