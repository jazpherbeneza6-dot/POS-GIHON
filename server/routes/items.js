const express = require('express');
const router = express.Router();
const database = require('../database');

// Get all items
router.get('/', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT i.*, ig.name as group_name 
      FROM items i 
      LEFT JOIN item_groups ig ON i.group_id = ig.id 
      ORDER BY i.created_at DESC
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching items:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({
      error: 'Failed to fetch items',
      details: error.message
    });
  }
});

// Get single item by ID
router.get('/:id', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT i.*, ig.name as group_name 
      FROM items i 
      LEFT JOIN item_groups ig ON i.group_id = ig.id 
      WHERE i.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Search items
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const db = database.getDb();
    const result = await db.query(`
      SELECT i.*, ig.name as group_name 
      FROM items i 
      LEFT JOIN item_groups ig ON i.group_id = ig.id 
      WHERE i.name ILIKE $1 OR i.sku ILIKE $1 OR i.barcode ILIKE $1
      ORDER BY i.name
      LIMIT 50
    `, [`%${query}%`]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({ error: 'Failed to search items' });
  }
});

// Create item
router.post('/', async (req, res) => {
  try {
    const { name, sku, unit, quantity, reorder_point, price, cost, can_be_wholesale, image_url, group_id } = req.body;


    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Item name is required' });
    }

    if (quantity === undefined || quantity === null || quantity === '') {
      return res.status(400).json({ error: 'Quantity is required' });
    }

    if (price === undefined || price === null || price === '') {
      return res.status(400).json({ error: 'Price is required' });
    }

    const stockQuantity = parseInt(quantity);
    const sellingPrice = parseInt(price);
    const purchaseCost = parseInt(cost) || 0;
    const reorderPointValue = parseInt(reorder_point) || 10;
    const unitValue = unit || 'pcs';
    const groupIdValue = group_id ? parseInt(group_id) : null;

    if (isNaN(stockQuantity) || stockQuantity < 0) {
      return res.status(400).json({ error: 'Quantity must be a valid positive number' });
    }

    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return res.status(400).json({ error: 'Price must be a valid positive number' });
    }

    const db = database.getDb();

    // Check for duplicate name
    const existingName = await db.query('SELECT id FROM items WHERE name ILIKE $1', [name.trim()]);
    if (existingName.rows.length > 0) {
      return res.status(409).json({ error: 'Item with this name already exists' });
    }

    // Check for duplicate SKU or generate one if not provided
    let finalSku = sku ? sku.trim() : null;

    if (finalSku) {
      const existingSku = await db.query('SELECT id FROM items WHERE sku = $1', [finalSku]);
      if (existingSku.rows.length > 0) {
        return res.status(409).json({ error: 'Item with this SKU already exists' });
      }
    } else {
      // Auto-generate SKU if not provided
      let isUnique = false;
      while (!isUnique) {
        // Generate SKU: SKU-XXXXXX (6 alphanumeric characters)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let randomPart = '';
        for (let i = 0; i < 6; i++) {
          randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        finalSku = `SKU-${randomPart}`;

        // Check if this SKU already exists
        const existingGenerated = await db.query('SELECT id FROM items WHERE sku = $1', [finalSku]);
        if (existingGenerated.rows.length === 0) {
          isUnique = true;
        }
      }
    }

    const result = await db.query(`
      INSERT INTO items (name, sku, unit, stock_quantity, reorder_point, selling_price, purchase_cost, can_be_wholesale, image_url, group_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [name.trim(), finalSku, unitValue, stockQuantity, reorderPointValue, sellingPrice, purchaseCost, can_be_wholesale || false, image_url || null, groupIdValue]);

    const itemId = result.rows[0].id;
    const itemResult = await db.query('SELECT * FROM items WHERE id = $1', [itemId]);


    res.status(201).json(itemResult.rows[0]);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item', details: error.message });
  }
});

// Update item
router.put('/:id', async (req, res) => {
  try {
    const { name, sku, unit, quantity, reorder_point, price, cost, can_be_wholesale, image_url } = req.body;
    const db = database.getDb();


    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Item name is required' });
    }

    if (quantity === undefined || quantity === null || quantity === '') {
      return res.status(400).json({ error: 'Quantity is required' });
    }

    if (price === undefined || price === null || price === '') {
      return res.status(400).json({ error: 'Price is required' });
    }

    const stockQuantity = parseInt(quantity);
    const sellingPrice = parseInt(price);
    const purchaseCost = parseInt(cost) || 0;
    const reorderPointValue = parseInt(reorder_point) || 10;
    const unitValue = unit || 'pcs';

    if (isNaN(stockQuantity) || stockQuantity < 0) {
      return res.status(400).json({ error: 'Quantity must be a valid positive number' });
    }

    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return res.status(400).json({ error: 'Price must be a valid positive number' });
    }

    await db.query(`
      UPDATE items 
      SET name = $1, sku = $2, unit = $3, stock_quantity = $4, reorder_point = $5,
          selling_price = $6, purchase_cost = $7, can_be_wholesale = $8, image_url = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
    `, [name.trim(), sku || null, unitValue, stockQuantity, reorderPointValue, sellingPrice, purchaseCost, can_be_wholesale || false, image_url || null, req.params.id]);

    const result = await db.query('SELECT * FROM items WHERE id = $1', [req.params.id]);


    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item', details: error.message });
  }
});

// Delete item
router.delete('/:id', async (req, res) => {
  try {
    const itemId = req.params.id;
    const db = database.getDb();

    // Use transaction to ensure all deletions succeed or all fail
    await database.transaction(async (client) => {
      // Delete related records first (order matters due to foreign keys)
      // 1. Delete barcodes (has CASCADE but explicit is better)
      await client.query('DELETE FROM barcodes WHERE item_id = $1', [itemId]);

      // 2. Delete inventory transactions
      await client.query('DELETE FROM inventory_transactions WHERE item_id = $1', [itemId]);

      // 3. Delete sales items
      await client.query('DELETE FROM sales_items WHERE item_id = $1', [itemId]);

      // 4. Delete purchase items
      await client.query('DELETE FROM purchase_items WHERE item_id = $1', [itemId]);

      // 5. Finally, delete the item itself
      await client.query('DELETE FROM items WHERE id = $1', [itemId]);
    });

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item', details: error.message });
  }
});

// Get item groups
router.get('/groups/list', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query('SELECT * FROM item_groups ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching item groups:', error);
    res.status(500).json({ error: 'Failed to fetch item groups' });
  }
});

// Create item group
router.post('/groups', async (req, res) => {
  try {
    const { name, description, unit, brand, manufacturer } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    const db = database.getDb();
    const result = await db.query(`
      INSERT INTO item_groups (name, description, unit, brand, manufacturer)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [name, description || null, unit || 'pcs', brand || null, manufacturer || null]);
    const groupId = result.rows[0].id;
    const groupResult = await db.query('SELECT * FROM item_groups WHERE id = $1', [groupId]);
    res.status(201).json(groupResult.rows[0]);
  } catch (error) {
    console.error('Error creating item group:', error);
    if (error.code === '23505') { // PostgreSQL unique violation
      res.status(400).json({ error: 'Group name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create item group' });
    }
  }
});

// Update item group
router.put('/groups/:id', async (req, res) => {
  try {
    const { name, description, unit, brand, manufacturer } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    const db = database.getDb();
    await db.query(`
      UPDATE item_groups 
      SET name = $1, description = $2, unit = $3, brand = $4, manufacturer = $5
      WHERE id = $6
    `, [name, description || null, unit || 'pcs', brand || null, manufacturer || null, req.params.id]);

    const result = await db.query('SELECT * FROM item_groups WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating item group:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Group name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update item group' });
    }
  }
});

// Delete item group
router.delete('/groups/:id', async (req, res) => {
  try {
    const db = database.getDb();

    // First, unset group_id for all items in this group
    await db.query('UPDATE items SET group_id = NULL WHERE group_id = $1', [req.params.id]);

    // Then delete the group
    const result = await db.query('DELETE FROM item_groups WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting item group:', error);
    res.status(500).json({ error: 'Failed to delete item group' });
  }
});

module.exports = router;
