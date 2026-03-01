const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all sales orders (optionally filtered by customer_id)
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const { customer_id } = req.query;
        let whereClause = '';
        const params = [];
        if (customer_id) {
            whereClause = 'WHERE so.customer_id = $1';
            params.push(customer_id);
        }
        const result = await pool.query(`
            SELECT so.*,
                COALESCE(pkg.package_count, 0)::int AS package_count,
                COALESCE(pkg.shipped_count, 0)::int AS shipped_package_count,
                COALESCE(shp.shipment_count, 0)::int AS shipment_count,
                CASE WHEN inv.id IS NOT NULL THEN true ELSE false END AS has_invoice,
                CASE WHEN inv.status IN ('PAID', 'Paid') THEN true ELSE false END AS invoice_paid,
                c.company_name AS company_name,
                COALESCE(inv_totals.invoiced_amount, 0) AS invoiced_amount
            FROM sales_orders so
            LEFT JOIN customers c ON so.customer_id = c.id
            LEFT JOIN (
                SELECT sales_order_id, 
                    COUNT(*) AS package_count,
                    COUNT(CASE WHEN status = 'SHIPPED' THEN 1 END) AS shipped_count
                FROM packages 
                GROUP BY sales_order_id
            ) pkg ON so.id = pkg.sales_order_id
            LEFT JOIN (
                SELECT sales_order_id, COUNT(*) AS shipment_count
                FROM shipments
                GROUP BY sales_order_id
            ) shp ON so.id = shp.sales_order_id
            LEFT JOIN LATERAL (
                SELECT id, status FROM invoices WHERE order_number = so.order_number AND status != 'DRAFT' LIMIT 1
            ) inv ON true
            LEFT JOIN (
                SELECT order_number, SUM(total) AS invoiced_amount
                FROM invoices
                WHERE status != 'DRAFT'
                GROUP BY order_number
            ) inv_totals ON so.order_number = inv_totals.order_number
            ${whereClause}
            ORDER BY so.created_at DESC
        `, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales orders:', err);
        res.status(500).json({ error: 'Failed to fetch sales orders' });
    }
});

// GET next available order number (must be before /:id)
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const maxResult = await pool.query(`SELECT order_number FROM sales_orders ORDER BY id DESC LIMIT 1`);
        let nextNum = 1;
        if (maxResult.rows.length > 0 && maxResult.rows[0].order_number) {
            const match = maxResult.rows[0].order_number.match(/SO-(\d+)/);
            if (match) nextNum = parseInt(match[1]) + 1;
        }
        const order_number = 'SO-' + String(nextNum).padStart(5, '0');
        res.json({ order_number });
    } catch (err) {
        console.error('Error getting next order number:', err);
        res.status(500).json({ error: 'Failed to get next order number' });
    }
});

// GET Sales Order Details Report (must be before /:id)
router.get('/reports/sales-order-details', async (req, res) => {
    try {
        const pool = database.getDb();
        const { from, to } = req.query;

        let dateFilter = '';
        const params = [];

        if (from && to) {
            dateFilter = 'WHERE so.order_date >= $1 AND so.order_date <= $2';
            params.push(from, to + 'T23:59:59.999');
        }

        const result = await pool.query(`
            SELECT so.id,
                   so.status,
                   so.order_date,
                   so.expected_shipment_date,
                   so.order_number,
                   so.customer_name,
                   COALESCE(so.total, 0) AS amount
            FROM sales_orders so
            ${dateFilter}
            ORDER BY so.created_at DESC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales order details report:', err);
        res.status(500).json({ error: 'Failed to fetch sales order details report' });
    }
});

// GET single sales order by ID (with customer address data)
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const orderResult = await pool.query(
            `SELECT so.*,
                    c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country,
                    c.shipping_street, c.shipping_city, c.shipping_state, c.shipping_zip, c.shipping_country
             FROM sales_orders so
             LEFT JOIN customers c ON so.customer_id = c.id
             WHERE so.id = $1`,
            [req.params.id]
        );
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sales order not found' });
        }
        const order = orderResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM sales_order_items WHERE sales_order_id = $1', [order.id]);
        order.items = itemsResult.rows;

        res.json(order);
    } catch (err) {
        console.error('Error fetching sales order:', err);
        res.status(500).json({ error: 'Failed to fetch sales order' });
    }
});

// POST create new sales order
router.post('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            order_date,
            reference_number,
            customer_id,
            customer_name,
            salesperson_name,
            payment_terms,
            delivery_method,
            expected_shipment_date,
            status,
            notes,
            sub_total,
            discount,
            discount_type,
            discount_value,
            shipping_charges,
            adjustment,
            total,
            items
        } = req.body;

        // Generate order number: SO-XXXXX (use MAX to avoid collision after deletions)
        const maxResult = await pool.query(`SELECT order_number FROM sales_orders ORDER BY id DESC LIMIT 1`);
        let nextNum = 1;
        if (maxResult.rows.length > 0 && maxResult.rows[0].order_number) {
            const match = maxResult.rows[0].order_number.match(/SO-(\d+)/);
            if (match) nextNum = parseInt(match[1]) + 1;
        }
        const order_number = 'SO-' + String(nextNum).padStart(5, '0');

        const result = await pool.query(
            `INSERT INTO sales_orders (order_number, order_date, reference_number, customer_id, customer_name, salesperson_name, payment_terms, delivery_method, expected_shipment_date, status, notes, sub_total, discount, discount_type, discount_value, shipping_charges, adjustment, total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             RETURNING *`,
            [order_number, order_date || new Date(), reference_number, customer_id, customer_name, salesperson_name, payment_terms, delivery_method || '', expected_shipment_date || null, status || 'DRAFT', notes, sub_total || 0, discount || 0, discount_type || '%', discount_value || 0, shipping_charges || 0, adjustment || 0, total || 0]
        );

        const order = result.rows[0];

        // Insert order items if provided
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO sales_order_items (sales_order_id, item_id, item_name, quantity, rate, tax, amount, discounts)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [order.id, item.item_id || null, item.item_name, item.quantity || 1, item.rate || 0, item.tax, item.amount || 0, JSON.stringify(item.discounts || [])]
                );
            }
        }

        res.status(201).json(order);
    } catch (err) {
        console.error('Error creating sales order:', err);
        res.status(500).json({ error: 'Failed to create sales order', details: err.message });
    }
});

// PATCH update sales order status
router.patch('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        const result = await pool.query(
            'UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [status.toUpperCase(), req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sales order not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// POST convert sales order to invoice
router.post('/:id/convert-to-invoice', async (req, res) => {
    try {
        const pool = database.getDb();

        // 1. Fetch the sales order
        const orderResult = await pool.query('SELECT * FROM sales_orders WHERE id = $1', [req.params.id]);
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sales order not found' });
        }
        const order = orderResult.rows[0];

        // DRAFT guard — cannot convert a draft order
        if ((order.status || '').toUpperCase() === 'DRAFT') {
            return res.status(403).json({ error: 'Cannot process a Draft order. Please confirm the order first.' });
        }

        // 2. Fetch sales order items
        const itemsResult = await pool.query('SELECT * FROM sales_order_items WHERE sales_order_id = $1', [order.id]);
        const items = itemsResult.rows;

        // 2b. Stock validation — check all items have sufficient stock
        for (const item of items) {
            if (item.item_id) {
                const stockRes = await pool.query('SELECT stock_quantity FROM items WHERE id = $1', [item.item_id]);
                if (stockRes.rows.length > 0) {
                    const stock = parseFloat(stockRes.rows[0].stock_quantity) || 0;
                    const ordered = parseFloat(item.quantity) || 0;
                    if (stock < ordered) {
                        return res.status(400).json({
                            error: 'Action Denied: Insufficient stock to fulfill or invoice this order.',
                            item_name: item.item_name,
                            stock_available: stock,
                            quantity_required: ordered
                        });
                    }
                }
            }
        }

        // 3. Generate next invoice number
        const countResult = await pool.query('SELECT COUNT(*) FROM invoices');
        const count = parseInt(countResult.rows[0].count) + 1;
        const invoice_number = 'INV-' + String(count).padStart(6, '0');

        // 4. Create the invoice
        const invoiceResult = await pool.query(
            `INSERT INTO invoices (invoice_number, invoice_date, order_number, customer_id, customer_name, salesperson_name, payment_terms, status, notes, sub_total, discount, discount_type, discount_value, shipping_charges, adjustment, total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING *`,
            [invoice_number, new Date(), order.order_number, order.customer_id, order.customer_name, order.salesperson_name, order.payment_terms, 'DRAFT', order.notes || '', order.sub_total || 0, order.discount || 0, order.discount_type || '%', order.discount_value || 0, order.shipping_charges || 0, order.adjustment || 0, order.total || 0]
        );
        const invoice = invoiceResult.rows[0];

        // 5. Copy sales order items to invoice items
        for (const item of items) {
            await pool.query(
                `INSERT INTO invoice_items (invoice_id, item_name, quantity, rate, tax, amount, discounts)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [invoice.id, item.item_name, item.quantity || 1, item.rate || 0, item.tax, item.amount || 0, JSON.stringify(item.discounts || [])]
            );
        }

        // 6. Check dual-requirement for closing: only close if both invoiced AND shipped
        await checkAndCloseSalesOrder(pool, order.id);

        res.status(201).json({ invoice_id: invoice.id, invoice_number: invoice.invoice_number });
    } catch (err) {
        console.error('Error converting sales order to invoice:', err);
        res.status(500).json({ error: 'Failed to convert sales order to invoice' });
    }
});

// PUT update entire sales order
router.put('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const {
            order_date,
            reference_number,
            customer_id,
            customer_name,
            salesperson_name,
            payment_terms,
            delivery_method,
            expected_shipment_date,
            status,
            notes,
            sub_total,
            discount,
            discount_type,
            discount_value,
            shipping_charges,
            adjustment,
            total,
            items
        } = req.body;

        const result = await pool.query(
            `UPDATE sales_orders SET
                order_date = $1, reference_number = $2, customer_id = $3, customer_name = $4,
                salesperson_name = $5, payment_terms = $6, delivery_method = $7,
                expected_shipment_date = $8, status = $9, notes = $10, sub_total = $11,
                discount = $12, discount_type = $13, discount_value = $14,
                shipping_charges = $15, adjustment = $16, total = $17
             WHERE id = $18 RETURNING *`,
            [order_date || new Date(), reference_number, customer_id, customer_name, salesperson_name, payment_terms, delivery_method || '', expected_shipment_date || null, status || 'DRAFT', notes, sub_total || 0, discount || 0, discount_type || '%', discount_value || 0, shipping_charges || 0, adjustment || 0, total || 0, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sales order not found' });
        }

        const order = result.rows[0];

        // Replace items: delete old, insert new
        await pool.query('DELETE FROM sales_order_items WHERE sales_order_id = $1', [order.id]);
        if (items && items.length > 0) {
            for (const item of items) {
                await pool.query(
                    `INSERT INTO sales_order_items (sales_order_id, item_id, item_name, quantity, rate, tax, amount, discounts)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [order.id, item.item_id || null, item.item_name, item.quantity || 1, item.rate || 0, item.tax, item.amount || 0, JSON.stringify(item.discounts || [])]
                );
            }
        }

        res.json(order);
    } catch (err) {
        console.error('Error updating sales order:', err);
        res.status(500).json({ error: 'Failed to update sales order' });
    }
});

// PUT update sales order status
router.put('/:id/status', async (req, res) => {
    try {
        const pool = database.getDb();
        const { status } = req.body;
        const result = await pool.query(
            'UPDATE sales_orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sales order not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating sales order status:', err);
        res.status(500).json({ error: 'Failed to update sales order status' });
    }
});

// DELETE sales order
router.delete('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        await pool.query('DELETE FROM sales_order_items WHERE sales_order_id = $1', [req.params.id]);
        await pool.query('DELETE FROM sales_orders WHERE id = $1', [req.params.id]);
        res.json({ message: 'Sales order deleted' });
    } catch (err) {
        console.error('Error deleting sales order:', err);
        res.status(500).json({ error: 'Failed to delete sales order' });
    }
});

// Dual-requirement check: only close SO when both invoiced AND fully shipped
async function checkAndCloseSalesOrder(pool, salesOrderId) {
    if (!salesOrderId) return;
    try {
        // Get current SO status
        const soResult = await pool.query('SELECT * FROM sales_orders WHERE id = $1', [salesOrderId]);
        if (soResult.rows.length === 0) return;
        const so = soResult.rows[0];
        const currentStatus = (so.status || '').toUpperCase();

        // Don't re-close or touch cancelled orders
        if (currentStatus === 'CLOSED' || currentStatus === 'CANCELLED') return;

        // Check 1: Has an invoice been created for this SO?
        const invoiceResult = await pool.query(
            "SELECT id FROM invoices WHERE order_number = $1 LIMIT 1",
            [so.order_number]
        );
        const hasInvoice = invoiceResult.rows.length > 0;

        // Check 2: Are all items fully shipped? (all packages shipped/delivered)
        const pkgResult = await pool.query(
            'SELECT id, status FROM packages WHERE sales_order_id = $1',
            [salesOrderId]
        );
        const packages = pkgResult.rows;
        const hasShipment = packages.length > 0 && packages.every(p => {
            const s = (p.status || '').toUpperCase();
            return s === 'SHIPPED' || s === 'DELIVERED';
        });

        // Only close if BOTH conditions are met
        if (hasInvoice && hasShipment) {
            await pool.query(
                'UPDATE sales_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['CLOSED', salesOrderId]
            );
            console.log(`Sales order ${salesOrderId} CLOSED (both invoiced and shipped)`);
        }
    } catch (err) {
        console.error('Error in checkAndCloseSalesOrder:', err);
    }
}

module.exports = router;
module.exports.checkAndCloseSalesOrder = checkAndCloseSalesOrder;
