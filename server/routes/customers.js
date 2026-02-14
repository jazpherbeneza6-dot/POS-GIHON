const express = require('express');
const router = express.Router();
const database = require('../database');

// Get all customers
router.get('/', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(`
      SELECT * FROM customers
      ORDER BY display_name ASC
    `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Bulk delete customers
router.post('/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'An array of customer IDs is required' });
        }

        const db = database.getDb();
        await db.query('DELETE FROM customers WHERE id = ANY($1::int[])', [ids]);

        res.json({ message: `${ids.length} customer${ids.length > 1 ? 's' : ''} deleted successfully` });
    } catch (error) {
        console.error('Error bulk deleting customers:', error);
        res.status(500).json({ error: 'Failed to delete customers' });
    }
});

// Bulk update customer status
router.post('/bulk-status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'An array of customer IDs is required' });
        }
        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: 'Status must be "active" or "inactive"' });
        }

        const db = database.getDb();
        await db.query(
            'UPDATE customers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2::int[])',
            [status, ids]
        );

        res.json({ message: `${ids.length} customer${ids.length > 1 ? 's' : ''} marked as ${status}` });
    } catch (error) {
        console.error('Error updating customer status:', error);
        res.status(500).json({ error: 'Failed to update customer status' });
    }
});

// Bulk update customer fields
router.post('/bulk-update', async (req, res) => {
    try {
        const { ids, updates } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'An array of customer IDs is required' });
        }
        if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'At least one field to update is required' });
        }

        const allowedFields = ['customer_type', 'tax_rate', 'payment_terms'];
        const setClauses = [];
        const values = [];
        let paramIdx = 1;

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                setClauses.push(`${field} = $${paramIdx++}`);
                values.push(updates[field]);
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(ids);

        const db = database.getDb();
        await db.query(
            `UPDATE customers SET ${setClauses.join(', ')} WHERE id = ANY($${paramIdx}::int[])`,
            values
        );

        res.json({ message: `${ids.length} customer${ids.length > 1 ? 's' : ''} updated successfully` });
    } catch (error) {
        console.error('Error bulk updating customers:', error);
        res.status(500).json({ error: 'Failed to update customers' });
    }
});

// Get single customer by ID
router.get('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Create customer
router.post('/', async (req, res) => {
    try {
        const {
            customer_type, salutation, first_name, last_name,
            company_name, display_name, email, work_phone,
            mobile, website, payment_terms, currency,
            billing_street, billing_city, billing_state, billing_zip, billing_country,
            shipping_street, shipping_city, shipping_state, shipping_zip, shipping_country
        } = req.body;

        if (!display_name || display_name.trim() === '') {
            return res.status(400).json({ error: 'Display name is required' });
        }

        const db = database.getDb();
        const result = await db.query(`
      INSERT INTO customers (customer_type, salutation, first_name, last_name,
        company_name, display_name, email, work_phone, mobile, website, payment_terms, currency,
        billing_street, billing_city, billing_state, billing_zip, billing_country,
        shipping_street, shipping_city, shipping_state, shipping_zip, shipping_country)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `, [
            customer_type || 'Business',
            salutation || null,
            first_name || null,
            last_name || null,
            company_name || null,
            display_name.trim(),
            email || null,
            work_phone || null,
            mobile || null,
            website || null,
            payment_terms || null,
            currency || 'PHP',
            billing_street || null,
            billing_city || null,
            billing_state || null,
            billing_zip || null,
            billing_country || null,
            shipping_street || null,
            shipping_city || null,
            shipping_state || null,
            shipping_zip || null,
            shipping_country || null
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating customer:', error);
        res.status(500).json({ error: error.message || 'Failed to create customer' });
    }
});

// Update customer (with change tracking)
router.put('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const checkResult = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const oldCustomer = checkResult.rows[0];

        const fields = [
            'customer_type', 'salutation', 'first_name', 'last_name',
            'company_name', 'display_name', 'email', 'work_phone',
            'mobile', 'website', 'payment_terms', 'currency', 'status',
            'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
            'shipping_street', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country'
        ];

        const updates = [];
        const values = [];
        let paramIndex = 1;
        const changes = [];

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                const newVal = req.body[field] || null;
                const oldVal = oldCustomer[field] || null;
                updates.push(`${field} = $${paramIndex++}`);
                values.push(newVal);

                // Track changes (compare as strings)
                const oldStr = oldVal ? String(oldVal) : '';
                const newStr = newVal ? String(newVal) : '';
                if (oldStr !== newStr) {
                    changes.push({ field, oldVal: oldStr, newVal: newStr });
                }
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);
        const query = `UPDATE customers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

        const result = await db.query(query, values);

        // Log changes to customer_changes table
        if (changes.length > 0) {
            for (const change of changes) {
                await db.query(
                    'INSERT INTO customer_changes (customer_id, field_name, old_value, new_value) VALUES ($1, $2, $3, $4)',
                    [req.params.id, change.field, change.oldVal, change.newVal]
                );
            }
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).json({ error: error.message || 'Failed to update customer' });
    }
});

// Get customer change history
router.get('/:id/changes', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(
            'SELECT * FROM customer_changes WHERE customer_id = $1 ORDER BY changed_at DESC',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching customer changes:', error);
        res.status(500).json({ error: 'Failed to fetch changes' });
    }
});

// Get contact persons for a customer
router.get('/:id/contacts', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(
            'SELECT * FROM contact_persons WHERE customer_id = $1 ORDER BY id ASC',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching contact persons:', error);
        res.status(500).json({ error: 'Failed to fetch contact persons' });
    }
});

// Save contact persons (replace all for a customer)
router.post('/:id/contacts', async (req, res) => {
    try {
        const db = database.getDb();
        const { contacts } = req.body;

        // Delete existing contact persons
        await db.query('DELETE FROM contact_persons WHERE customer_id = $1', [req.params.id]);

        // Insert new contact persons
        if (contacts && contacts.length > 0) {
            for (const cp of contacts) {
                // Skip empty rows (no name or email)
                if (!cp.first_name && !cp.last_name && !cp.email) continue;
                await db.query(
                    `INSERT INTO contact_persons (customer_id, salutation, first_name, last_name, email, work_phone, mobile)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [req.params.id, cp.salutation || null, cp.first_name || null, cp.last_name || null,
                    cp.email || null, cp.work_phone || null, cp.mobile || null]
                );
            }
        }

        const result = await db.query(
            'SELECT * FROM contact_persons WHERE customer_id = $1 ORDER BY id ASC',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error saving contact persons:', error);
        res.status(500).json({ error: 'Failed to save contact persons' });
    }
});

// Delete customer
router.delete('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const checkResult = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        await db.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
        res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ error: error.message || 'Failed to delete customer' });
    }
});

module.exports = router;
