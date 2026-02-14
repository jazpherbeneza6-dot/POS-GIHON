const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all salespersons
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM salespersons ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching salespersons:', err);
        res.status(500).json({ error: 'Failed to fetch salespersons' });
    }
});

// POST create new salesperson
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const { name, email, password } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const result = await pool.query(
            'INSERT INTO salespersons (name, email, password) VALUES ($1, $2, $3) RETURNING *',
            [name, email || '', password || '']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating salesperson:', err);
        res.status(500).json({ error: 'Failed to create salesperson' });
    }
});

// PUT update salesperson
router.put('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const { name, email, password } = req.body;
        const result = await pool.query(
            'UPDATE salespersons SET name = COALESCE($1, name), email = COALESCE($2, email), password = COALESCE($3, password) WHERE id = $4 RETURNING *',
            [name, email, password, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Salesperson not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating salesperson:', err);
        res.status(500).json({ error: 'Failed to update salesperson' });
    }
});

// DELETE salesperson
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM salespersons WHERE id = $1', [req.params.id]);
        res.json({ message: 'Salesperson deleted' });
    } catch (err) {
        console.error('Error deleting salesperson:', err);
        res.status(500).json({ error: 'Failed to delete salesperson' });
    }
});

module.exports = router;
