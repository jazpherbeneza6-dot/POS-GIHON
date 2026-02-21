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

// Sales by Item report
router.get('/reports/sales-by-item', async (req, res) => {
  try {
    const { from, to } = req.query;
    const db = database.getDb();

    let dateFilter = '';
    const params = [];

    if (from && to) {
      dateFilter = 'AND s.date >= $1 AND s.date <= $2';
      params.push(from, to + 'T23:59:59.999');
    }

    // 1. Get from sales_items (POS sales)
    const result = await db.query(`
      SELECT 
        COALESCE(i.name, si.item_id::text) AS item_name,
        COALESCE(i.sku, '') AS sku,
        SUM(si.quantity) AS quantity_sold,
        SUM(si.total_price) AS total_amount,
        COALESCE(i.selling_price, 0) AS selling_price
      FROM sales_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN items i ON si.item_id = i.id
      WHERE s.status != 'cancelled' ${dateFilter}
      GROUP BY COALESCE(i.name, si.item_id::text), COALESCE(i.sku, ''), COALESCE(i.selling_price, 0)
    `, params);

    // 2. Get from sales_receipt_items
    let receiptDateFilter = '';
    const receiptParams = [];
    if (from && to) {
      receiptDateFilter = 'AND sr.receipt_date >= $1 AND sr.receipt_date <= $2';
      receiptParams.push(from, to + 'T23:59:59.999');
    }

    let receiptItems = [];
    try {
      const receiptResult = await db.query(`
        SELECT 
          COALESCE(i.name, sri.item_name) AS item_name,
          COALESCE(i.sku, '') AS sku,
          SUM(sri.quantity) AS quantity_sold,
          SUM(
            sri.amount * CASE 
              WHEN COALESCE(sr.sub_total, 0) > 0 AND COALESCE(sr.discount, 0) > 0 
              THEN (1.0 - COALESCE(sr.discount, 0) / sr.sub_total)
              ELSE 1.0 
            END
          ) AS total_amount,
          COALESCE(i.selling_price, 0) AS selling_price
        FROM sales_receipt_items sri
        JOIN sales_receipts sr ON sri.sales_receipt_id = sr.id
        LEFT JOIN items i ON sri.item_id = i.id
        WHERE 1=1 ${receiptDateFilter}
        GROUP BY COALESCE(i.name, sri.item_name), COALESCE(i.sku, ''), COALESCE(i.selling_price, 0)
      `, receiptParams);
      receiptItems = receiptResult.rows;
    } catch (e) {
      // sales_receipt_items may not exist
    }

    // 3. Get from invoice_items (Sales Order → Invoice → Payment flow)
    let invoiceDateFilter = '';
    const invoiceParams = [];
    if (from && to) {
      invoiceDateFilter = "AND inv.invoice_date >= $1 AND inv.invoice_date <= $2";
      invoiceParams.push(from, to + 'T23:59:59.999');
    }

    let invoiceItems = [];
    try {
      // Use discount ratio to proportionally reduce each item's amount
      const invoiceResult = await db.query(`
        SELECT 
          COALESCE(i.name, ii.item_name) AS item_name,
          COALESCE(i.sku, '') AS sku,
          SUM(ii.quantity) AS quantity_sold,
          SUM(
            ii.amount * CASE 
              WHEN COALESCE(inv.sub_total, 0) > 0 AND COALESCE(inv.discount, 0) > 0 
              THEN (1.0 - COALESCE(inv.discount, 0) / inv.sub_total)
              ELSE 1.0 
            END
          ) AS total_amount,
          COALESCE(i.selling_price, 0) AS selling_price
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id
        LEFT JOIN items i ON LOWER(i.name) = LOWER(ii.item_name)
        WHERE inv.status NOT IN ('DRAFT', 'VOID', 'Void', 'draft') ${invoiceDateFilter}
        GROUP BY COALESCE(i.name, ii.item_name), COALESCE(i.sku, ''), COALESCE(i.selling_price, 0)
      `, invoiceParams);
      invoiceItems = invoiceResult.rows;
    } catch (e) {
      // invoice_items may not exist
    }

    // Merge all sources
    const merged = {};
    const addToMerged = (rows) => {
      for (const row of rows) {
        const key = row.item_name;
        if (merged[key]) {
          merged[key].quantity_sold += parseFloat(row.quantity_sold) || 0;
          merged[key].total_amount += parseFloat(row.total_amount) || 0;
          if (!merged[key].sku && row.sku) merged[key].sku = row.sku;
          if (!merged[key].selling_price && row.selling_price) merged[key].selling_price = parseFloat(row.selling_price) || 0;
        } else {
          merged[key] = {
            item_name: row.item_name,
            sku: row.sku || '',
            quantity_sold: parseFloat(row.quantity_sold) || 0,
            total_amount: parseFloat(row.total_amount) || 0,
            selling_price: parseFloat(row.selling_price) || 0
          };
        }
      }
    };

    addToMerged(result.rows);
    addToMerged(receiptItems);
    addToMerged(invoiceItems);

    // Use selling_price as average_price
    const final = Object.values(merged).map(item => ({
      ...item,
      average_price: item.selling_price > 0 ? item.selling_price : (item.quantity_sold > 0 ? item.total_amount / item.quantity_sold : 0)
    })).sort((a, b) => a.item_name.localeCompare(b.item_name));

    res.json(final);
  } catch (error) {
    console.error('Error generating sales by item report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Sales by Item - Customer drill-down
router.get('/reports/sales-by-item/:itemName/customers', async (req, res) => {
  try {
    const { from, to } = req.query;
    const itemName = decodeURIComponent(req.params.itemName);
    const db = database.getDb();

    // Look up the item's selling_price
    let itemSellingPrice = 0;
    try {
      const itemResult = await db.query('SELECT selling_price FROM items WHERE name = $1 LIMIT 1', [itemName]);
      if (itemResult.rows.length > 0) {
        itemSellingPrice = parseFloat(itemResult.rows[0].selling_price) || 0;
      }
    } catch (e) { /* ignore */ }

    const merged = {};
    const addToMerged = (rows) => {
      for (const row of rows) {
        const key = row.customer_name || 'Walk-in Customer';
        if (merged[key]) {
          merged[key].quantity += parseFloat(row.quantity) || 0;
          merged[key].amount += parseFloat(row.amount) || 0;
        } else {
          merged[key] = {
            customer_name: key,
            quantity: parseFloat(row.quantity) || 0,
            amount: parseFloat(row.amount) || 0
          };
        }
      }
    };

    // 1. From sales_items (POS sales)
    try {
      let dateFilter = '';
      const params = [itemName];
      if (from && to) {
        dateFilter = 'AND s.date >= $2 AND s.date <= $3';
        params.push(from, to + 'T23:59:59.999');
      }
      const result = await db.query(`
        SELECT 
          COALESCE(s.customer_name, 'Walk-in Customer') AS customer_name,
          SUM(si.quantity) AS quantity,
          SUM(si.total_price) AS amount
        FROM sales_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN items i ON si.item_id = i.id
        WHERE s.status != 'cancelled'
          AND COALESCE(i.name, si.item_id::text) = $1
          ${dateFilter}
        GROUP BY COALESCE(s.customer_name, 'Walk-in Customer')
      `, params);
      addToMerged(result.rows);
    } catch (e) { /* ignore */ }

    // 2. From sales_receipt_items
    try {
      let dateFilter = '';
      const params = [itemName];
      if (from && to) {
        dateFilter = 'AND sr.receipt_date >= $2 AND sr.receipt_date <= $3';
        params.push(from, to + 'T23:59:59.999');
      }
      const result = await db.query(`
        SELECT 
          COALESCE(sr.customer_name, 'Walk-in Customer') AS customer_name,
          SUM(sri.quantity) AS quantity,
          SUM(
            sri.amount * CASE 
              WHEN COALESCE(sr.sub_total, 0) > 0 AND COALESCE(sr.discount, 0) > 0 
              THEN (1.0 - COALESCE(sr.discount, 0) / sr.sub_total)
              ELSE 1.0 
            END
          ) AS amount
        FROM sales_receipt_items sri
        JOIN sales_receipts sr ON sri.sales_receipt_id = sr.id
        LEFT JOIN items i ON sri.item_id = i.id
        WHERE COALESCE(i.name, sri.item_name) = $1
          ${dateFilter}
        GROUP BY COALESCE(sr.customer_name, 'Walk-in Customer')
      `, params);
      addToMerged(result.rows);
    } catch (e) { /* ignore */ }

    // 3. From invoice_items
    try {
      let dateFilter = '';
      const params = [itemName];
      if (from && to) {
        dateFilter = 'AND inv.invoice_date >= $2 AND inv.invoice_date <= $3';
        params.push(from, to + 'T23:59:59.999');
      }
      const result = await db.query(`
        SELECT 
          COALESCE(inv.customer_name, 'Walk-in Customer') AS customer_name,
          SUM(ii.quantity) AS quantity,
          SUM(
            ii.amount * CASE 
              WHEN COALESCE(inv.sub_total, 0) > 0 AND COALESCE(inv.discount, 0) > 0 
              THEN (1.0 - COALESCE(inv.discount, 0) / inv.sub_total)
              ELSE 1.0 
            END
          ) AS amount
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id
        LEFT JOIN items i ON LOWER(i.name) = LOWER(ii.item_name)
        WHERE inv.status NOT IN ('DRAFT', 'VOID', 'Void', 'draft')
          AND COALESCE(i.name, ii.item_name) = $1
          ${dateFilter}
        GROUP BY COALESCE(inv.customer_name, 'Walk-in Customer')
      `, params);
      addToMerged(result.rows);
    } catch (e) { /* ignore */ }

    // Use item selling_price as average_price
    const final = Object.values(merged).map(c => ({
      ...c,
      average_price: itemSellingPrice > 0 ? itemSellingPrice : (c.quantity > 0 ? c.amount / c.quantity : 0)
    })).sort((a, b) => a.customer_name.localeCompare(b.customer_name));

    res.json(final);
  } catch (error) {
    console.error('Error generating customer drill-down:', error);
    res.status(500).json({ error: 'Failed to generate customer breakdown' });
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
