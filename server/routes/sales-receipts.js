const express = require('express');
const router = express.Router();
const database = require('../database');

// GET all sales receipts
router.get('/', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query('SELECT * FROM sales_receipts ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching sales receipts:', err);
        res.status(500).json({ error: 'Failed to fetch sales receipts' });
    }
});

// GET next available receipt number
router.get('/next-number', async (req, res) => {
    try {
        const pool = database.getDb();
        const result = await pool.query("SELECT MAX(CAST(SUBSTRING(receipt_number FROM 4) AS INTEGER)) as max_num FROM sales_receipts WHERE receipt_number LIKE 'SR-%'");
        const nextNum = (parseInt(result.rows[0]?.max_num) || 0) + 1;
        const receipt_number = 'SR-' + String(nextNum).padStart(5, '0');
        res.json({ receipt_number });
    } catch (err) {
        console.error('Error getting next receipt number:', err);
        res.status(500).json({ error: 'Failed to get next receipt number' });
    }
});

// GET single sales receipt by ID
router.get('/:id', async (req, res) => {
    try {
        const pool = database.getDb();
        const receiptResult = await pool.query(
            `SELECT sr.*, c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country
             FROM sales_receipts sr
             LEFT JOIN customers c ON sr.customer_id = c.id
             WHERE sr.id = $1`,
            [req.params.id]
        );
        if (receiptResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sales receipt not found' });
        }
        const receipt = receiptResult.rows[0];

        const itemsResult = await pool.query('SELECT * FROM sales_receipt_items WHERE sales_receipt_id = $1', [receipt.id]);
        receipt.items = itemsResult.rows;

        res.json(receipt);
    } catch (err) {
        console.error('Error fetching sales receipt:', err);
        res.status(500).json({ error: 'Failed to fetch sales receipt' });
    }
});

// ============================================================
// POST create new sales receipt (with stock + accounting triggers)
// ============================================================
router.post('/', async (req, res) => {
    try {
        const result = await database.transaction(async (client) => {
            const {
                receipt_date, reference_number, customer_id, customer_name,
                salesperson_name, payment_mode, deposit_to, status,
                notes, terms_conditions, sub_total, discount,
                shipping_charges, adjustment, total, items, attachments
            } = req.body;

            const finalStatus = status || 'PAID';

            // Stock validation
            if (finalStatus === 'PAID' && items && items.length > 0) {
                for (const item of items) {
                    if (!item.item_id) continue;
                    const stockCheck = await client.query(
                        'SELECT stock_quantity, name FROM items WHERE id = $1', [item.item_id]
                    );
                    if (stockCheck.rows.length > 0) {
                        const available = parseFloat(stockCheck.rows[0].stock_quantity) || 0;
                        const requested = parseFloat(item.quantity) || 0;
                        if (requested > available) {
                            throw { statusCode: 400, message: `Cannot complete sale. Insufficient stock for ${stockCheck.rows[0].name}. Available: ${available}, Requested: ${requested}` };
                        }
                    }
                }
            }

            // Generate receipt number (always use max existing + 1)
            const maxResult = await client.query("SELECT MAX(CAST(SUBSTRING(receipt_number FROM 4) AS INTEGER)) as max_num FROM sales_receipts WHERE receipt_number LIKE 'SR-%'");
            const nextNum = (parseInt(maxResult.rows[0]?.max_num) || 0) + 1;
            const receipt_number = 'SR-' + String(nextNum).padStart(5, '0');

            const insertResult = await client.query(
                `INSERT INTO sales_receipts (receipt_number, receipt_date, reference_number, customer_id, customer_name, salesperson_name, payment_mode, deposit_to, status, notes, terms_conditions, sub_total, discount, shipping_charges, adjustment, total, stock_deducted, attachments)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                 RETURNING *`,
                [receipt_number, receipt_date || new Date(), reference_number, customer_id, customer_name, salesperson_name, payment_mode || '', deposit_to || '', finalStatus, notes, terms_conditions, sub_total || 0, discount || 0, shipping_charges || 0, adjustment || 0, total || 0, finalStatus === 'PAID', JSON.stringify(attachments || [])]
            );
            const receipt = insertResult.rows[0];

            // Insert receipt items
            if (items && items.length > 0) {
                for (const item of items) {
                    await client.query(
                        `INSERT INTO sales_receipt_items (sales_receipt_id, item_id, item_name, quantity, rate, tax, amount, discounts)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [receipt.id, item.item_id || null, item.item_name, item.quantity || 1, item.rate || 0, item.tax || null, item.amount || 0, JSON.stringify(item.discounts || [])]
                    );
                }
            }

            // Stock deduction + inventory transactions + accounting (only for PAID)
            if (finalStatus === 'PAID' && items && items.length > 0) {
                let totalCOGS = 0;
                for (const item of items) {
                    if (!item.item_id) continue;
                    const qty = parseFloat(item.quantity) || 0;

                    // Deduct stock
                    await client.query(
                        'UPDATE items SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                        [qty, item.item_id]
                    );

                    // Inventory transaction (OUT)
                    await client.query(
                        `INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
                         VALUES ($1, 'OUT', $2, $3, $4)`,
                        [item.item_id, qty, receipt_number, 'Sales Receipt - Stock Out']
                    );

                    // Get purchase_cost for COGS
                    const costResult = await client.query('SELECT purchase_cost FROM items WHERE id = $1', [item.item_id]);
                    const unitCost = parseFloat(costResult.rows[0]?.purchase_cost) || 0;
                    totalCOGS += unitCost * qty;
                }

                // Accounting entries
                const entryDate = receipt_date || new Date();
                const receiptTotal = parseFloat(total) || 0;
                const depositAccount = deposit_to || 'Cash';

                // Debit Cash/Bank, Credit Sales Revenue
                await client.query(
                    `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                     VALUES ($1, 'CASH_IN', $2, $3, 0, $4, 'SALES_RECEIPT', $5)`,
                    [entryDate, depositAccount, receiptTotal, receipt_number, 'Cash received from sale']
                );
                await client.query(
                    `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                     VALUES ($1, 'REVENUE', 'Sales Revenue', 0, $2, $3, 'SALES_RECEIPT', $4)`,
                    [entryDate, receiptTotal, receipt_number, 'Revenue from Sales Receipt']
                );

                // Debit COGS, Credit Inventory
                if (totalCOGS > 0) {
                    await client.query(
                        `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                         VALUES ($1, 'COGS', 'Cost of Goods Sold', $2, 0, $3, 'SALES_RECEIPT', $4)`,
                        [entryDate, totalCOGS, receipt_number, 'COGS for Sales Receipt']
                    );
                    await client.query(
                        `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                         VALUES ($1, 'COGS', 'Inventory', 0, $2, $3, 'SALES_RECEIPT', $4)`,
                        [entryDate, totalCOGS, receipt_number, 'Inventory reduction for COGS']
                    );
                }
            }

            return receipt;
        });

        res.status(201).json(result);
    } catch (err) {
        if (err.statusCode === 400) {
            return res.status(400).json({ error: err.message });
        }
        console.error('Error creating sales receipt:', err);
        res.status(500).json({ error: 'Failed to create sales receipt' });
    }
});

// ============================================================
// PUT update entire sales receipt (reverse old, reapply new)
// ============================================================
router.put('/:id', async (req, res) => {
    try {
        const result = await database.transaction(async (client) => {
            const {
                receipt_date, reference_number, customer_id, customer_name,
                salesperson_name, payment_mode, deposit_to, status,
                notes, terms_conditions, sub_total, discount,
                shipping_charges, adjustment, total, items, attachments
            } = req.body;

            const finalStatus = status || 'PAID';

            // Get current receipt state
            const currentResult = await client.query('SELECT * FROM sales_receipts WHERE id = $1', [req.params.id]);
            if (currentResult.rows.length === 0) {
                throw { statusCode: 404, message: 'Sales receipt not found' };
            }
            const current = currentResult.rows[0];

            // If previously stock was deducted, reverse it
            if (current.stock_deducted) {
                const oldItems = await client.query(
                    'SELECT * FROM sales_receipt_items WHERE sales_receipt_id = $1', [current.id]
                );
                for (const oldItem of oldItems.rows) {
                    if (!oldItem.item_id) continue;
                    const qty = parseFloat(oldItem.quantity) || 0;
                    await client.query(
                        'UPDATE items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
                        [qty, oldItem.item_id]
                    );
                }
                // Delete old inventory transactions and accounting entries
                await client.query(
                    "DELETE FROM inventory_transactions WHERE reference = $1",
                    [current.receipt_number]
                );
                await client.query(
                    "DELETE FROM accounting_entries WHERE reference_number = $1 AND reference_type = 'SALES_RECEIPT'",
                    [current.receipt_number]
                );
            }

            // Validate new stock
            if (finalStatus === 'PAID' && items && items.length > 0) {
                for (const item of items) {
                    if (!item.item_id) continue;
                    const stockCheck = await client.query(
                        'SELECT stock_quantity, name FROM items WHERE id = $1', [item.item_id]
                    );
                    if (stockCheck.rows.length > 0) {
                        const available = parseFloat(stockCheck.rows[0].stock_quantity) || 0;
                        const requested = parseFloat(item.quantity) || 0;
                        if (requested > available) {
                            throw { statusCode: 400, message: `Cannot complete sale. Insufficient stock for ${stockCheck.rows[0].name}. Available: ${available}, Requested: ${requested}` };
                        }
                    }
                }
            }

            // Update receipt
            const updateResult = await client.query(
                `UPDATE sales_receipts SET
                    receipt_date = $1, reference_number = $2, customer_id = $3, customer_name = $4,
                    salesperson_name = $5, payment_mode = $6, deposit_to = $7, status = $8,
                    notes = $9, terms_conditions = $10, sub_total = $11, discount = $12,
                    shipping_charges = $13, adjustment = $14, total = $15, stock_deducted = $16, attachments = $17
                 WHERE id = $18 RETURNING *`,
                [receipt_date || new Date(), reference_number, customer_id, customer_name,
                    salesperson_name, payment_mode || '', deposit_to || '', finalStatus,
                    notes, terms_conditions, sub_total || 0, discount || 0,
                shipping_charges || 0, adjustment || 0, total || 0,
                finalStatus === 'PAID', JSON.stringify(attachments || []), req.params.id]
            );
            const receipt = updateResult.rows[0];

            // Delete old items and re-insert
            await client.query('DELETE FROM sales_receipt_items WHERE sales_receipt_id = $1', [receipt.id]);
            if (items && items.length > 0) {
                for (const item of items) {
                    await client.query(
                        `INSERT INTO sales_receipt_items (sales_receipt_id, item_id, item_name, quantity, rate, tax, amount, discounts)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [receipt.id, item.item_id || null, item.item_name, item.quantity || 1, item.rate || 0, item.tax || null, item.amount || 0, JSON.stringify(item.discounts || [])]
                    );
                }
            }

            // Re-deduct stock and create accounting (only for PAID)
            if (finalStatus === 'PAID' && items && items.length > 0) {
                let totalCOGS = 0;
                for (const item of items) {
                    if (!item.item_id) continue;
                    const qty = parseFloat(item.quantity) || 0;

                    await client.query(
                        'UPDATE items SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                        [qty, item.item_id]
                    );
                    await client.query(
                        `INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
                         VALUES ($1, 'OUT', $2, $3, $4)`,
                        [item.item_id, qty, receipt.receipt_number, 'Sales Receipt - Stock Out (Edit)']
                    );

                    const costResult = await client.query('SELECT purchase_cost FROM items WHERE id = $1', [item.item_id]);
                    const unitCost = parseFloat(costResult.rows[0]?.purchase_cost) || 0;
                    totalCOGS += unitCost * qty;
                }

                const entryDate = receipt_date || new Date();
                const receiptTotal = parseFloat(total) || 0;
                const depositAccount = deposit_to || 'Cash';

                await client.query(
                    `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                     VALUES ($1, 'CASH_IN', $2, $3, 0, $4, 'SALES_RECEIPT', $5)`,
                    [entryDate, depositAccount, receiptTotal, receipt.receipt_number, 'Cash received from sale (Edit)']
                );
                await client.query(
                    `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                     VALUES ($1, 'REVENUE', 'Sales Revenue', 0, $2, $3, 'SALES_RECEIPT', $4)`,
                    [entryDate, receiptTotal, receipt.receipt_number, 'Revenue from Sales Receipt (Edit)']
                );
                if (totalCOGS > 0) {
                    await client.query(
                        `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                         VALUES ($1, 'COGS', 'Cost of Goods Sold', $2, 0, $3, 'SALES_RECEIPT', $4)`,
                        [entryDate, totalCOGS, receipt.receipt_number, 'COGS for Sales Receipt (Edit)']
                    );
                    await client.query(
                        `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                         VALUES ($1, 'COGS', 'Inventory', 0, $2, $3, 'SALES_RECEIPT', $4)`,
                        [entryDate, totalCOGS, receipt.receipt_number, 'Inventory reduction for COGS (Edit)']
                    );
                }
            }

            return receipt;
        });

        res.json(result);
    } catch (err) {
        if (err.statusCode === 400) return res.status(400).json({ error: err.message });
        if (err.statusCode === 404) return res.status(404).json({ error: err.message });
        console.error('Error updating sales receipt:', err);
        res.status(500).json({ error: 'Failed to update sales receipt' });
    }
});

// ============================================================
// PUT update sales receipt status (used for VOID)
// ============================================================
router.put('/:id/status', async (req, res) => {
    try {
        const result = await database.transaction(async (client) => {
            const { status } = req.body;

            const currentResult = await client.query('SELECT * FROM sales_receipts WHERE id = $1', [req.params.id]);
            if (currentResult.rows.length === 0) {
                throw { statusCode: 404, message: 'Sales receipt not found' };
            }
            const current = currentResult.rows[0];

            // If voiding a receipt that had stock deducted, reverse everything
            if (status === 'VOID' && current.stock_deducted) {
                const receiptItems = await client.query(
                    'SELECT * FROM sales_receipt_items WHERE sales_receipt_id = $1', [current.id]
                );
                let totalCOGS = 0;
                for (const item of receiptItems.rows) {
                    if (!item.item_id) continue;
                    const qty = parseFloat(item.quantity) || 0;

                    // Restock
                    await client.query(
                        'UPDATE items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
                        [qty, item.item_id]
                    );

                    // Inventory transaction (IN - void reversal)
                    await client.query(
                        `INSERT INTO inventory_transactions (item_id, type, quantity, reference, notes)
                         VALUES ($1, 'IN', $2, $3, $4)`,
                        [item.item_id, qty, current.receipt_number + ' (VOID)', 'Void reversal - Stock In']
                    );

                    const costResult = await client.query('SELECT purchase_cost FROM items WHERE id = $1', [item.item_id]);
                    const unitCost = parseFloat(costResult.rows[0]?.purchase_cost) || 0;
                    totalCOGS += unitCost * qty;
                }

                // Reversal accounting entries
                const receiptTotal = parseFloat(current.total) || 0;
                const depositAccount = current.deposit_to || 'Cash';
                const entryDate = new Date();

                // Reverse Cash/Revenue
                await client.query(
                    `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                     VALUES ($1, 'VOID_REVERSAL', $2, 0, $3, $4, 'SALES_RECEIPT', $5)`,
                    [entryDate, depositAccount, receiptTotal, current.receipt_number, 'Void reversal - Cash returned']
                );
                await client.query(
                    `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                     VALUES ($1, 'VOID_REVERSAL', 'Sales Revenue', $2, 0, $3, 'SALES_RECEIPT', $4)`,
                    [entryDate, receiptTotal, current.receipt_number, 'Void reversal - Revenue reversed']
                );

                // Reverse COGS
                if (totalCOGS > 0) {
                    await client.query(
                        `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                         VALUES ($1, 'VOID_REVERSAL', 'Inventory', $2, 0, $3, 'SALES_RECEIPT', $4)`,
                        [entryDate, totalCOGS, current.receipt_number, 'Void reversal - Inventory restored']
                    );
                    await client.query(
                        `INSERT INTO accounting_entries (entry_date, entry_type, account_name, debit, credit, reference_number, reference_type, description)
                         VALUES ($1, 'VOID_REVERSAL', 'Cost of Goods Sold', 0, $2, $3, 'SALES_RECEIPT', $4)`,
                        [entryDate, totalCOGS, current.receipt_number, 'Void reversal - COGS reversed']
                    );
                }
            }

            const updateResult = await client.query(
                'UPDATE sales_receipts SET status = $1, stock_deducted = $2 WHERE id = $3 RETURNING *',
                [status, status === 'VOID' ? false : current.stock_deducted, req.params.id]
            );
            return updateResult.rows[0];
        });

        res.json(result);
    } catch (err) {
        if (err.statusCode === 404) return res.status(404).json({ error: err.message });
        console.error('Error updating sales receipt status:', err);
        res.status(500).json({ error: 'Failed to update sales receipt status' });
    }
});

// ============================================================
// DELETE sales receipt (restock if needed, clean up all records)
// ============================================================
router.delete('/:id', async (req, res) => {
    try {
        await database.transaction(async (client) => {
            const currentResult = await client.query('SELECT * FROM sales_receipts WHERE id = $1', [req.params.id]);
            if (currentResult.rows.length === 0) {
                throw { statusCode: 404, message: 'Sales receipt not found' };
            }
            const current = currentResult.rows[0];

            // If stock was deducted, reverse it
            if (current.stock_deducted) {
                const receiptItems = await client.query(
                    'SELECT * FROM sales_receipt_items WHERE sales_receipt_id = $1', [current.id]
                );
                for (const item of receiptItems.rows) {
                    if (!item.item_id) continue;
                    const qty = parseFloat(item.quantity) || 0;
                    await client.query(
                        'UPDATE items SET stock_quantity = stock_quantity + $1 WHERE id = $2',
                        [qty, item.item_id]
                    );
                }
            }

            // Clean up all related records
            await client.query("DELETE FROM inventory_transactions WHERE reference LIKE $1", [current.receipt_number + '%']);
            await client.query("DELETE FROM accounting_entries WHERE reference_number = $1 AND reference_type = 'SALES_RECEIPT'", [current.receipt_number]);
            await client.query('DELETE FROM sales_receipt_items WHERE sales_receipt_id = $1', [req.params.id]);
            await client.query('DELETE FROM sales_receipts WHERE id = $1', [req.params.id]);
        });

        res.json({ message: 'Sales receipt deleted' });
    } catch (err) {
        if (err.statusCode === 404) return res.status(404).json({ error: err.message });
        console.error('Error deleting sales receipt:', err);
        res.status(500).json({ error: 'Failed to delete sales receipt' });
    }
});

module.exports = router;
