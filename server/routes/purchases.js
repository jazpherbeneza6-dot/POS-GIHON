const express = require('express');
const router = express.Router();
const database = require('../database');

// Create purchase
router.post('/', async (req, res) => {
  try {
    const { supplier_id, supplier_name, items, invoice_number, po_number, expected_date, payment_terms, notes, status, date, delivery_address, reference_number, discount_percent, adjustment, terms_conditions, shipment_preference } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const db = database.getDb();

    // Resolve supplier: prefer supplier_id; fallback to supplier_name lookup; create if still missing
    let finalSupplierId = supplier_id || null;
    let finalSupplierName = supplier_name || null;

    if (!finalSupplierId && finalSupplierName) {
      const lookup = await db.query(
        'SELECT id, name FROM suppliers WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [finalSupplierName.trim()]
      );
      if (lookup.rows.length > 0) {
        finalSupplierId = lookup.rows[0].id;
        finalSupplierName = lookup.rows[0].name;
      } else {
        const created = await db.query(
          'INSERT INTO suppliers (name) VALUES ($1) RETURNING id, name',
          [finalSupplierName.trim()]
        );
        finalSupplierId = created.rows[0].id;
        finalSupplierName = created.rows[0].name;
      }
    } else if (finalSupplierId) {
      const supplierResult = await db.query('SELECT name FROM suppliers WHERE id = $1', [finalSupplierId]);
      if (supplierResult.rows.length > 0) {
        finalSupplierName = supplierResult.rows[0].name;
      }
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      // Allow items without item_id (new items to be created when received)
      if (!item.quantity || item.unit_price === undefined || item.unit_price === null) {
        return res.status(400).json({ error: 'Each item must have quantity and unit_price' });
      }
      totalAmount += item.quantity * item.unit_price;
    }

    // Apply discount and adjustment
    const discPct = parseFloat(discount_percent) || 0;
    const adj = parseFloat(adjustment) || 0;
    const discountAmt = totalAmount * (discPct / 100);
    totalAmount = totalAmount - discountAmt + adj;

    // Generate invoice number if not provided
    const invoiceNum = invoice_number || po_number || 'INV-' + Date.now().toString().slice(-8);

    // Start transaction
    let purchaseId;
    await database.transaction(async (client) => {
      // Create purchase record
      const purchaseResult = await client.query(`
        INSERT INTO purchases (supplier_id, supplier_name, total_amount, invoice_number, po_number, expected_date, payment_terms, notes, status, date, delivery_address, reference_number, discount_percent, adjustment, terms_conditions, shipment_preference)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_TIMESTAMP), $11, $12, $13, $14, $15, $16)
        RETURNING id
      `, [
        finalSupplierId,
        finalSupplierName,
        totalAmount,
        invoiceNum,
        po_number || null,
        expected_date || null,
        payment_terms || null,
        notes || null,
        status || 'ordered',
        date || null,
        delivery_address || null,
        reference_number || null,
        discPct,
        adj,
        terms_conditions || null,
        shipment_preference || null
      ]);

      purchaseId = purchaseResult.rows[0].id;

      // Create purchase items and update inventory
      for (const item of items) {
        const totalPrice = item.quantity * item.unit_price;
        const qty = parseInt(item.quantity) || 0;
        let itemId = item.item_id;
        let itemWasCreatedNow = false; // Track if we created the item in this transaction

        // CASE 1: New item that needs to be created (only when status is 'received')
        if (status === 'received' && item.is_new === true && !itemId && item.item_name) {
          // Generate SKU
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let randomPart = '';
          for (let i = 0; i < 6; i++) {
            randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          const sku = `SKU-${randomPart}`;

          // Create new item with the quantity from purchase
          const newItemResult = await client.query(
            `INSERT INTO items (name, sku, unit, stock_quantity, selling_price, purchase_cost)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [item.item_name.trim(), sku, 'pcs', qty, item.selling_price || item.unit_price, item.unit_price]
          );

          if (newItemResult.rows.length > 0) {
            itemId = newItemResult.rows[0].id;
            itemWasCreatedNow = true; // Mark that we just created this item
          }
        }

        // Insert purchase item record
        await client.query(`
          INSERT INTO purchase_items (purchase_id, item_id, quantity, unit_price, total_price, item_name, selling_price, is_new)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [purchaseId, itemId || null, qty, item.unit_price, totalPrice, item.item_name || null, item.selling_price || null, item.is_new === true]);

        // CASE 2: Existing item that needs stock update (only when status is 'received')
        // Only update if: status is received, we have an item_id, AND item was NOT just created
        if (status === 'received' && itemId && !itemWasCreatedNow) {
          await client.query(`
            UPDATE items 
            SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [qty, itemId]);
        }

        // Record inventory transaction if we have an item ID and status is received
        if (status === 'received' && itemId) {
          await client.query(`
            INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
            VALUES ($1, 'IN', $2, $3, $4)
          `, [itemId, qty, invoiceNum, `Purchase: ${invoiceNum}`]);
        }
      }
    });

    const result = await db.query(`
      SELECT p.*, 
             COUNT(pi.id) as item_count
      FROM purchases p
      LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
      WHERE p.id = $1
      GROUP BY p.id
    `, [purchaseId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating purchase:', error);
    if (error.code === '23505') { // PostgreSQL unique violation
      res.status(400).json({ error: 'Invoice number already exists' });
    } else {
      res.status(500).json({ error: error.message || 'Failed to create purchase' });
    }
  }
});

// Get all purchases
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const db = database.getDb();

    // Get purchases with item details and supplier info
    const result = await db.query(`
      SELECT p.*,
             s.name as supplier_name_from_db,
             s.contact_person as supplier_contact_person,
             s.email as supplier_email,
             s.phone as supplier_phone,
             COUNT(pi.id) as item_count,
             json_agg(
               json_build_object(
                 'item_id', pi.item_id,
                 'item_name', COALESCE(i.name, pi.item_name),
                 'quantity', pi.quantity,
                 'unit_price', pi.unit_price,
                 'is_new', pi.is_new,
                 'selling_price', pi.selling_price
               ) ORDER BY pi.id
             ) FILTER (WHERE pi.id IS NOT NULL) as items
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
      LEFT JOIN items i ON pi.item_id = i.id
      GROUP BY p.id, s.id, s.name, s.contact_person, s.email, s.phone
      ORDER BY p.date DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);

    // Use supplier name from database if available, otherwise use supplier_name column
    result.rows = result.rows.map(row => ({
      ...row,
      supplier_name: row.supplier_name_from_db || row.supplier_name,
      supplier_id: row.supplier_id
    }));

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// Get purchase by ID with items
router.get('/:id', async (req, res) => {
  try {
    const db = database.getDb();
    const purchaseResult = await db.query(`
      SELECT p.*, 
             s.name as supplier_name_from_db,
             s.contact_person as supplier_contact_person,
             s.email as supplier_email,
             s.phone as supplier_phone
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (purchaseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const purchase = purchaseResult.rows[0];
    const itemsResult = await db.query(`
      SELECT pi.*, 
             COALESCE(i.name, pi.item_name) as item_name, 
             i.sku, i.barcode, i.unit,
             pi.is_new, pi.selling_price as pi_selling_price
      FROM purchase_items pi
      LEFT JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = $1
    `, [req.params.id]);

    res.json({
      ...purchase,
      supplier_name: purchase.supplier_name_from_db || purchase.supplier_name,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching purchase:', error);
    res.status(500).json({ error: 'Failed to fetch purchase' });
  }
});

// Update purchase (full edit)
router.put('/:id', async (req, res) => {
  try {
    const { supplier_id, supplier_name, items, po_number, expected_date, payment_terms, notes, status, date, delivery_address, reference_number, discount_percent, adjustment, terms_conditions, shipment_preference, received_date, receiving_notes } = req.body;
    const db = database.getDb();

    // Check if purchase exists
    const purchaseResult = await db.query('SELECT * FROM purchases WHERE id = $1', [req.params.id]);
    if (purchaseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const existingPurchase = purchaseResult.rows[0];

    // --- FULL EDIT MODE (when items array is provided) ---
    if (items && Array.isArray(items) && items.length > 0) {
      // Resolve supplier
      let finalSupplierId = supplier_id || existingPurchase.supplier_id;
      let finalSupplierName = supplier_name || existingPurchase.supplier_name;

      if (!finalSupplierId && finalSupplierName) {
        const lookup = await db.query('SELECT id, name FROM suppliers WHERE LOWER(name) = LOWER($1) LIMIT 1', [finalSupplierName.trim()]);
        if (lookup.rows.length > 0) {
          finalSupplierId = lookup.rows[0].id;
          finalSupplierName = lookup.rows[0].name;
        }
      } else if (finalSupplierId) {
        const supplierResult = await db.query('SELECT name FROM suppliers WHERE id = $1', [finalSupplierId]);
        if (supplierResult.rows.length > 0) {
          finalSupplierName = supplierResult.rows[0].name;
        }
      }

      // Calculate total
      let totalAmount = 0;
      for (const item of items) {
        totalAmount += (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
      }
      const discPct = parseFloat(discount_percent) || parseFloat(existingPurchase.discount_percent) || 0;
      const adj = parseFloat(adjustment) || parseFloat(existingPurchase.adjustment) || 0;
      const discountAmt = totalAmount * (discPct / 100);
      totalAmount = totalAmount - discountAmt + adj;

      await database.transaction(async (client) => {
        // Update purchase record
        await client.query(`
          UPDATE purchases SET 
            supplier_id = $1, supplier_name = $2, total_amount = $3, 
            po_number = $4, expected_date = $5, payment_terms = $6, 
            notes = $7, status = $8, date = COALESCE($9, date),
            delivery_address = $10, reference_number = $11, 
            discount_percent = $12, adjustment = $13, 
            terms_conditions = $14, shipment_preference = $15
          WHERE id = $16
        `, [
          finalSupplierId, finalSupplierName, totalAmount,
          po_number || existingPurchase.po_number,
          expected_date || existingPurchase.expected_date,
          payment_terms || existingPurchase.payment_terms,
          notes !== undefined ? notes : existingPurchase.notes,
          status || existingPurchase.status,
          date || null,
          delivery_address !== undefined ? delivery_address : existingPurchase.delivery_address,
          reference_number !== undefined ? reference_number : existingPurchase.reference_number,
          discPct, adj,
          terms_conditions !== undefined ? terms_conditions : existingPurchase.terms_conditions,
          shipment_preference !== undefined ? shipment_preference : existingPurchase.shipment_preference,
          req.params.id
        ]);

        // Delete old items and re-insert
        await client.query('DELETE FROM purchase_items WHERE purchase_id = $1', [req.params.id]);

        for (const item of items) {
          const totalPrice = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
          await client.query(`
            INSERT INTO purchase_items (purchase_id, item_id, quantity, unit_price, total_price, item_name, selling_price, is_new)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            req.params.id,
            item.item_id || null,
            parseFloat(item.quantity) || 0,
            parseFloat(item.unit_price) || 0,
            totalPrice,
            item.item_name || null,
            item.selling_price || null,
            item.is_new === true
          ]);
        }
      });

      const result = await db.query('SELECT * FROM purchases WHERE id = $1', [req.params.id]);
      return res.json(result.rows[0]);
    }

    // --- PARTIAL UPDATE MODE (status change, etc.) ---
    const updates = [];
    const values = [];
    let paramIndex = 1;

    let finalSupplierId = supplier_id !== undefined ? supplier_id : existingPurchase.supplier_id;
    let finalSupplierName = existingPurchase.supplier_name;

    if (!finalSupplierId && finalSupplierName) {
      const supplierLookup = await db.query('SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) LIMIT 1', [finalSupplierName]);
      if (supplierLookup.rows.length > 0) {
        finalSupplierId = supplierLookup.rows[0].id;
      }
    }

    if (finalSupplierId !== undefined) {
      updates.push(`supplier_id = $${paramIndex++}`);
      values.push(finalSupplierId || null);
      if (finalSupplierId) {
        const supplierResult = await db.query('SELECT name FROM suppliers WHERE id = $1', [finalSupplierId]);
        if (supplierResult.rows.length > 0) {
          finalSupplierName = supplierResult.rows[0].name;
        }
      }
      if (finalSupplierName !== undefined) {
        updates.push(`supplier_name = $${paramIndex++}`);
        values.push(finalSupplierName);
      }
    }

    if (status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(status); }
    if (received_date !== undefined) { updates.push(`received_date = $${paramIndex++}`); values.push(received_date); }
    if (receiving_notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(receiving_notes); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    const query = `UPDATE purchases SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, values);

    // If status changed to 'received' from 'ordered', update stock
    if (status === 'received' && existingPurchase.status !== 'received') {
      const itemsResult = await db.query('SELECT * FROM purchase_items WHERE purchase_id = $1', [req.params.id]);

      for (const purchaseItem of itemsResult.rows) {
        let itemId = purchaseItem.item_id;
        const qty = parseInt(purchaseItem.quantity) || 0;
        let itemWasCreatedNow = false;

        if (!itemId && purchaseItem.is_new === true && purchaseItem.item_name) {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          let randomPart = '';
          for (let i = 0; i < 6; i++) {
            randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          const sku = `SKU-${randomPart}`;
          const newItemResult = await db.query(
            `INSERT INTO items (name, sku, unit, stock_quantity, selling_price, purchase_cost) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [purchaseItem.item_name, sku, 'pcs', qty, purchaseItem.selling_price || purchaseItem.unit_price, purchaseItem.unit_price]
          );
          if (newItemResult.rows.length > 0) {
            itemId = newItemResult.rows[0].id;
            itemWasCreatedNow = true;
            await db.query('UPDATE purchase_items SET item_id = $1 WHERE id = $2', [itemId, purchaseItem.id]);
          }
        }

        if (itemId && !itemWasCreatedNow) {
          await db.query('UPDATE items SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [qty, itemId]);
        }

        if (itemId) {
          await db.query(
            'INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes) VALUES ($1, $2, $3, $4, $5)',
            [itemId, 'IN', qty, result.rows[0].po_number || `PO-${req.params.id}`, 'Purchase Received']
          );
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating purchase:', error);
    res.status(500).json({ error: 'Failed to update purchase' });
  }
});

// Delete purchase
router.delete('/:id', async (req, res) => {
  try {
    const db = database.getDb();

    // Check if purchase exists
    const purchaseResult = await db.query('SELECT * FROM purchases WHERE id = $1', [req.params.id]);
    if (purchaseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Delete purchase (items will cascade delete)
    await db.query('DELETE FROM purchases WHERE id = $1', [req.params.id]);

    res.json({ message: 'Purchase deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    res.status(500).json({ error: 'Failed to delete purchase' });
  }
});

// Get all purchase items (for filtering items that have been purchased)
router.get('/items-list/all', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT DISTINCT item_id FROM purchase_items WHERE item_id IS NOT NULL
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching purchase items list:', error);
    res.status(500).json({ error: 'Failed to fetch purchase items list' });
  }
});

module.exports = router;
