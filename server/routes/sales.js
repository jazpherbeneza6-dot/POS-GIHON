const express = require('express');
const router = express.Router();
const database = require('../database');

// Create sale
router.post('/', async (req, res) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      items,
      payment_method,
      status,
      notes,
      total_amount,
      subtotal,
      discount_amount,
      tax_amount
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const db = database.getDb();

    // Verify items and check stock availability
    for (const item of items) {
      if (!item.item_id || !item.quantity || !item.unit_price) {
        return res.status(400).json({ error: 'Each item must have item_id, quantity, and unit_price' });
      }

      const stockResult = await db.query('SELECT stock_quantity FROM items WHERE id = $1', [item.item_id]);
      if (stockResult.rows.length === 0) {
        return res.status(400).json({ error: `Item with ID ${item.item_id} not found` });
      }
      if (stockResult.rows[0].stock_quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for item ID ${item.item_id}` });
      }
    }

    // Generate receipt number
    const receiptNumber = 'REC-' + Date.now().toString().slice(-8);

    // Start transaction
    let saleId;
    await database.transaction(async (client) => {
      // Create sale record with status and financial details
      // Note: total_amount is used from body.
      const finalTotal = total_amount !== undefined ? total_amount : 0; // calculatedSum would require logic duplication here

      const saleResult = await client.query(`
        INSERT INTO sales (
          customer_name, 
          customer_email, 
          customer_phone, 
          customer_address, 
          total_amount, 
          subtotal, 
          discount_amount, 
          tax_amount, 
          receipt_number, 
          payment_method, 
          status, 
          notes, 
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        customer_name || null,
        customer_email || null,
        customer_phone || null,
        customer_address || null,
        finalTotal,
        subtotal || 0,
        discount_amount || 0,
        tax_amount || 0,
        receiptNumber,
        payment_method || 'cash',
        status || 'completed',
        notes || null
      ]);

      saleId = saleResult.rows[0].id;

      // Create sale items and update inventory
      for (const item of items) {
        const totalPrice = item.quantity * item.unit_price;

        // Insert sale item
        await client.query(`
          INSERT INTO sales_items (sale_id, item_id, quantity, unit_price, total_price)
          VALUES ($1, $2, $3, $4, $5)
        `, [saleId, item.item_id, item.quantity, item.unit_price, totalPrice]);

        // Update stock (stock out)
        await client.query(`
          UPDATE items 
          SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [item.quantity, item.item_id]);

        // Record inventory transaction
        await client.query(`
          INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
          VALUES ($1, 'OUT', $2, $3, $4)
        `, [item.item_id, item.quantity, receiptNumber, `Sale: ${receiptNumber}`]);
      }
    });

    const saleResult = await db.query(`
      SELECT s.*, 
             STRING_AGG(i.name || ' (' || si.quantity || 'x' || si.unit_price || ')', ', ') as items_summary
      FROM sales s
      LEFT JOIN sales_items si ON s.id = si.sale_id
      LEFT JOIN items i ON si.item_id = i.id
      WHERE s.id = $1
      GROUP BY s.id
    `, [saleId]);

    res.status(201).json(saleResult.rows[0]);
  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(500).json({ error: error.message || 'Failed to create sale' });
  }
});

// Get all sales
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const db = database.getDb();

    if (!db) {
      console.error('Database connection not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const result = await db.query(`
      SELECT s.*, 
             COUNT(si.id) as item_count,
             STRING_AGG(DISTINCT i.name, ', ') as items_summary
      FROM sales s
      LEFT JOIN sales_items si ON s.id = si.sale_id
      LEFT JOIN items i ON si.item_id = i.id
      GROUP BY s.id
      ORDER BY s.date DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);

    // Ensure we return an array even if result.rows is undefined
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching sales:', error);
    // Return empty array instead of error to prevent frontend from hanging
    res.status(500).json({ error: 'Failed to fetch sales', message: error.message });
  }
});

// Get sale by ID with items
router.get('/:id', async (req, res) => {
  try {
    const db = database.getDb();
    const saleResult = await db.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const itemsResult = await db.query(`
      SELECT si.*, i.name as item_name, i.sku, i.unit
      FROM sales_items si
      JOIN items i ON si.item_id = i.id
      WHERE si.sale_id = $1
    `, [req.params.id]);

    res.json({ ...saleResult.rows[0], items: itemsResult.rows });
  } catch (error) {
    console.error('Error fetching sale:', error);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

// Generate receipt PDF (returns JSON for now, PDF generation in frontend)
router.get('/receipt/:id', async (req, res) => {
  try {
    const db = database.getDb();

    if (!db) {
      console.error('Database connection not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const saleResult = await db.query('SELECT * FROM sales WHERE id = $1', [req.params.id]);

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult.rows[0];

    const itemsResult = await db.query(`
      SELECT si.*, i.name as item_name, i.sku, i.unit
      FROM sales_items si
      LEFT JOIN items i ON si.item_id = i.id
      WHERE si.sale_id = $1
    `, [req.params.id]);

    // Ensure items is always an array
    const items = itemsResult.rows || [];

    res.json({ sale: sale, items: items });
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({ error: 'Failed to generate receipt', message: error.message });
  }
});

// Update sale
router.put('/:id', async (req, res) => {
  try {
    const saleId = req.params.id;
    const { customer_name, payment_method, status, notes } = req.body;
    const db = database.getDb();

    // Get current sale state
    const currentSaleResult = await db.query('SELECT * FROM sales WHERE id = $1', [saleId]);
    if (currentSaleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    const currentSale = currentSaleResult.rows[0];

    // Check if cancelling (and wasn't already cancelled)
    if (status === 'cancelled' && currentSale.status !== 'cancelled') {
      await database.transaction(async (client) => {
        // 1. Get items to restore
        const saleItems = await client.query('SELECT item_id, quantity FROM sales_items WHERE sale_id = $1', [saleId]);

        // 2. Restore stock for each item
        for (const item of saleItems.rows) {
          await client.query(`
            UPDATE items SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
          `, [item.quantity, item.item_id]);

          // 3. Log inventory transaction (Return/IN)
          await client.query(`
            INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
            VALUES ($1, 'IN', $2, $3, $4)
          `, [item.item_id, item.quantity, currentSale.receipt_number || `SALE-${saleId}`, 'Sale Cancelled']);
        }

        // 4. Update sale record
        await client.query(`
          UPDATE sales 
          SET customer_name = COALESCE($1, customer_name),
              payment_method = COALESCE($2, payment_method),
              status = $3,
              notes = COALESCE($4, notes),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
        `, [customer_name, payment_method, status, notes, saleId]);
      });
    } else {
      // Normal update without stock changes
      await db.query(`
        UPDATE sales 
        SET customer_name = COALESCE($1, customer_name),
            payment_method = COALESCE($2, payment_method),
            status = COALESCE($3, status),
            notes = COALESCE($4, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [customer_name, payment_method, status, notes, saleId]);
    }

    const result = await db.query('SELECT * FROM sales WHERE id = $1', [saleId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating sale:', error);
    res.status(500).json({ error: 'Failed to update sale' });
  }
});

// Delete sale
router.delete('/:id', async (req, res) => {
  try {
    const saleId = req.params.id;
    const db = database.getDb();

    // Check status first to avoid double-restocking
    const saleCheck = await db.query('SELECT status, receipt_number FROM sales WHERE id = $1', [saleId]);
    if (saleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    const { status, receipt_number } = saleCheck.rows[0];

    await database.transaction(async (client) => {
      // Restore stock ONLY if pending (undo reservation)
      // If completed, items are sold/gone. If cancelled, items already returned.
      if (status === 'pending') {
        const saleItems = await client.query(`
            SELECT item_id, quantity FROM sales_items WHERE sale_id = $1
          `, [saleId]);

        for (const item of saleItems.rows) {
          await client.query(`
              UPDATE items SET stock_quantity = stock_quantity + $1 WHERE id = $2
            `, [item.quantity, item.item_id]);
        }
      }

      // Delete inventory transactions (cleans up both original sale and cancellation logs if they share reference)
      if (receipt_number) {
        await client.query('DELETE FROM inventory_transactions WHERE reference = $1', [receipt_number]);
      }

      // Delete sale items
      await client.query('DELETE FROM sales_items WHERE sale_id = $1', [saleId]);

      // Delete sale
      await client.query('DELETE FROM sales WHERE id = $1', [saleId]);
    });

    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting sale:', error);
    res.status(500).json({ error: 'Failed to delete sale' });
  }
});

// Get all sales items (for filtering items that have been sold)
router.get('/items-list/all', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT DISTINCT item_id FROM sales_items WHERE item_id IS NOT NULL
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching sales items list:', error);
    res.status(500).json({ error: 'Failed to fetch sales items list' });
  }
});

module.exports = router;
