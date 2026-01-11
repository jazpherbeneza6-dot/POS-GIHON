const express = require('express');
const router = express.Router();
const database = require('../database');

// Find item by barcode
router.get('/scan/:code', async (req, res) => {
  try {
    const barcode = req.params.code;
    const db = database.getDb();
    
    // Search in items table
    const itemResult = await db.query(`
      SELECT i.*, ig.name as group_name
      FROM items i
      LEFT JOIN item_groups ig ON i.group_id = ig.id
      WHERE i.barcode = $1
    `, [barcode]);

    if (itemResult.rows.length > 0) {
      return res.json(itemResult.rows[0]);
    }

    // Search in barcodes table
    const barcodeResult = await db.query(`
      SELECT b.*, i.*, ig.name as group_name
      FROM barcodes b
      JOIN items i ON b.item_id = i.id
      LEFT JOIN item_groups ig ON i.group_id = ig.id
      WHERE b.barcode = $1
    `, [barcode]);

    if (barcodeResult.rows.length > 0) {
      const itemDataResult = await db.query('SELECT * FROM items WHERE id = $1', [barcodeResult.rows[0].item_id]);
      res.json({ ...itemDataResult.rows[0], group_name: barcodeResult.rows[0].group_name });
    } else {
      res.status(404).json({ error: 'Item not found for barcode' });
    }
  } catch (error) {
    console.error('Error scanning barcode:', error);
    res.status(500).json({ error: 'Failed to scan barcode' });
  }
});

// Generate barcode (returns barcode data, actual generation in frontend)
router.post('/generate', async (req, res) => {
  try {
    const { item_id, barcode, format = 'CODE128' } = req.body;
    
    if (!item_id || !barcode) {
      return res.status(400).json({ error: 'Item ID and barcode are required' });
    }

    const db = database.getDb();
    
    // Check if item exists
    const itemResult = await db.query('SELECT * FROM items WHERE id = $1', [item_id]);
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Update item barcode
    await db.query('UPDATE items SET barcode = $1 WHERE id = $2', [barcode, item_id]);

    // Add/update barcode mapping
    await db.query(`
      INSERT INTO barcodes (item_id, barcode, format)
      VALUES ($1, $2, $3)
      ON CONFLICT (barcode) DO UPDATE SET item_id = $1, format = $3
    `, [item_id, barcode, format]);

    res.json({ 
      item_id, 
      barcode, 
      format,
      message: 'Barcode generated and linked to item'
    });
  } catch (error) {
    console.error('Error generating barcode:', error);
    res.status(500).json({ error: 'Failed to generate barcode' });
  }
});

module.exports = router;
