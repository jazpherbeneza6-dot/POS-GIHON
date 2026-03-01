const express = require('express');
const router = express.Router();
const database = require('../database');
const multer = require('multer');
const path = require('path');

// Multer config for item images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads/items'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `item_${req.params.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});
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

// Get ungrouped items (items not assigned to any group)
router.get('/ungrouped', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT i.* FROM items i
      WHERE i.group_id IS NULL
      ORDER BY i.name ASC
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching ungrouped items:', error);
    res.status(500).json({ error: 'Failed to fetch ungrouped items' });
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

// Get committed stock for an item (from confirmed sales orders not yet fully shipped)
router.get('/:id/committed-stock', async (req, res) => {
  try {
    const db = database.getDb();
    const itemId = req.params.id;

    // Get current stock
    const itemResult = await db.query('SELECT stock_quantity FROM items WHERE id = $1', [itemId]);
    const stockOnHand = parseFloat(itemResult.rows[0]?.stock_quantity || 0);

    // Committed = qty from sales orders that are CONFIRMED but not CLOSED/CANCELLED
    // These are orders where items are promised but not yet shipped
    const committedResult = await db.query(`
      SELECT COALESCE(SUM(soi.quantity), 0) as committed_qty
      FROM sales_order_items soi
      JOIN sales_orders so ON soi.sales_order_id = so.id
      WHERE soi.item_id = $1
      AND so.status IN ('CONFIRMED', 'PACKED', 'PARTIALLY_SHIPPED')
    `, [itemId]);

    const committedStock = parseFloat(committedResult.rows[0]?.committed_qty || 0);
    const availableForSale = stockOnHand - committedStock;

    res.json({
      stock_on_hand: stockOnHand,
      committed_stock: committedStock,
      available_for_sale: availableForSale
    });
  } catch (error) {
    console.error('Error fetching committed stock:', error);
    res.json({ stock_on_hand: 0, committed_stock: 0, available_for_sale: 0 });
  }
});

// GET item status counts (To be Shipped, Received, Invoiced, Billed)
router.get('/:id/status-counts', async (req, res) => {
  try {
    const db = database.getDb();
    const itemId = req.params.id;

    // Get item name for matching (some tables store item_name instead of item_id)
    let itemName = '';
    try {
      const itemResult = await db.query('SELECT name FROM items WHERE id = $1', [itemId]);
      itemName = itemResult.rows[0]?.name || '';
    } catch (e) { }

    let toBeShipped = 0;
    let toBeReceived = 0;
    let toBeInvoiced = 0;
    let toBeBilled = 0;

    // To be Shipped: qty from CONFIRMED sales orders that have no packages yet
    try {
      const shippedResult = await db.query(`
        SELECT COALESCE(SUM(soi.quantity), 0) as qty
        FROM sales_order_items soi
        JOIN sales_orders so ON soi.sales_order_id = so.id
        WHERE (soi.item_id = $1 OR soi.item_name = $2)
          AND UPPER(so.status) = 'CONFIRMED'
          AND NOT EXISTS (
            SELECT 1 FROM packages pkg WHERE pkg.sales_order_id = so.id
          )
      `, [itemId, itemName]);
      toBeShipped = parseFloat(shippedResult.rows[0]?.qty) || 0;
    } catch (e) { console.error('To be shipped query error:', e.message); }

    // To be Received: qty from issued/ordered purchases not yet received
    try {
      const receivedResult = await db.query(`
        SELECT COALESCE(SUM(pi.quantity), 0) as qty
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        WHERE (pi.item_id = $1 OR pi.item_name = $2)
          AND UPPER(p.status) IN ('ORDERED', 'ISSUED', 'CONFIRMED')
          AND UPPER(p.status) != 'RECEIVED'
      `, [itemId, itemName]);
      toBeReceived = parseFloat(receivedResult.rows[0]?.qty) || 0;
    } catch (e) { console.error('To be received query error:', e.message); }

    // To be Invoiced: qty from CONFIRMED sales orders that have no invoice yet
    try {
      const invoicedResult = await db.query(`
        SELECT COALESCE(SUM(soi.quantity), 0) as qty
        FROM sales_order_items soi
        JOIN sales_orders so ON soi.sales_order_id = so.id
        WHERE (soi.item_id = $1 OR soi.item_name = $2)
          AND UPPER(so.status) = 'CONFIRMED'
          AND NOT EXISTS (
            SELECT 1 FROM invoices inv WHERE inv.order_number = so.order_number
          )
      `, [itemId, itemName]);
      toBeInvoiced = parseFloat(invoicedResult.rows[0]?.qty) || 0;
    } catch (e) { console.error('To be invoiced query error:', e.message); }

    // To be Billed: qty from issued/ordered purchases not yet billed
    try {
      const billedResult = await db.query(`
        SELECT COALESCE(SUM(pi.quantity), 0) as qty
        FROM purchase_items pi
        JOIN purchases p ON pi.purchase_id = p.id
        WHERE (pi.item_id = $1 OR pi.item_name = $2)
          AND UPPER(p.status) IN ('ORDERED', 'ISSUED', 'CONFIRMED')
      `, [itemId, itemName]);
      toBeBilled = parseFloat(billedResult.rows[0]?.qty) || 0;
    } catch (e) { console.error('To be billed query error:', e.message); }

    res.json({
      to_be_shipped: toBeShipped,
      to_be_received: toBeReceived,
      to_be_invoiced: toBeInvoiced,
      to_be_billed: toBeBilled
    });
  } catch (error) {
    console.error('Error fetching item status counts:', error);
    res.status(500).json({ error: 'Failed to fetch item status counts' });
  }
});

// GET item IDs that appear in sales orders or invoices
router.get('/filter/sales-item-ids', async (req, res) => {
  try {
    const db = database.getDb();
    const itemIds = new Set();
    const itemNames = new Set();

    // From sales_order_items
    try {
      const soResult = await db.query('SELECT DISTINCT item_id, item_name FROM sales_order_items');
      for (const row of soResult.rows) {
        if (row.item_id) itemIds.add(row.item_id);
        if (row.item_name) itemNames.add(row.item_name);
      }
    } catch (e) { /* table may not exist */ }

    // From invoice_items
    try {
      const invResult = await db.query('SELECT DISTINCT item_name FROM invoice_items');
      for (const row of invResult.rows) {
        if (row.item_name) itemNames.add(row.item_name);
      }
    } catch (e) { /* table may not exist */ }

    // Match names to IDs
    if (itemNames.size > 0) {
      const nameArray = Array.from(itemNames);
      const matchResult = await db.query(
        `SELECT id FROM items WHERE name = ANY($1)`,
        [nameArray]
      );
      for (const row of matchResult.rows) {
        itemIds.add(row.id);
      }
    }

    res.json(Array.from(itemIds));
  } catch (error) {
    console.error('Error fetching sales item IDs:', error);
    res.status(500).json({ error: 'Failed to fetch sales item IDs' });
  }
});

// GET item IDs that appear in purchase orders
router.get('/filter/purchase-item-ids', async (req, res) => {
  try {
    const db = database.getDb();
    const itemIds = new Set();
    const itemNames = new Set();

    // From purchase_order_items
    try {
      const poResult = await db.query('SELECT DISTINCT item_id, item_name FROM purchase_order_items');
      for (const row of poResult.rows) {
        if (row.item_id) itemIds.add(row.item_id);
        if (row.item_name) itemNames.add(row.item_name);
      }
    } catch (e) { /* table may not exist */ }

    // Match names to IDs
    if (itemNames.size > 0) {
      const nameArray = Array.from(itemNames);
      const matchResult = await db.query(
        `SELECT id FROM items WHERE name = ANY($1)`,
        [nameArray]
      );
      for (const row of matchResult.rows) {
        itemIds.add(row.id);
      }
    }

    res.json(Array.from(itemIds));
  } catch (error) {
    console.error('Error fetching purchase item IDs:', error);
    res.status(500).json({ error: 'Failed to fetch purchase item IDs' });
  }
});

// Search items
// GET item transactions
router.get('/:id/transactions', async (req, res) => {
  try {
    const db = database.getDb();
    const itemId = req.params.id;
    const filterType = req.query.type || 'sales'; // sales, invoices, all
    const statusFilter = req.query.status || 'all';

    // First get the item name for fallback matching
    const itemResult = await db.query('SELECT name FROM items WHERE id = $1', [itemId]);
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const itemName = itemResult.rows[0].name;

    let transactions = [];

    // Sales Orders
    if (filterType === 'sales' || filterType === 'all') {
      try {
        const soResult = await db.query(`
          SELECT 
            so.order_date as date,
            'Sales Order' as type,
            so.order_number as reference,
            so.customer_name as party_name,
            soi.quantity,
            soi.rate as price,
            soi.amount as total,
            so.status,
            CASE 
              WHEN EXISTS (SELECT 1 FROM invoices inv WHERE inv.order_number = so.order_number AND inv.status IN ('PAID', 'Paid'))
              THEN 'PAID'
              ELSE so.status
            END as payment_status
          FROM sales_order_items soi
          JOIN sales_orders so ON soi.sales_order_id = so.id
          WHERE soi.item_id = $1 OR soi.item_name = $2
          ORDER BY so.order_date DESC
        `, [itemId, itemName]);
        transactions = transactions.concat(soResult.rows);
      } catch (e) { /* table may not exist */ }
    }

    // Invoices
    if (filterType === 'invoices' || filterType === 'all') {
      try {
        const invResult = await db.query(`
          SELECT 
            inv.invoice_date as date,
            'Invoice' as type,
            inv.invoice_number as reference,
            inv.customer_name as party_name,
            ii.quantity,
            ii.rate as price,
            ii.amount as total,
            inv.status,
            inv.status as payment_status
          FROM invoice_items ii
          JOIN invoices inv ON ii.invoice_id = inv.id
          WHERE ii.item_name = $1
          ORDER BY inv.invoice_date DESC
        `, [itemName]);
        transactions = transactions.concat(invResult.rows);
      } catch (e) { /* table may not exist */ }
    }

    // Sales Receipts
    if (filterType === 'sales' || filterType === 'all') {
      try {
        const srResult = await db.query(`
          SELECT 
            sr.receipt_date as date,
            'Sales Receipt' as type,
            sr.receipt_number as reference,
            sr.customer_name as party_name,
            sri.quantity,
            sri.rate as price,
            sri.amount as total,
            sr.status,
            sr.status as payment_status
          FROM sales_receipt_items sri
          JOIN sales_receipts sr ON sri.sales_receipt_id = sr.id
          WHERE sri.item_id = $1 OR sri.item_name = $2
          ORDER BY sr.receipt_date DESC
        `, [itemId, itemName]);
        transactions = transactions.concat(srResult.rows);
      } catch (e) { /* table may not exist */ }
    }

    // Inventory Adjustments
    if (filterType === 'adjustments' || filterType === 'all') {
      try {
        const adjResult = await db.query(`
          SELECT 
            t.date,
            'Inventory Adjustment' as type,
            t.reference,
            '-' as party_name,
            t.quantity,
            0 as price,
            0 as total,
            'adjusted' as status,
            'adjusted' as payment_status
          FROM inventory_transactions t
          WHERE t.item_id = $1 AND t.type = 'ADJUSTMENT'
          ORDER BY t.date DESC
        `, [itemId]);
        transactions = transactions.concat(adjResult.rows);
      } catch (e) { /* table may not exist */ }
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      transactions = transactions.filter(t =>
        t.status && t.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching item transactions:', error);
    res.status(500).json({ error: 'Failed to fetch item transactions' });
  }
});


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

    const preferredVendorValue = req.body.preferred_vendor || null;
    const addedByValue = req.body.added_by || null;

    const result = await db.query(`
      INSERT INTO items (name, sku, unit, stock_quantity, reorder_point, selling_price, purchase_cost, can_be_wholesale, image_url, group_id, manufacturer, brand, description, upc, ean, isbn, dimensions, tax_rate, account, type, weight, purchase_account, purchase_description, preferred_vendor, added_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING id
    `, [name.trim(), finalSku, unitValue, stockQuantity, reorderPointValue, sellingPrice, purchaseCost, can_be_wholesale || false, image_url || null, groupIdValue, manufacturerValue, brandValue, descriptionValue, upcValue, eanValue, isbnValue, dimensionsValue, taxRateValue, accountValue, typeValue, weightValue, purchaseAccountValue, purchaseDescriptionValue, preferredVendorValue, addedByValue]);

    const itemId = result.rows[0].id;
    const itemResult = await db.query('SELECT * FROM items WHERE id = $1', [itemId]);


    res.status(201).json(itemResult.rows[0]);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item', details: error.message });
  }
});

// Get item history (all updates, adjustments, and activity)
router.get('/:id/history', async (req, res) => {
  try {
    const db = database.getDb();
    const itemId = req.params.id;
    const history = [];

    // 1. Get item created/updated dates
    const itemRes = await db.query('SELECT name, created_at, updated_at FROM items WHERE id = $1', [itemId]);
    if (itemRes.rows.length > 0) {
      const item = itemRes.rows[0];
      if (item.created_at) {
        history.push({
          date: item.created_at,
          action: 'created',
          details: `Item "${item.name}" was created`,
          user: 'System',
          type: 'system'
        });
      }
      if (item.updated_at && item.updated_at !== item.created_at) {
        history.push({
          date: item.updated_at,
          action: 'updated',
          details: `Item "${item.name}" was updated`,
          user: 'System',
          type: 'system'
        });
      }
    }

    // 2. Get activity log entries for this item
    try {
      const activityRes = await db.query(
        `SELECT action, description, user_name, created_at 
         FROM activity_log 
         WHERE entity_type = 'item' AND entity_id = $1 
         ORDER BY created_at DESC`,
        [itemId]
      );
      for (const log of activityRes.rows) {
        history.push({
          date: log.created_at,
          action: log.action,
          details: log.description || `${log.action} by ${log.user_name || 'System'}`,
          user: log.user_name || 'System',
          type: 'activity'
        });
      }
    } catch (e) {
      // activity_log table might not exist
    }

    // 3. Get inventory adjustments for this item
    try {
      const adjRes = await db.query(
        `SELECT ia.reference_number, ia.adjustment_date, ia.reason, ia.status, ia.mode,
                iai.quantity_on_hand, iai.quantity_adjusted, iai.new_quantity, iai.unit_cost
         FROM inventory_adjustment_items iai
         JOIN inventory_adjustments ia ON iai.adjustment_id = ia.id
         WHERE iai.item_id = $1
         ORDER BY ia.adjustment_date DESC`,
        [itemId]
      );
      for (const adj of adjRes.rows) {
        const qtyAdj = parseFloat(adj.quantity_adjusted) || 0;
        const qtyBefore = parseFloat(adj.quantity_on_hand) || 0;
        const qtyAfter = parseFloat(adj.new_quantity) || 0;
        const direction = qtyAdj >= 0 ? 'increased' : 'decreased';
        const reason = adj.reason ? ` (${adj.reason})` : '';
        const ref = adj.reference_number ? ` [${adj.reference_number}]` : '';

        history.push({
          date: adj.adjustment_date,
          action: 'stock_adjusted',
          details: `Stock ${direction} from ${qtyBefore} to ${qtyAfter} (${qtyAdj >= 0 ? '+' : ''}${qtyAdj})${reason}${ref}`,
          user: 'System',
          type: 'adjustment',
          status: adj.status
        });
      }
    } catch (e) {
      // adjustment tables might not exist
    }

    // Sort by date descending
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(history);
  } catch (error) {
    console.error('Error getting item history:', error);
    res.status(500).json({ error: 'Failed to get item history' });
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
        'preferred_vendor': 'preferred_vendor',
        'status': 'status',
        'is_returnable': 'is_returnable',
        'image_url': 'image_url',
        'inventory_account': 'inventory_account',
        'valuation_method': 'valuation_method',
        'group_id': 'group_id'
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

      // Log the update to activity_log
      try {
        const changedFields = Object.keys(req.body).filter(k => k !== '_partialUpdate').join(', ');
        await db.query(
          `INSERT INTO activity_log (entity_type, entity_id, entity_name, action, description, user_name)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ['item', req.params.id, result.rows[0].name, 'updated', `Updated fields: ${changedFields}`, 'System']
        );
      } catch (logErr) { /* activity_log might not exist */ }

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
    const preferredVendorValue = req.body.preferred_vendor !== undefined ? req.body.preferred_vendor : null;
    const addedByValue = req.body.added_by !== undefined ? req.body.added_by : null;

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
          type = $20, weight = $21, purchase_account = $22, purchase_description = $23,
          preferred_vendor = $24, added_by = $25, updated_at = CURRENT_TIMESTAMP
      WHERE id = $26
    `, [name.trim(), sku || null, unitValue, stockQuantity, reorderPointValue, sellingPrice, purchaseCost, can_be_wholesale || false, image_url || null, groupIdValue, manufacturerValue, brandValue, descriptionValue, upcValue, eanValue, isbnValue, dimensionsValue, taxRateValue, accountValue, typeValue, weightValue, purchaseAccountValue, purchaseDescriptionValue, preferredVendorValue, addedByValue, req.params.id]);

    const result = await db.query(`
      SELECT i.*, ig.name as group_name,
             COALESCE(i.manufacturer, ig.manufacturer) as manufacturer,
             COALESCE(i.brand, ig.brand) as brand
      FROM items i 
      LEFT JOIN item_groups ig ON i.group_id = ig.id 
      WHERE i.id = $1
    `, [req.params.id]);

    // Log the update to activity_log
    try {
      await db.query(
        `INSERT INTO activity_log (entity_type, entity_id, entity_name, action, description, user_name)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['item', req.params.id, result.rows[0]?.name || name, 'updated', 'Item details were updated', 'System']
      );
    } catch (logErr) { /* activity_log might not exist */ }

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
    const { name, description, unit, brand, manufacturer, status } = req.body;
    const db = database.getDb();

    // If only status is being updated (from selection toolbar)
    if (status && !name) {
      await db.query('UPDATE item_groups SET status = $1 WHERE id = $2', [status, req.params.id]);
      const result = await db.query('SELECT * FROM item_groups WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      return res.json(result.rows[0]);
    }

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    await db.query(`
      UPDATE item_groups 
      SET name = $1, description = $2, unit = $3, brand = $4, manufacturer = $5, status = $6
      WHERE id = $7
    `, [name, description || null, unit || 'pcs', brand || null, manufacturer || null, status || 'active', req.params.id]);

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



// Upload item image
router.post('/:id/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const db = database.getDb();
    const imageUrl = `/uploads/items/${req.file.filename}`;

    await db.query('UPDATE items SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [imageUrl, req.params.id]);

    const result = await db.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ image_url: imageUrl, item: result.rows[0] });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Remove item image
router.delete('/:id/remove-image', async (req, res) => {
  try {
    const db = database.getDb();
    await db.query('UPDATE items SET image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ message: 'Image removed' });
  } catch (error) {
    console.error('Error removing image:', error);
    res.status(500).json({ error: 'Failed to remove image' });
  }
});

module.exports = router;
