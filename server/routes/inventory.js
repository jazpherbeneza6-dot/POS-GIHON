const express = require('express');
const router = express.Router();
const database = require('../database');

// Stock in
router.post('/stock-in', async (req, res) => {
  try {
    const { item_id, quantity, reference, notes } = req.body;
    
    if (!item_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Item ID and positive quantity are required' });
    }

    await database.transaction(async (client) => {
      // Add transaction record
      await client.query(`
        INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
        VALUES ($1, 'IN', $2, $3, $4)
      `, [item_id, quantity, reference || null, notes || null]);

      // Update item stock quantity
      await client.query(`
        UPDATE items 
        SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [quantity, item_id]);
    });
    
    const db = database.getDb();
    const result = await db.query('SELECT * FROM items WHERE id = $1', [item_id]);
    res.json({ message: 'Stock added successfully', item: result.rows[0] });
  } catch (error) {
    console.error('Error adding stock:', error);
    res.status(500).json({ error: 'Failed to add stock' });
  }
});

// Stock out
router.post('/stock-out', async (req, res) => {
  try {
    const { item_id, quantity, reference, notes } = req.body;
    
    if (!item_id || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Item ID and positive quantity are required' });
    }

    const db = database.getDb();
    
    // Check current stock
    const itemResult = await db.query('SELECT stock_quantity FROM items WHERE id = $1', [item_id]);
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    if (itemResult.rows[0].stock_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    // Start transaction
    await database.transaction(async (client) => {
      // Add transaction record
      await client.query(`
        INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
        VALUES ($1, 'OUT', $2, $3, $4)
      `, [item_id, quantity, reference || null, notes || null]);

      // Update item stock quantity
      await client.query(`
        UPDATE items 
        SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [quantity, item_id]);
    });
    
    const result = await db.query('SELECT * FROM items WHERE id = $1', [item_id]);
    res.json({ message: 'Stock removed successfully', item: result.rows[0] });
  } catch (error) {
    console.error('Error removing stock:', error);
    res.status(500).json({ error: 'Failed to remove stock' });
  }
});

// Get transaction history
router.get('/transactions', async (req, res) => {
  try {
    const { item_id, type, limit = 100 } = req.query;
    const db = database.getDb();
    
    let query = `
      SELECT t.*, i.name as item_name, i.sku, i.barcode
      FROM inventory_transactions t
      JOIN items i ON t.item_id = i.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    if (item_id) {
      query += ` AND t.item_id = $${paramCount}`;
      params.push(item_id);
      paramCount++;
    }
    if (type) {
      query += ` AND t.type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }
    
    query += ` ORDER BY t.date DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get current stock for item
router.get('/stock/:itemId', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query('SELECT id, name, stock_quantity FROM items WHERE id = $1', [req.params.itemId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const item = result.rows[0];
    res.json({ item_id: item.id, item_name: item.name, stock_quantity: item.stock_quantity });
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

module.exports = router;
