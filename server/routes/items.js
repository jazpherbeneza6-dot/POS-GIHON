const express = require('express');
const router = express.Router();
const database = require('../database');

// Get all items
router.get('/', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT i.*, ig.name as group_name,
             COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
             COALESCE(i.brand, ig.brand) as brand
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
      SELECT i.*, ig.name as group_name,
             COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
             COALESCE(i.brand, ig.brand) as brand
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
      SELECT i.*, ig.name as group_name,
             COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
             COALESCE(i.brand, ig.brand) as brand
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
    const db = database.getDb();
    const { name, sku, unit, quantity, reorder_point, price, cost, can_be_wholesale, image_url, group_id, manufacturer, brand, description, upc, ean, isbn, dimensions, tax_rate, account, type, weight, purchase_account, purchase_description } = req.body;


    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Item name is required' });
    }

    if (quantity === undefined || quantity === null || quantity === '') {
      return res.status(400).json({ error: 'Quantity is required' });
    }

    if (price === undefined || price === null || price === '') {
      return res.status(400).json({ error: 'Price is required' });
    }

    // Check for duplicate SKU (if SKU is provided)
    if (sku && sku.trim() !== '') {
      const existingSku = await db.query(
        'SELECT id FROM items WHERE LOWER(sku) = LOWER($1)',
        [sku.trim()]
      );
      if (existingSku.rows.length > 0) {
        return res.status(400).json({ error: `SKU "${sku}" already exists. Please use a different SKU.` });
      }
    }

    const stockQuantity = parseInt(quantity);
    const sellingPrice = parseInt(price);
    const purchaseCost = parseInt(cost) || 0;
    const reorderPointValue = parseInt(reorder_point) || 10;
    const unitValue = unit || 'pcs';
    const groupIdValue = group_id ? parseInt(group_id) : null;
    const manufacturerValue = manufacturer || null;
    const brandValue = brand || null;
    const descriptionValue = description || null;
    const upcValue = upc || null;
    const eanValue = ean || null;
    const isbnValue = isbn || null;
    const dimensionsValue = dimensions || null;
    const taxRateValue = tax_rate || null;
    const accountValue = account || null;
    const typeValue = type || 'goods';
    const weightValue = weight || null;
    const purchaseAccountValue = purchase_account || null;
    const purchaseDescriptionValue = purchase_description || null;

    if (isNaN(stockQuantity) || stockQuantity < 0) {
      return res.status(400).json({ error: 'Quantity must be a valid positive number' });
    }

    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return res.status(400).json({ error: 'Price must be a valid positive number' });
    }


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
      INSERT INTO items (name, sku, unit, stock_quantity, reorder_point, selling_price, purchase_cost, can_be_wholesale, image_url, group_id, manufacturer, brand, description, upc, ean, isbn, dimensions, tax_rate, account, type, weight, purchase_account, purchase_description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id
    `, [name.trim(), finalSku, unitValue, stockQuantity, reorderPointValue, sellingPrice, purchaseCost, can_be_wholesale || false, image_url || null, groupIdValue, manufacturerValue, brandValue, descriptionValue, upcValue, eanValue, isbnValue, dimensionsValue, taxRateValue, accountValue, typeValue, weightValue, purchaseAccountValue, purchaseDescriptionValue]);

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
    const { name, sku, unit, quantity, reorder_point, price, cost, can_be_wholesale, image_url, group_id, manufacturer, brand, description, upc, ean, isbn, dimensions, tax_rate, account, type, weight, purchase_account, purchase_description, status, is_active, _partialUpdate, selling_price, purchase_cost, stock_quantity } = req.body;
    const db = database.getDb();

    // Check if this is a partial/single-field update from bulk update
    if (_partialUpdate) {
      // Build dynamic update query for only the fields that were provided
      const updates = [];
      const values = [];
      let paramIndex = 1;

      // Map of allowed fields for partial update
      const fieldMap = {
        'selling_price': 'selling_price',
        'purchase_cost': 'purchase_cost',
        'reorder_point': 'reorder_point',
        'stock_quantity': 'stock_quantity',
        'name': 'name',
        'sku': 'sku',
        'unit': 'unit',
        'manufacturer': 'manufacturer',
        'brand': 'brand',
        'description': 'description',
        'upc': 'upc',
        'ean': 'ean',
        'isbn': 'isbn',
        'dimensions': 'dimensions',
        'tax_rate': 'tax_rate',
        'account': 'account',
        'type': 'type',
        'weight': 'weight',
        'purchase_account': 'purchase_account',
        'purchase_description': 'purchase_description',
        'status': 'status',
        'is_returnable': 'is_returnable',
        'image_url': 'image_url'
      };

      // Add only the fields that were provided
      for (const [key, column] of Object.entries(fieldMap)) {
        if (req.body[key] !== undefined) {
          updates.push(`${column} = $${paramIndex}`);
          values.push(req.body[key]);
          paramIndex++;
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(req.params.id);

      await db.query(`
        UPDATE items 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
      `, values);

      const result = await db.query(`
        SELECT i.*, ig.name as group_name,
               COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
               COALESCE(i.brand, ig.brand) as brand
        FROM items i 
        LEFT JOIN item_groups ig ON i.group_id = ig.id 
        WHERE i.id = $1
      `, [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      return res.json(result.rows[0]);
    }

    // Check if this is a status-only update (for mark as inactive/active)
    const isStatusOnlyUpdate = (status !== undefined || is_active !== undefined) && name === undefined && quantity === undefined && price === undefined;

    if (isStatusOnlyUpdate) {
      // Only updating status - simpler update
      const statusValue = status || (is_active === false ? 'inactive' : 'active');

      await db.query(`
        UPDATE items 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [statusValue, req.params.id]);

      const result = await db.query(`
        SELECT i.*, ig.name as group_name,
               COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
               COALESCE(i.brand, ig.brand) as brand
        FROM items i 
        LEFT JOIN item_groups ig ON i.group_id = ig.id 
        WHERE i.id = $1
      `, [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      return res.json(result.rows[0]);
    }

    // Check if this is a group_id-only update
    const isGroupIdOnlyUpdate = group_id !== undefined && name === undefined && quantity === undefined && price === undefined;

    if (isGroupIdOnlyUpdate) {
      // Only updating group_id - simpler update
      const groupIdValue = group_id === null || group_id === '' ? null : parseInt(group_id);

      await db.query(`
        UPDATE items 
        SET group_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [groupIdValue, req.params.id]);

      const result = await db.query(`
        SELECT i.*, ig.name as group_name,
               COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
               COALESCE(i.brand, ig.brand) as brand
        FROM items i 
        LEFT JOIN item_groups ig ON i.group_id = ig.id 
        WHERE i.id = $1
      `, [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      return res.json(result.rows[0]);
    }

    // Full update - validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Item name is required' });
    }

    if (quantity === undefined || quantity === null || quantity === '') {
      return res.status(400).json({ error: 'Quantity is required' });
    }

    if (price === undefined || price === null || price === '') {
      return res.status(400).json({ error: 'Price is required' });
    }

    // Check for duplicate SKU (if SKU is provided) - exclude current item
    if (sku && sku.trim() !== '') {
      const existingSku = await db.query(
        'SELECT id FROM items WHERE LOWER(sku) = LOWER($1) AND id != $2',
        [sku.trim(), req.params.id]
      );
      if (existingSku.rows.length > 0) {
        return res.status(400).json({ error: `SKU "${sku}" already exists. Please use a different SKU.` });
      }
    }

    const stockQuantity = parseInt(quantity);
    const sellingPrice = parseInt(price);
    const purchaseCost = parseInt(cost) || 0;
    const reorderPointValue = parseInt(reorder_point) || 10;
    const unitValue = unit || 'pcs';
    const groupIdValue = group_id !== undefined ? (group_id === null || group_id === '' ? null : parseInt(group_id)) : null;
    const manufacturerValue = manufacturer !== undefined ? manufacturer : null;
    const brandValue = brand !== undefined ? brand : null;
    const descriptionValue = description !== undefined ? description : null;
    const upcValue = upc !== undefined ? upc : null;
    const eanValue = ean !== undefined ? ean : null;
    const isbnValue = isbn !== undefined ? isbn : null;
    const dimensionsValue = dimensions !== undefined ? dimensions : null;
    const taxRateValue = tax_rate !== undefined ? tax_rate : null;
    const accountValue = account !== undefined ? account : null;
    const typeValue = type !== undefined ? type : 'goods';
    const weightValue = weight !== undefined ? weight : null;
    const purchaseAccountValue = purchase_account !== undefined ? purchase_account : null;
    const purchaseDescriptionValue = purchase_description !== undefined ? purchase_description : null;

    if (isNaN(stockQuantity) || stockQuantity < 0) {
      return res.status(400).json({ error: 'Quantity must be a valid positive number' });
    }

    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return res.status(400).json({ error: 'Price must be a valid positive number' });
    }

    await db.query(`
      UPDATE items 
      SET name = $1, sku = $2, unit = $3, stock_quantity = $4, reorder_point = $5,
          selling_price = $6, purchase_cost = $7, can_be_wholesale = $8, image_url = $9, 
          group_id = $10, manufacturer = $11, brand = $12, description = $13, upc = $14,
          ean = $15, isbn = $16, dimensions = $17, tax_rate = $18, account = $19,
          type = $20, weight = $21, purchase_account = $22, purchase_description = $23, updated_at = CURRENT_TIMESTAMP
      WHERE id = $24
    `, [name.trim(), sku || null, unitValue, stockQuantity, reorderPointValue, sellingPrice, purchaseCost, can_be_wholesale || false, image_url || null, groupIdValue, manufacturerValue, brandValue, descriptionValue, upcValue, eanValue, isbnValue, dimensionsValue, taxRateValue, accountValue, typeValue, weightValue, purchaseAccountValue, purchaseDescriptionValue, req.params.id]);

    const result = await db.query(`
      SELECT i.*, ig.name as group_name,
             COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
             COALESCE(i.brand, ig.brand) as brand
      FROM items i 
      LEFT JOIN item_groups ig ON i.group_id = ig.id 
      WHERE i.id = $1
    `, [req.params.id]);

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

// Get all transactions for a specific item (sales, purchases, adjustments)
router.get('/:id/transactions', async (req, res) => {
  try {
    const db = database.getDb();
    const itemId = req.params.id;

    // Get sales transactions for this item
    const salesResult = await db.query(`
      SELECT 
        'sales' as type,
        s.date,
        s.receipt_number as reference,
        s.customer_name as party_name,
        si.quantity,
        si.unit_price as price,
        si.total_price as total,
        s.status
      FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE si.item_id = $1
      ORDER BY s.date DESC
    `, [itemId]);

    // Get purchase transactions for this item
    const purchasesResult = await db.query(`
      SELECT 
        'purchases' as type,
        p.date,
        COALESCE(p.invoice_number, p.po_number, 'PO-' || LPAD(p.id::text, 5, '0')) as reference,
        COALESCE(p.supplier_name, 'Unknown Supplier') as party_name,
        pi.quantity,
        pi.unit_price as price,
        pi.total_price as total,
        p.status
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE pi.item_id = $1
      ORDER BY p.date DESC
    `, [itemId]);

    // Get inventory adjustment transactions for this item
    const adjustmentsResult = await db.query(`
      SELECT 
        'adjustments' as type,
        t.date,
        t.reference,
        '-' as party_name,
        t.quantity,
        0 as price,
        0 as total,
        'adjusted' as status
      FROM inventory_transactions t
      WHERE t.item_id = $1 AND t.type = 'ADJUSTMENT'
      ORDER BY t.date DESC
    `, [itemId]);

    // Combine all transactions
    const allTransactions = [
      ...salesResult.rows,
      ...purchasesResult.rows,
      ...adjustmentsResult.rows
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(allTransactions);
  } catch (error) {
    console.error('Error fetching item transactions:', error);
    res.status(500).json({ error: 'Failed to fetch item transactions' });
  }
});

module.exports = router;
