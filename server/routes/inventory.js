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

// ==================== INVENTORY ADJUSTMENTS ====================

// Create inventory adjustment - Updates stock levels instantly
router.post('/adjustments', async (req, res) => {
  try {
    const {
      reference_number,
      mode = 'quantity',
      reason,
      description,
      account,
      status = 'adjusted',
      items = []
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required for adjustment' });
    }

    const db = database.getDb();
    let adjustmentId;
    let totalQuantityChange = 0;
    let totalValueChange = 0;

    await database.transaction(async (client) => {
      // Generate reference number if not provided
      const finalReferenceNumber = reference_number || `ADJ-${Date.now()}`;

      // Create adjustment record
      const adjustmentResult = await client.query(`
        INSERT INTO inventory_adjustments (reference_number, mode, reason, description, account, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [finalReferenceNumber, mode, reason || null, description || null, account || null, status]);

      adjustmentId = adjustmentResult.rows[0].id;

      // Process each item adjustment
      for (const item of items) {
        const { item_id, quantity_adjusted } = item;

        if (!item_id || quantity_adjusted === undefined || quantity_adjusted === null) {
          throw new Error('Each item must have item_id and quantity_adjusted');
        }

        const quantityChange = parseFloat(quantity_adjusted);

        // Get current item details
        const itemResult = await client.query(
          'SELECT id, name, stock_quantity, purchase_cost FROM items WHERE id = $1',
          [item_id]
        );

        if (itemResult.rows.length === 0) {
          throw new Error(`Item with ID ${item_id} not found`);
        }

        const existingItem = itemResult.rows[0];
        const currentStock = parseFloat(existingItem.stock_quantity) || 0;
        const unitCost = parseFloat(existingItem.purchase_cost) || 0;

        let newQuantity = currentStock;
        let valueChange = 0;

        if (mode === 'value') {
          // Value adjustment: only change the value, NOT stock quantity
          valueChange = quantityChange; // quantityChange here is the value delta
          newQuantity = currentStock; // stock stays the same
        } else {
          // Quantity adjustment: change stock quantity
          newQuantity = currentStock + quantityChange;
          valueChange = quantityChange * unitCost;
        }

        // Only update stock if status is 'adjusted' (not draft)
        if (status === 'adjusted') {
          if (mode === 'quantity') {
            // Only update stock_quantity for quantity mode
            await client.query(`
              UPDATE items 
              SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [newQuantity, item_id]);
          } else {
            // For value mode, just update timestamp (stock stays same)
            await client.query(`
              UPDATE items 
              SET updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [item_id]);
          }

          // Create inventory transaction for audit trail
          await client.query(`
            INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
            VALUES ($1, 'ADJUSTMENT', $2, $3, $4)
          `, [item_id, mode === 'value' ? 0 : quantityChange, finalReferenceNumber, `${mode === 'value' ? 'Value' : 'Quantity'} Adjustment: ${reason || 'N/A'}`]);
        }

        // Create adjustment item record
        await client.query(`
          INSERT INTO inventory_adjustment_items 
          (adjustment_id, item_id, item_name, quantity_on_hand, quantity_adjusted, new_quantity, unit_cost, value_change)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [adjustmentId, item_id, existingItem.name, currentStock, quantityChange, newQuantity, unitCost, valueChange]);

        totalQuantityChange += quantityChange;
        totalValueChange += valueChange;
      }

      // Update adjustment totals
      await client.query(`
        UPDATE inventory_adjustments 
        SET total_quantity_change = $1, total_value_change = $2
        WHERE id = $3
      `, [totalQuantityChange, totalValueChange, adjustmentId]);
    });

    // Fetch the created adjustment with items
    const result = await db.query(`
      SELECT a.*, 
             json_agg(json_build_object(
               'item_id', ai.item_id,
               'item_name', ai.item_name,
               'quantity_on_hand', ai.quantity_on_hand,
               'quantity_adjusted', ai.quantity_adjusted,
               'new_quantity', ai.new_quantity,
               'value_change', ai.value_change
             )) as items
      FROM inventory_adjustments a
      LEFT JOIN inventory_adjustment_items ai ON a.id = ai.adjustment_id
      WHERE a.id = $1
      GROUP BY a.id
    `, [adjustmentId]);

    res.status(201).json({
      message: status === 'adjusted' ? 'Inventory adjustment completed - Stock levels updated' : 'Adjustment saved as draft',
      adjustment: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating inventory adjustment:', error);
    res.status(500).json({ error: error.message || 'Failed to create inventory adjustment' });
  }
});

// Get all inventory adjustments
router.get('/adjustments', async (req, res) => {
  try {
    const { status, reason, start_date, end_date, limit = 100 } = req.query;
    const db = database.getDb();

    let query = `
      SELECT a.*, 
             COUNT(ai.id) as item_count,
             json_agg(json_build_object(
               'item_id', ai.item_id,
               'item_name', ai.item_name,
               'quantity_adjusted', ai.quantity_adjusted
             ) ORDER BY ai.id) FILTER (WHERE ai.id IS NOT NULL) as items
      FROM inventory_adjustments a
      LEFT JOIN inventory_adjustment_items ai ON a.id = ai.adjustment_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    if (reason) {
      query += ` AND a.reason ILIKE $${paramCount}`;
      params.push(`%${reason}%`);
      paramCount++;
    }
    if (start_date) {
      query += ` AND a.adjustment_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }
    if (end_date) {
      query += ` AND a.adjustment_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ` GROUP BY a.id ORDER BY a.adjustment_date DESC LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching adjustments:', error);
    res.status(500).json({ error: 'Failed to fetch adjustments' });
  }
});

// Get single adjustment by ID
router.get('/adjustments/:id', async (req, res) => {
  try {
    const db = database.getDb();

    const adjustmentResult = await db.query(`
      SELECT * FROM inventory_adjustments WHERE id = $1
    `, [req.params.id]);

    if (adjustmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const itemsResult = await db.query(`
      SELECT ai.*, i.sku, i.barcode, i.stock_quantity as current_stock
      FROM inventory_adjustment_items ai
      LEFT JOIN items i ON ai.item_id = i.id
      WHERE ai.adjustment_id = $1
      ORDER BY ai.id
    `, [req.params.id]);

    res.json({
      ...adjustmentResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching adjustment:', error);
    res.status(500).json({ error: 'Failed to fetch adjustment' });
  }
});

// Update an adjustment
router.put('/adjustments/:id', async (req, res) => {
  try {
    const db = database.getDb();
    const { reference_number, mode, reason, description, account, items } = req.body;

    const existing = await db.query('SELECT * FROM inventory_adjustments WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    await database.transaction(async (client) => {
      // Update adjustment header
      await client.query(`
        UPDATE inventory_adjustments 
        SET reference_number = $1, mode = $2, reason = $3, description = $4, account = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [reference_number, mode, reason, description, account, req.params.id]);

      // Only update items if provided and still draft
      if (items && items.length > 0 && existing.rows[0].status === 'draft') {
        // Delete old items
        await client.query('DELETE FROM inventory_adjustment_items WHERE adjustment_id = $1', [req.params.id]);

        // Insert new items
        let totalQtyChange = 0;
        let totalValueChange = 0;

        for (const item of items) {
          const itemData = await client.query('SELECT * FROM items WHERE id = $1', [item.item_id]);
          const itemInfo = itemData.rows[0];
          const unitCost = parseFloat(itemInfo?.purchase_cost || itemInfo?.selling_price || 0);

          await client.query(`
            INSERT INTO inventory_adjustment_items 
            (adjustment_id, item_id, item_name, quantity_on_hand, quantity_adjusted, new_quantity, unit_cost, value_change)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            req.params.id,
            item.item_id,
            itemInfo?.name || 'Unknown',
            parseFloat(itemInfo?.stock_quantity || 0),
            item.quantity_adjusted,
            parseFloat(itemInfo?.stock_quantity || 0) + item.quantity_adjusted,
            unitCost,
            unitCost * item.quantity_adjusted
          ]);

          totalQtyChange += item.quantity_adjusted;
          totalValueChange += unitCost * item.quantity_adjusted;
        }

        await client.query(`
          UPDATE inventory_adjustments 
          SET total_quantity_change = $1, total_value_change = $2 
          WHERE id = $3
        `, [totalQtyChange, totalValueChange, req.params.id]);
      }
    });

    res.json({ message: 'Adjustment updated successfully' });
  } catch (error) {
    console.error('Error updating adjustment:', error);
    res.status(500).json({ error: 'Failed to update adjustment' });
  }
});

// Convert draft to adjusted (apply stock changes)
router.put('/adjustments/:id/convert', async (req, res) => {
  try {
    const db = database.getDb();

    // Check if adjustment exists and is draft
    const adjustmentResult = await db.query(
      'SELECT * FROM inventory_adjustments WHERE id = $1',
      [req.params.id]
    );

    if (adjustmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const adjustment = adjustmentResult.rows[0];
    if (adjustment.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft adjustments can be converted' });
    }

    // Get adjustment items
    const itemsResult = await db.query(
      'SELECT * FROM inventory_adjustment_items WHERE adjustment_id = $1',
      [req.params.id]
    );

    await database.transaction(async (client) => {
      // Apply stock changes for each item
      for (const adjustmentItem of itemsResult.rows) {
        const quantityChange = parseFloat(adjustmentItem.quantity_adjusted);

        if (adjustment.mode === 'quantity') {
          // Quantity mode: update stock quantity
          await client.query(`
            UPDATE items 
            SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [quantityChange, adjustmentItem.item_id]);
        } else {
          // Value mode: do NOT change stock quantity
          await client.query(`
            UPDATE items 
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [adjustmentItem.item_id]);
        }

        // Create audit transaction
        await client.query(`
          INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
          VALUES ($1, 'ADJUSTMENT', $2, $3, $4)
        `, [adjustmentItem.item_id, adjustment.mode === 'value' ? 0 : quantityChange, adjustment.reference_number, `${adjustment.mode === 'value' ? 'Value' : 'Quantity'} Adjustment: ${adjustment.reason || 'N/A'}`]);
      }

      // Update adjustment status
      await client.query(`
        UPDATE inventory_adjustments 
        SET status = 'adjusted', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [req.params.id]);
    });

    res.json({ message: 'Adjustment applied - Stock levels updated' });
  } catch (error) {
    console.error('Error converting adjustment:', error);
    res.status(500).json({ error: 'Failed to convert adjustment' });
  }
});

// Bulk delete adjustments
router.post('/adjustments/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'An array of adjustment IDs is required' });
    }

    const db = database.getDb();

    await database.transaction(async (client) => {
      // Delete adjustment items first (foreign key)
      await client.query(
        'DELETE FROM inventory_adjustment_items WHERE adjustment_id = ANY($1::int[])',
        [ids]
      );
      // Delete adjustments
      await client.query(
        'DELETE FROM inventory_adjustments WHERE id = ANY($1::int[])',
        [ids]
      );
    });

    res.json({ message: `${ids.length} adjustment${ids.length > 1 ? 's' : ''} deleted successfully` });
  } catch (error) {
    console.error('Error bulk deleting adjustments:', error);
    res.status(500).json({ error: 'Failed to delete adjustments' });
  }
});

// Delete adjustment
router.delete('/adjustments/:id', async (req, res) => {
  try {
    const db = database.getDb();

    const adjustmentResult = await db.query(
      'SELECT status FROM inventory_adjustments WHERE id = $1',
      [req.params.id]
    );

    if (adjustmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    await database.transaction(async (client) => {
      await client.query('DELETE FROM inventory_adjustment_items WHERE adjustment_id = $1', [req.params.id]);
      await client.query('DELETE FROM inventory_adjustments WHERE id = $1', [req.params.id]);
    });

    res.json({ message: 'Adjustment deleted successfully' });
  } catch (error) {
    console.error('Error deleting adjustment:', error);
    res.status(500).json({ error: 'Failed to delete adjustment' });
  }
});

// ==================== FIFO COST LOT TRACKING REPORT ====================

// Get FIFO Cost Lot Tracking data
router.get('/fifo-report', async (req, res) => {
  try {
    const { from, to, item_name } = req.query;
    const db = database.getDb();

    // ---- PRODUCT IN: Purchase Receives + Positive Inventory Adjustments ----
    let productIn = [];

    // 1. Purchase Receives
    try {
      let prDateFilter = '';
      const prParams = [];
      let prParamCount = 1;
      if (from && to) {
        prDateFilter = `AND pr.receive_date >= $${prParamCount} AND pr.receive_date <= $${prParamCount + 1}`;
        prParams.push(from, to + 'T23:59:59.999');
        prParamCount += 2;
      }
      let prItemFilter = '';
      if (item_name && item_name !== 'all') {
        prItemFilter = `AND LOWER(COALESCE(i.name, pri.item_name)) = LOWER($${prParamCount})`;
        prParams.push(item_name);
        prParamCount++;
      }

      const prResult = await db.query(`
        SELECT 
          pr.receive_date AS date,
          pr.receive_number AS transaction_ref,
          'Purchase Receive' AS transaction_type,
          COALESCE(pr.vendor_name, 'Unknown Vendor') AS received_from,
          COALESCE(i.name, pri.item_name) AS item_name,
          pri.quantity_received AS quantity,
          COALESCE(pri.rate, i.purchase_cost, 0) AS cost_per_unit,
          (pri.quantity_received * COALESCE(pri.rate, i.purchase_cost, 0)) AS total
        FROM purchase_receive_items pri
        JOIN purchase_receives pr ON pri.purchase_receive_id = pr.id
        LEFT JOIN items i ON pri.item_id = i.id
        WHERE pri.quantity_received > 0 ${prDateFilter} ${prItemFilter}
        ORDER BY pr.receive_date ASC
      `, prParams);
      productIn = productIn.concat(prResult.rows);
    } catch (e) { /* purchase_receive_items may not exist */ }

    // 2. Positive Inventory Adjustments (stock increase)
    try {
      let adjDateFilter = '';
      const adjParams = [];
      let adjParamCount = 1;
      if (from && to) {
        adjDateFilter = `AND a.adjustment_date >= $${adjParamCount} AND a.adjustment_date <= $${adjParamCount + 1}`;
        adjParams.push(from, to + 'T23:59:59.999');
        adjParamCount += 2;
      }
      let adjItemFilter = '';
      if (item_name && item_name !== 'all') {
        adjItemFilter = `AND LOWER(COALESCE(ai.item_name, '')) = LOWER($${adjParamCount})`;
        adjParams.push(item_name);
        adjParamCount++;
      }

      const adjResult = await db.query(`
        SELECT 
          a.adjustment_date AS date,
          a.reference_number AS transaction_ref,
          'Inventory Adjustment' AS transaction_type,
          CASE a.reason
            WHEN 'stolen_goods' THEN 'Stolen Goods'
            WHEN 'stock_on_fire' THEN 'Stock on Fire'
            WHEN 'stocktaking_results' THEN 'Stocktaking Results'
            WHEN 'damaged_goods' THEN 'Damaged Goods'
            WHEN 'inventory_revaluation' THEN 'Inventory Revaluation'
            WHEN 'recount' THEN 'Recount'
            WHEN 'written_off' THEN 'Written Off'
            WHEN 'transfer' THEN 'Transfer'
            WHEN 'stock_received' THEN 'Stock Received'
            WHEN 'opening_stock' THEN 'Opening Stock'
            ELSE COALESCE(a.reason, 'Inventory Adjustment')
          END AS received_from,
          ai.item_name,
          ROUND(ai.quantity_adjusted::numeric, 2)::float AS quantity,
          ROUND(ai.unit_cost::numeric, 2)::float AS cost_per_unit,
          ROUND(ABS(ai.value_change)::numeric, 2)::float AS total
        FROM inventory_adjustment_items ai
        JOIN inventory_adjustments a ON ai.adjustment_id = a.id
        WHERE a.status = 'adjusted' AND ai.quantity_adjusted > 0 ${adjDateFilter} ${adjItemFilter}
        ORDER BY a.adjustment_date ASC
      `, adjParams);
      productIn = productIn.concat(adjResult.rows);
    } catch (e) { /* ignore */ }

    // ---- PRODUCT OUT: Sales + Invoices + Negative Inventory Adjustments ----
    let productOut = [];

    // 1. Sales (POS)
    try {
      let salesDateFilter = '';
      const salesParams = [];
      let salesParamCount = 1;
      if (from && to) {
        salesDateFilter = `AND s.sale_date >= $${salesParamCount} AND s.sale_date <= $${salesParamCount + 1}`;
        salesParams.push(from, to + 'T23:59:59.999');
        salesParamCount += 2;
      }
      let salesItemFilter = '';
      if (item_name && item_name !== 'all') {
        salesItemFilter = `AND LOWER(COALESCE(i.name, si.item_id::text)) = LOWER($${salesParamCount})`;
        salesParams.push(item_name);
        salesParamCount++;
      }

      const salesResult = await db.query(`
        SELECT 
          s.sale_date AS date,
          'Sale #' || s.id AS transaction_ref,
          'Sales' AS transaction_type,
          COALESCE(s.customer_name, 'Walk-in Customer') AS dispersed_to,
          COALESCE(i.name, si.item_id::text) AS item_name,
          si.quantity AS qty_dispersed
        FROM sales_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN items i ON si.item_id = i.id
        WHERE 1=1 ${salesDateFilter} ${salesItemFilter}
        ORDER BY s.sale_date ASC
      `, salesParams);
      productOut = productOut.concat(salesResult.rows);
    } catch (e) { /* ignore */ }

    // 2. Invoice Items
    try {
      let invDateFilter = '';
      const invParams = [];
      let invParamCount = 1;
      if (from && to) {
        invDateFilter = `AND inv.invoice_date >= $${invParamCount} AND inv.invoice_date <= $${invParamCount + 1}`;
        invParams.push(from, to + 'T23:59:59.999');
        invParamCount += 2;
      }
      let invItemFilter = '';
      if (item_name && item_name !== 'all') {
        invItemFilter = `AND LOWER(COALESCE(i.name, ii.item_name)) = LOWER($${invParamCount})`;
        invParams.push(item_name);
        invParamCount++;
      }

      const invResult = await db.query(`
        SELECT 
          inv.invoice_date AS date,
          inv.invoice_number AS transaction_ref,
          'Invoice' AS transaction_type,
          COALESCE(inv.customer_name, 'Walk-in Customer') AS dispersed_to,
          COALESCE(i.name, ii.item_name) AS item_name,
          ii.quantity AS qty_dispersed
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id
        LEFT JOIN items i ON LOWER(i.name) = LOWER(ii.item_name)
        WHERE inv.status NOT IN ('DRAFT', 'VOID', 'Void', 'draft') ${invDateFilter} ${invItemFilter}
        ORDER BY inv.invoice_date ASC
      `, invParams);
      productOut = productOut.concat(invResult.rows);
    } catch (e) { /* ignore */ }

    // 3. Sales Receipt Items
    try {
      let srDateFilter = '';
      const srParams = [];
      let srParamCount = 1;
      if (from && to) {
        srDateFilter = `AND sr.receipt_date >= $${srParamCount} AND sr.receipt_date <= $${srParamCount + 1}`;
        srParams.push(from, to + 'T23:59:59.999');
        srParamCount += 2;
      }
      let srItemFilter = '';
      if (item_name && item_name !== 'all') {
        srItemFilter = `AND LOWER(COALESCE(i.name, sri.item_name)) = LOWER($${srParamCount})`;
        srParams.push(item_name);
        srParamCount++;
      }

      const srResult = await db.query(`
        SELECT 
          sr.receipt_date AS date,
          sr.receipt_number AS transaction_ref,
          'Sales Receipt' AS transaction_type,
          COALESCE(sr.customer_name, 'Walk-in Customer') AS dispersed_to,
          COALESCE(i.name, sri.item_name) AS item_name,
          sri.quantity AS qty_dispersed
        FROM sales_receipt_items sri
        JOIN sales_receipts sr ON sri.sales_receipt_id = sr.id
        LEFT JOIN items i ON sri.item_id = i.id
        WHERE 1=1 ${srDateFilter} ${srItemFilter}
        ORDER BY sr.receipt_date ASC
      `, srParams);
      productOut = productOut.concat(srResult.rows);
    } catch (e) { /* ignore */ }

    // 4. Negative Inventory Adjustments (stock decrease)
    try {
      let adjOutDateFilter = '';
      const adjOutParams = [];
      let adjOutParamCount = 1;
      if (from && to) {
        adjOutDateFilter = `AND a.adjustment_date >= $${adjOutParamCount} AND a.adjustment_date <= $${adjOutParamCount + 1}`;
        adjOutParams.push(from, to + 'T23:59:59.999');
        adjOutParamCount += 2;
      }
      let adjOutItemFilter = '';
      if (item_name && item_name !== 'all') {
        adjOutItemFilter = `AND LOWER(COALESCE(ai.item_name, '')) = LOWER($${adjOutParamCount})`;
        adjOutParams.push(item_name);
        adjOutParamCount++;
      }

      const adjOutResult = await db.query(`
        SELECT 
          a.adjustment_date AS date,
          a.reference_number AS transaction_ref,
          'Inventory Adjustment' AS transaction_type,
          CASE a.reason
            WHEN 'stolen_goods' THEN 'Stolen Goods'
            WHEN 'stock_on_fire' THEN 'Stock on Fire'
            WHEN 'stocktaking_results' THEN 'Stocktaking Results'
            WHEN 'damaged_goods' THEN 'Damaged Goods'
            WHEN 'inventory_revaluation' THEN 'Inventory Revaluation'
            WHEN 'recount' THEN 'Recount'
            WHEN 'written_off' THEN 'Written Off'
            WHEN 'transfer' THEN 'Transfer'
            WHEN 'stock_received' THEN 'Stock Received'
            WHEN 'opening_stock' THEN 'Opening Stock'
            ELSE COALESCE(a.reason, 'Inventory Adjustment')
          END AS dispersed_to,
          ai.item_name,
          ROUND(ABS(ai.quantity_adjusted)::numeric, 2)::float AS qty_dispersed
        FROM inventory_adjustment_items ai
        JOIN inventory_adjustments a ON ai.adjustment_id = a.id
        WHERE a.status = 'adjusted' AND ai.quantity_adjusted < 0 ${adjOutDateFilter} ${adjOutItemFilter}
        ORDER BY a.adjustment_date ASC
      `, adjOutParams);
      productOut = productOut.concat(adjOutResult.rows);
    } catch (e) { /* ignore */ }

    // Sort by date
    productIn.sort((a, b) => new Date(a.date) - new Date(b.date));
    productOut.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Get list of items for filter dropdown
    let items = [];
    try {
      const itemsResult = await db.query('SELECT name FROM items ORDER BY name');
      items = itemsResult.rows.map(r => r.name);
    } catch (e) { /* ignore */ }

    res.json({ product_in: productIn, product_out: productOut, items });
  } catch (error) {
    console.error('Error generating FIFO report:', error);
    res.status(500).json({ error: 'Failed to generate FIFO report' });
  }
});

// ==================== STOCK SUMMARY REPORT ====================

// Stock Summary report
router.get('/reports/stock-summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    // Get all items
    const itemsResult = await db.query(`
      SELECT id, name, sku, stock_quantity
      FROM items
      ORDER BY name ASC
    `);

    const reportData = [];

    for (const item of itemsResult.rows) {
      const currentStock = parseFloat(item.stock_quantity) || 0;

      // Get Quantity In during the period (type IN + positive ADJUSTMENT)
      let qtyIn = 0;
      try {
        let inQuery = `
          SELECT COALESCE(SUM(quantity), 0) AS total
          FROM inventory_transactions
          WHERE item_id = $1 AND ((type = 'IN') OR (type = 'ADJUSTMENT' AND quantity > 0))
        `;
        const inParams = [item.id];
        if (from && to) {
          inQuery += ` AND date >= $2 AND date <= $3`;
          inParams.push(from, to + 'T23:59:59');
        }
        const inResult = await db.query(inQuery, inParams);
        qtyIn = parseFloat(inResult.rows[0].total) || 0;
      } catch (e) { /* ignore */ }

      // Get Quantity Out during the period - only from CONFIRMED invoices
      let qtyOut = 0;
      try {
        let outQuery = `
          SELECT COALESCE(SUM(ii.quantity), 0) AS total
          FROM invoice_items ii
          JOIN invoices inv ON ii.invoice_id = inv.id
          WHERE ii.item_id = $1
            AND UPPER(inv.status) = 'CONFIRMED'
        `;
        const outParams = [item.id];
        if (from && to) {
          outQuery += ` AND inv.invoice_date >= $2 AND inv.invoice_date <= $3`;
          outParams.push(from, to);
        }
        const outResult = await db.query(outQuery, outParams);
        qtyOut = parseFloat(outResult.rows[0].total) || 0;
      } catch (e) {
        // Fallback: try matching by item_name
        try {
          let outQuery2 = `
            SELECT COALESCE(SUM(ii.quantity), 0) AS total
            FROM invoice_items ii
            JOIN invoices inv ON ii.invoice_id = inv.id
            WHERE ii.item_name = $1
              AND UPPER(inv.status) = 'CONFIRMED'
          `;
          const outParams2 = [item.name];
          if (from && to) {
            outQuery2 += ` AND inv.invoice_date >= $2 AND inv.invoice_date <= $3`;
            outParams2.push(from, to);
          }
          const outResult2 = await db.query(outQuery2, outParams2);
          qtyOut = parseFloat(outResult2.rows[0].total) || 0;
        } catch (e2) { /* ignore */ }
      }

      // Opening Stock = Current Stock - Qty In + Qty Out (reverse the period's changes)
      const openingStock = currentStock - qtyIn + qtyOut;
      // Closing Stock = Opening Stock + Qty In - Qty Out = current stock
      const closingStock = openingStock + qtyIn - qtyOut;

      reportData.push({
        item_name: item.name,
        sku: item.sku || '',
        opening_stock: openingStock,
        quantity_in: qtyIn,
        quantity_out: qtyOut,
        closing_stock: closingStock
      });
    }

    res.json(reportData);
  } catch (error) {
    console.error('Error generating stock summary report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== INVENTORY ADJUSTMENT SUMMARY REPORT ====================

// Inventory Adjustment Summary report
router.get('/reports/inventory-adjustment-summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    const params = [];
    let paramCount = 1;

    if (from && to) {
      dateFilter = `WHERE a.adjustment_date >= $${paramCount} AND a.adjustment_date <= $${paramCount + 1}`;
      params.push(from, to + 'T23:59:59');
      paramCount += 2;
    }

    const result = await db.query(`
      SELECT 
        a.reference_number,
        a.adjustment_date,
        a.status,
        a.reason,
        a.mode AS adjustment_type,
        COALESCE(SUM(CASE WHEN ai.quantity_adjusted > 0 THEN ai.quantity_adjusted ELSE 0 END), 0) AS quantity_increased,
        COALESCE(SUM(CASE WHEN ai.quantity_adjusted < 0 THEN ABS(ai.quantity_adjusted) ELSE 0 END), 0) AS quantity_decreased,
        COALESCE(SUM(CASE WHEN ai.value_change > 0 THEN ai.value_change ELSE 0 END), 0) AS value_increased,
        COALESCE(SUM(CASE WHEN ai.value_change < 0 THEN ABS(ai.value_change) ELSE 0 END), 0) AS value_decreased
      FROM inventory_adjustments a
      LEFT JOIN inventory_adjustment_items ai ON ai.adjustment_id = a.id
      ${dateFilter}
      GROUP BY a.id, a.reference_number, a.adjustment_date, a.status, a.reason, a.mode
      ORDER BY a.adjustment_date ASC
    `, params);

    const rows = result.rows.map(row => ({
      reference_number: row.reference_number || '',
      date: row.adjustment_date,
      status: row.status || 'draft',
      reason: row.reason || '',
      adjustment_type: row.adjustment_type === 'quantity' ? 'Quantity' : 'Value',
      quantity_increased: parseFloat(row.quantity_increased) || 0,
      quantity_decreased: parseFloat(row.quantity_decreased) || 0,
      value_increased: parseFloat(row.value_increased) || 0,
      value_decreased: parseFloat(row.value_decreased) || 0
    }));

    res.json(rows);
  } catch (error) {
    console.error('Error generating inventory adjustment summary report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== INVENTORY ADJUSTMENT DETAILS REPORT ====================

// Inventory Adjustment Details report (line-item level)
router.get('/reports/inventory-adjustment-details', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    const params = [];
    let paramCount = 1;

    if (from && to) {
      dateFilter = `WHERE a.adjustment_date >= $${paramCount} AND a.adjustment_date <= $${paramCount + 1}`;
      params.push(from, to + 'T23:59:59');
      paramCount += 2;
    }

    const result = await db.query(`
      SELECT 
        a.reference_number,
        a.adjustment_date,
        a.status,
        a.reason,
        a.mode AS adjustment_type,
        ai.item_name AS product_name,
        ai.quantity_adjusted,
        ai.value_change
      FROM inventory_adjustment_items ai
      JOIN inventory_adjustments a ON ai.adjustment_id = a.id
      ${dateFilter}
      ORDER BY a.adjustment_date ASC, a.id ASC
    `, params);

    const rows = result.rows.map(row => ({
      reference_number: row.reference_number || '',
      date: row.adjustment_date,
      status: row.status || 'draft',
      reason: row.reason || '',
      adjustment_type: row.adjustment_type === 'quantity' ? 'Quantity' : 'Value',
      product_name: row.product_name || '',
      quantity_adjusted: row.adjustment_type === 'quantity' ? (parseFloat(row.quantity_adjusted) || 0) : null,
      value_adjusted: row.adjustment_type === 'value' ? (parseFloat(row.value_change) || 0) : null
    }));

    res.json(rows);
  } catch (error) {
    console.error('Error generating inventory adjustment details report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== PACKING HISTORY REPORT ====================

// Packing History report
router.get('/reports/packing-history', async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const db = database.getDb();

    let conditions = [];
    const params = [];
    let paramCount = 1;

    if (from && to) {
      conditions.push(`p.package_date >= $${paramCount} AND p.package_date <= $${paramCount + 1}`);
      params.push(from, to);
      paramCount += 2;
    }

    if (status && status !== 'all' && status !== 'All') {
      conditions.push(`UPPER(p.status) = UPPER($${paramCount})`);
      params.push(status);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await db.query(`
      SELECT 
        p.id,
        p.package_date,
        p.package_number,
        p.sales_order_number,
        p.status,
        s.tracking_number,
        COALESCE(SUM(CASE WHEN pi.packed_quantity > 0 THEN pi.packed_quantity ELSE COALESCE(pi.ordered_quantity, pi.quantity_to_pack, 0) END), 0) AS quantity
      FROM packages p
      LEFT JOIN shipments s ON s.package_id = p.id
      LEFT JOIN package_items pi ON pi.package_id = p.id
      ${whereClause}
      GROUP BY p.id, p.package_date, p.package_number, p.sales_order_number, p.status, s.tracking_number
      ORDER BY p.package_date ASC, p.id ASC
    `, params);

    // Determine effective status: if shipment exists and is delivered, override
    const rows = result.rows.map(row => {
      let effectiveStatus = row.status || 'Not Shipped';
      // Normalize status display
      const upper = effectiveStatus.toUpperCase();
      if (upper === 'NOT SHIPPED' || upper === 'NOT_SHIPPED') {
        effectiveStatus = 'Not Shipped';
      } else if (upper === 'SHIPPED') {
        effectiveStatus = 'Shipped';
      } else if (upper === 'DELIVERED') {
        effectiveStatus = 'Delivered';
      }

      return {
        date: row.package_date,
        package_number: row.package_number || '',
        sales_order_number: row.sales_order_number || '',
        status: effectiveStatus,
        tracking_number: row.tracking_number || '',
        quantity: parseFloat(row.quantity) || 0
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Error generating packing history report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== INVENTORY TURNOVER BY QUANTITY REPORT ====================

// Inventory Turnover By Quantity report
router.get('/reports/inventory-turnover-quantity', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    // Get all items
    const itemsResult = await db.query(`SELECT id, name, stock_quantity FROM items ORDER BY name ASC`);

    // Calculate days in the period
    let daysInPeriod = 30; // default
    if (from && to) {
      const d1 = new Date(from);
      const d2 = new Date(to);
      daysInPeriod = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
    }

    const rows = [];

    for (const item of itemsResult.rows) {
      const currentStock = parseFloat(item.stock_quantity) || 0;

      // Get Quantity In during the period
      let qtyIn = 0;
      try {
        let inQuery = `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_transactions WHERE item_id = $1 AND ((type = 'IN') OR (type = 'ADJUSTMENT' AND quantity > 0))`;
        const inParams = [item.id];
        if (from && to) {
          inQuery += ` AND date >= $2 AND date <= $3`;
          inParams.push(from, to + 'T23:59:59');
        }
        const inResult = await db.query(inQuery, inParams);
        qtyIn = parseFloat(inResult.rows[0].total) || 0;
      } catch (e) { /* ignore */ }

      // Get Quantity Out during the period
      let qtyOut = 0;
      try {
        let outQuery = `SELECT COALESCE(SUM(ABS(quantity)), 0) AS total FROM inventory_transactions WHERE item_id = $1 AND ((type = 'OUT') OR (type = 'ADJUSTMENT' AND quantity < 0))`;
        const outParams = [item.id];
        if (from && to) {
          outQuery += ` AND date >= $2 AND date <= $3`;
          outParams.push(from, to + 'T23:59:59');
        }
        const outResult = await db.query(outQuery, outParams);
        qtyOut = parseFloat(outResult.rows[0].total) || 0;
      } catch (e) { /* ignore */ }

      // Opening Stock = Current Stock - Qty In + Qty Out
      const openingStock = currentStock - qtyIn + qtyOut;
      // Closing Stock = current stock
      const closingStock = currentStock;

      // Get Quantity Sold during the period (from sales_items)
      let qtySold = 0;
      try {
        let soldQuery = `
          SELECT COALESCE(SUM(si.quantity), 0) AS total
          FROM sales_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE si.item_id = $1
        `;
        const soldParams = [item.id];
        if (from && to) {
          soldQuery += ` AND s.date >= $2 AND s.date <= $3`;
          soldParams.push(from, to + 'T23:59:59');
        }
        const soldResult = await db.query(soldQuery, soldParams);
        qtySold = parseFloat(soldResult.rows[0].total) || 0;
      } catch (e) {
        // Try matching by item_name if item_id doesn't work
        try {
          let soldQuery2 = `
            SELECT COALESCE(SUM(si.quantity), 0) AS total
            FROM sales_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE si.item_name = $1
          `;
          const soldParams2 = [item.name];
          if (from && to) {
            soldQuery2 += ` AND s.date >= $2 AND s.date <= $3`;
            soldParams2.push(from, to + 'T23:59:59');
          }
          const soldResult2 = await db.query(soldQuery2, soldParams2);
          qtySold = parseFloat(soldResult2.rows[0].total) || 0;
        } catch (e2) { /* ignore */ }
      }

      // Average Quantity = (Opening + Closing) / 2
      const avgQty = (openingStock + closingStock) / 2;

      // Turnover Ratio = Quantity Sold / Average Quantity
      const turnoverRatio = avgQty > 0 ? qtySold / avgQty : 0;

      // Average Turnover Days = Days in period / Turnover Ratio
      const avgTurnoverDays = turnoverRatio > 0 ? Math.round(daysInPeriod / turnoverRatio) : 0;

      rows.push({
        item_name: item.name,
        opening_stock: openingStock,
        closing_stock: closingStock,
        quantity_sold: qtySold,
        average_quantity: avgQty,
        turnover_ratio: Math.round(turnoverRatio * 100) / 100,
        average_turnover_days: avgTurnoverDays
      });
    }

    res.json(rows);
  } catch (error) {
    console.error('Error generating inventory turnover by quantity report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== INVENTORY VALUATION SUMMARY REPORT ====================

// Inventory Valuation Summary report
router.get('/reports/inventory-valuation-summary', async (req, res) => {
  try {
    const { stock_filter } = req.query;
    const db = database.getDb();

    let query = `
      SELECT 
        name,
        sku,
        unit,
        stock_quantity,
        purchase_cost,
        (stock_quantity * purchase_cost) AS asset_value
      FROM items
      ORDER BY name ASC
    `;

    const result = await db.query(query);

    let rows = result.rows.map(row => ({
      item_name: row.name,
      sku: row.sku || '',
      unit: row.unit || 'pcs',
      stock_on_hand: parseFloat(row.stock_quantity) || 0,
      asset_value: parseFloat(row.asset_value) || 0
    }));

    // Apply stock availability filter
    if (stock_filter === 'in_stock') {
      rows = rows.filter(r => r.stock_on_hand > 0);
    } else if (stock_filter === 'out_of_stock') {
      rows = rows.filter(r => r.stock_on_hand <= 0);
    }

    res.json(rows);
  } catch (error) {
    console.error('Error generating inventory valuation summary report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== INVENTORY TURNOVER BY AMOUNT REPORT ====================

// Inventory Turnover By Amount report
router.get('/reports/inventory-turnover-amount', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    // Get all items
    const itemsResult = await db.query(`SELECT id, name, sku, stock_quantity, purchase_cost FROM items ORDER BY name ASC`);

    // Calculate days in the period
    let daysInPeriod = 30;
    if (from && to) {
      const d1 = new Date(from);
      const d2 = new Date(to);
      daysInPeriod = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
    }

    const rows = [];

    for (const item of itemsResult.rows) {
      const currentStock = parseFloat(item.stock_quantity) || 0;
      const cost = parseFloat(item.purchase_cost) || 0;

      // Get Quantity In during the period
      let qtyIn = 0;
      try {
        let inQuery = `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_transactions WHERE item_id = $1 AND ((type = 'IN') OR (type = 'ADJUSTMENT' AND quantity > 0))`;
        const inParams = [item.id];
        if (from && to) {
          inQuery += ` AND date >= $2 AND date <= $3`;
          inParams.push(from, to + 'T23:59:59');
        }
        const inResult = await db.query(inQuery, inParams);
        qtyIn = parseFloat(inResult.rows[0].total) || 0;
      } catch (e) { /* ignore */ }

      // Get Quantity Out during the period
      let qtyOut = 0;
      try {
        let outQuery = `SELECT COALESCE(SUM(ABS(quantity)), 0) AS total FROM inventory_transactions WHERE item_id = $1 AND ((type = 'OUT') OR (type = 'ADJUSTMENT' AND quantity < 0))`;
        const outParams = [item.id];
        if (from && to) {
          outQuery += ` AND date >= $2 AND date <= $3`;
          outParams.push(from, to + 'T23:59:59');
        }
        const outResult = await db.query(outQuery, outParams);
        qtyOut = parseFloat(outResult.rows[0].total) || 0;
      } catch (e) { /* ignore */ }

      const openingStock = currentStock - qtyIn + qtyOut;
      const closingStock = currentStock;

      // Get Quantity Sold during the period
      let qtySold = 0;
      try {
        let soldQuery = `
          SELECT COALESCE(SUM(si.quantity), 0) AS total
          FROM sales_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE si.item_id = $1
        `;
        const soldParams = [item.id];
        if (from && to) {
          soldQuery += ` AND s.date >= $2 AND s.date <= $3`;
          soldParams.push(from, to + 'T23:59:59');
        }
        const soldResult = await db.query(soldQuery, soldParams);
        qtySold = parseFloat(soldResult.rows[0].total) || 0;
      } catch (e) {
        try {
          let soldQuery2 = `
            SELECT COALESCE(SUM(si.quantity), 0) AS total
            FROM sales_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE si.item_name = $1
          `;
          const soldParams2 = [item.name];
          if (from && to) {
            soldQuery2 += ` AND s.date >= $2 AND s.date <= $3`;
            soldParams2.push(from, to + 'T23:59:59');
          }
          const soldResult2 = await db.query(soldQuery2, soldParams2);
          qtySold = parseFloat(soldResult2.rows[0].total) || 0;
        } catch (e2) { /* ignore */ }
      }

      // Convert to monetary values
      const openingBalance = openingStock * cost;
      const closingBalance = closingStock * cost;
      const cogs = qtySold * cost;

      // Average Price = (Opening Balance + Closing Balance) / 2
      const avgPrice = (openingBalance + closingBalance) / 2;

      // Turnover Ratio = COGS / Average Price
      const turnoverRatio = avgPrice > 0 ? cogs / avgPrice : 0;

      // Average Turnover Days = Days in period / Turnover Ratio
      const avgTurnoverDays = turnoverRatio > 0 ? Math.round(daysInPeriod / turnoverRatio) : 0;

      rows.push({
        item_name: item.name,
        sku: item.sku || '',
        opening_balance: Math.round(openingBalance * 100) / 100,
        closing_balance: Math.round(closingBalance * 100) / 100,
        cogs: Math.round(cogs * 100) / 100,
        average_price: Math.round(avgPrice * 100) / 100,
        turnover_ratio: Math.round(turnoverRatio * 100) / 100,
        average_turnover_days: avgTurnoverDays
      });
    }

    res.json(rows);
  } catch (error) {
    console.error('Error generating inventory turnover by amount report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== INVENTORY AGING SUMMARY REPORT ====================

// Inventory Aging Summary report (FIFO method)
router.get('/reports/inventory-aging-summary', async (req, res) => {
  try {
    const db = database.getDb();

    // 1. Get all items with their current stock and purchase cost
    const itemsResult = await db.query(`
      SELECT id, name, stock_quantity, purchase_cost, unit
      FROM items
      ORDER BY name ASC
    `);

    const items = itemsResult.rows;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const reportData = [];

    for (const item of items) {
      const currentStock = parseFloat(item.stock_quantity) || 0;
      if (currentStock <= 0) continue; // Skip items with no stock

      const unitCost = parseFloat(item.purchase_cost) || 0;

      // 2. Get all incoming stock lots for this item, sorted by date DESC (most recent first = FIFO)
      let incomingLots = [];

      // From inventory_transactions (type IN or positive ADJUSTMENT)
      try {
        const txResult = await db.query(`
          SELECT date AS lot_date, quantity
          FROM inventory_transactions
          WHERE item_id = $1 AND ((type = 'IN') OR (type = 'ADJUSTMENT' AND quantity > 0))
          ORDER BY date DESC
        `, [item.id]);
        incomingLots = incomingLots.concat(txResult.rows.map(r => ({
          date: new Date(r.lot_date),
          quantity: parseFloat(r.quantity) || 0
        })));
      } catch (e) { /* ignore */ }

      // From purchase_receive_items
      try {
        const prResult = await db.query(`
          SELECT pr.receive_date AS lot_date, pri.quantity_to_receive AS quantity
          FROM purchase_receive_items pri
          JOIN purchase_receives pr ON pri.receive_id = pr.id
          WHERE pri.item_id = $1
          ORDER BY pr.receive_date DESC
        `, [item.id]);
        incomingLots = incomingLots.concat(prResult.rows.map(r => ({
          date: new Date(r.lot_date),
          quantity: parseFloat(r.quantity) || 0
        })));
      } catch (e) { /* ignore */ }

      // Sort all lots by date DESC (most recent first for FIFO)
      incomingLots.sort((a, b) => b.date - a.date);

      // 3. Allocate current stock to lots using FIFO (most recent first)
      let remaining = currentStock;
      const allocatedLots = [];

      for (const lot of incomingLots) {
        if (remaining <= 0) break;
        const allocated = Math.min(remaining, lot.quantity);
        if (allocated > 0) {
          allocatedLots.push({
            date: lot.date,
            quantity: allocated
          });
          remaining -= allocated;
        }
      }

      // If there's still remaining stock not matched to any lot, assign it to today
      if (remaining > 0) {
        allocatedLots.push({
          date: today,
          quantity: remaining
        });
      }

      // 4. Bucket allocated lots into aging intervals
      const buckets = {
        d1_3: { qty: 0, value: 0 },
        d4_6: { qty: 0, value: 0 },
        d7_9: { qty: 0, value: 0 },
        d10_12: { qty: 0, value: 0 },
        d13_15: { qty: 0, value: 0 },
        d15plus: { qty: 0, value: 0 }
      };

      for (const lot of allocatedLots) {
        const lotDate = new Date(lot.date);
        lotDate.setHours(0, 0, 0, 0);
        const ageDays = Math.floor((today - lotDate) / (1000 * 60 * 60 * 24));

        let bucket;
        if (ageDays <= 3) bucket = 'd1_3';
        else if (ageDays <= 6) bucket = 'd4_6';
        else if (ageDays <= 9) bucket = 'd7_9';
        else if (ageDays <= 12) bucket = 'd10_12';
        else if (ageDays <= 15) bucket = 'd13_15';
        else bucket = 'd15plus';

        buckets[bucket].qty += lot.quantity;
        buckets[bucket].value += lot.quantity * unitCost;
      }

      reportData.push({
        item_name: item.name,
        ...buckets
      });
    }

    res.json(reportData);
  } catch (error) {
    console.error('Error generating inventory aging summary report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== COMMITTED STOCK DETAILS REPORT ====================

// Committed Stock Details report
router.get('/reports/committed-stock-details', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    const params = [];
    let paramCount = 1;

    if (from && to) {
      dateFilter = `AND so.order_date >= $${paramCount} AND so.order_date <= $${paramCount + 1}`;
      params.push(from, to);
      paramCount += 2;
    }

    const result = await db.query(`
      SELECT 
        so.order_number AS transaction_number,
        soi.item_name,
        COALESCE(soi.quantity, 0) AS committed_stock
      FROM sales_order_items soi
      JOIN sales_orders so ON soi.sales_order_id = so.id
      WHERE so.status IN ('CONFIRMED', 'OPEN') ${dateFilter}
      ORDER BY so.order_number ASC
    `, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error generating committed stock details report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== INVENTORY SUMMARY REPORT ====================

// Inventory Summary report
router.get('/reports/inventory-summary', async (req, res) => {
  try {
    const db = database.getDb();

    // Main query without shipment_items (which may not exist)
    const result = await db.query(`
      SELECT 
        it.id,
        it.name AS item_name,
        it.sku,
        it.reorder_point AS reorder_level,
        COALESCE(it.stock_quantity, 0) AS stock_on_hand,
        it.unit AS usage_unit,

        -- Quantity Ordered: total qty from purchase orders that are still open/ordered
        COALESCE((
          SELECT SUM(pi.quantity)
          FROM purchase_items pi
          JOIN purchases p ON pi.purchase_id = p.id
          WHERE pi.item_id = it.id
            AND p.status IN ('ordered', 'partially_received')
        ), 0) AS quantity_ordered,

        -- Quantity In: total received from purchase receives
        COALESCE((
          SELECT SUM(pri.quantity_to_receive)
          FROM purchase_receive_items pri
          JOIN purchase_receives pr ON pri.receive_id = pr.id
          WHERE pri.item_id = it.id
        ), 0) AS quantity_in,

        -- Quantity Out: total sold from invoices (non-void)
        COALESCE((
          SELECT SUM(ii.quantity)
          FROM invoice_items ii
          JOIN invoices inv ON ii.invoice_id = inv.id
          WHERE LOWER(TRIM(ii.item_name)) = LOWER(TRIM(it.name))
            AND inv.status != 'VOID'
        ), 0) AS quantity_out

      FROM items it
      ORDER BY it.name ASC
    `);

    // Try to get committed stock data (item_id column may not exist in sales_order_items)
    let committedMap = {};
    try {
      const committedResult = await db.query(`
        SELECT soi.item_name, SUM(soi.quantity) AS committed_stock
        FROM sales_order_items soi
        JOIN sales_orders so ON soi.sales_order_id = so.id
        WHERE so.status IN ('CONFIRMED', 'OPEN')
        GROUP BY soi.item_name
      `);
      committedResult.rows.forEach(r => {
        committedMap[r.item_name.trim().toLowerCase()] = parseFloat(r.committed_stock) || 0;
      });
    } catch (e) {
      // sales_order_items may not have expected columns
    }

    // Try to get in-transit data (shipment_items may not exist)
    let inTransitMap = {};
    try {
      const transitResult = await db.query(`
        SELECT si.item_id, SUM(si.quantity) AS in_transit
        FROM shipment_items si
        JOIN shipments sh ON si.shipment_id = sh.id
        WHERE sh.status = 'shipped'
        GROUP BY si.item_id
      `);
      transitResult.rows.forEach(r => {
        inTransitMap[r.item_id] = parseFloat(r.in_transit) || 0;
      });
    } catch (e) {
      // shipment_items table may not exist, default to 0
    }

    const rows = result.rows.map(row => {
      const stockOnHand = parseFloat(row.stock_on_hand) || 0;
      const committed = committedMap[row.item_name.trim().toLowerCase()] || 0;
      const availableForSale = stockOnHand - committed;
      const inTransit = inTransitMap[row.id] || 0;

      return {
        item_name: row.item_name,
        sku: row.sku || '',
        reorder_level: parseFloat(row.reorder_level) || 0,
        quantity_ordered: parseFloat(row.quantity_ordered) || 0,
        quantity_in: parseFloat(row.quantity_in) || 0,
        quantity_out: parseFloat(row.quantity_out) || 0,
        stock_on_hand: stockOnHand,
        committed_stock: committed,
        available_for_sale: availableForSale,
        in_transit: inTransit,
        usage_unit: row.usage_unit || 'pcs'
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Error generating inventory summary report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== PAYMENTS RECEIVED REPORT ====================

// Payments Received report
router.get('/reports/payments-received', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    const params = [];
    let paramCount = 1;

    if (from && to) {
      dateFilter = `WHERE pr.payment_date >= $${paramCount} AND pr.payment_date <= $${paramCount + 1}`;
      params.push(from, to);
      paramCount += 2;
    }

    const result = await db.query(`
      SELECT 
        pr.id,
        pr.payment_number,
        pr.payment_date,
        pr.status,
        pr.reference_number,
        pr.customer_name,
        pr.payment_mode,
        pr.notes,
        pr.invoice_number,
        pr.deposit_to,
        pr.amount_received
      FROM payments_received pr
      ${dateFilter}
      ORDER BY pr.payment_date DESC, pr.id DESC
    `, params);

    const rows = result.rows.map(row => ({
      payment_number: row.payment_number || '',
      date: row.payment_date,
      status: row.status || 'Paid',
      reference_number: row.reference_number || '',
      customer_name: row.customer_name || '',
      payment_mode: row.payment_mode || 'Cash',
      notes: row.notes || '',
      invoice_number: row.invoice_number || '',
      deposit_to: row.deposit_to || 'Petty Cash',
      amount: parseFloat(row.amount_received) || 0,
      unused_amount: 0
    }));

    res.json(rows);
  } catch (error) {
    console.error('Error generating payments received report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ==================== REFUND HISTORY REPORT ====================

// Refund History report
router.get('/reports/refund-history', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    const params = [];
    let paramCount = 1;

    if (from && to) {
      dateFilter = `WHERE sr.return_date >= $${paramCount} AND sr.return_date <= $${paramCount + 1}`;
      params.push(from, to);
      paramCount += 2;
    }

    const result = await db.query(`
      SELECT 
        sr.id,
        sr.rma_number,
        sr.return_date,
        sr.customer_name,
        sr.reason,
        sr.sales_order_number,
        COALESCE(SUM(sri.amount), 0) AS total_amount
      FROM sales_returns sr
      LEFT JOIN sales_return_items sri ON sri.sales_return_id = sr.id
      ${dateFilter}
      GROUP BY sr.id, sr.rma_number, sr.return_date, sr.customer_name, sr.reason, sr.sales_order_number
      ORDER BY sr.return_date ASC, sr.id ASC
    `, params);

    const rows = result.rows.map((row, idx) => ({
      date: row.return_date,
      reference_number: '',
      transaction_number: row.rma_number || '',
      customer_name: row.customer_name || '',
      mode: 'Cash',
      notes: row.reason || '',
      amount_fcy: parseFloat(row.total_amount) || 0,
      amount_bcy: parseFloat(row.total_amount) || 0
    }));

    res.json(rows);
  } catch (error) {
    console.error('Error generating refund history report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;

