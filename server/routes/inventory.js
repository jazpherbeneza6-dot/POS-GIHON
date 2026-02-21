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

module.exports = router;

