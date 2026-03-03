const express = require('express');
const router = express.Router();
const database = require('../database');

// All vendor fields for INSERT/UPDATE
const VENDOR_FIELDS = [
  'name', 'salutation', 'first_name', 'last_name', 'company_name', 'display_name',
  'email', 'phone', 'work_phone', 'mobile', 'address', 'notes',
  'currency', 'payment_terms', 'tax_rate', 'company_id_number', 'vendor_language',
  'billing_attention', 'billing_address', 'billing_city', 'billing_state', 'billing_zip', 'billing_country', 'billing_phone',
  'shipping_attention', 'shipping_address', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country', 'shipping_phone',
  'remarks', 'status', 'enable_portal', 'contact_person'
];

// Get all suppliers
router.get('/', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      WITH supplier_names AS (
        SELECT DISTINCT LOWER(name) AS norm_name, name AS display_name
        FROM suppliers
        UNION
        SELECT DISTINCT LOWER(supplier_name) AS norm_name, supplier_name AS display_name
        FROM purchases
        WHERE supplier_name IS NOT NULL AND supplier_name <> ''
      ),
      supplier_details AS (
        SELECT sn.norm_name,
               sn.display_name AS sn_display_name,
               s.*
        FROM supplier_names sn
        LEFT JOIN suppliers s ON LOWER(s.name) = sn.norm_name
      ),
      agg AS (
        SELECT LOWER(COALESCE(s.name, p.supplier_name)) AS norm_name,
               SUM(pi.quantity)::int AS total_quantity,
               SUM(p.total_amount)::numeric(12,2) AS total_spent
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
        WHERE COALESCE(p.supplier_name, '') <> '' OR p.supplier_id IS NOT NULL
        GROUP BY LOWER(COALESCE(s.name, p.supplier_name))
      )
      SELECT
        sd.id,
        COALESCE(sd.name, sd.sn_display_name) AS name,
        sd.contact_person,
        sd.email,
        sd.phone,
        sd.work_phone,
        sd.mobile,
        sd.company_name,
        sd.display_name,
        sd.first_name,
        sd.last_name,
        sd.address,
        sd.notes,
        sd.currency,
        sd.payment_terms,
        sd.status,
        COALESCE(a.total_quantity, 0) AS total_quantity,
        COALESCE(a.total_spent, 0)::numeric(12,2) AS total_spent
      FROM supplier_details sd
      LEFT JOIN agg a ON a.norm_name = sd.norm_name
      ORDER BY COALESCE(sd.name, sd.sn_display_name) ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// Get single supplier by ID (with contact persons)
router.get('/:id', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT s.*,
             COALESCE(q.total_quantity, 0) AS total_quantity,
             COALESCE(ps.total_spent, 0)::numeric(12,2) AS total_spent,
             COALESCE(vc.unused_credits, 0)::numeric(12,2) AS unused_credits
      FROM suppliers s
      LEFT JOIN (
        SELECT p.supplier_id, SUM(pi.quantity)::int AS total_quantity
        FROM purchases p
        JOIN purchase_items pi ON p.id = pi.purchase_id
        GROUP BY p.supplier_id
      ) q ON s.id = q.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount)::numeric(12,2) AS total_spent
        FROM purchases
        WHERE LOWER(COALESCE(status, 'ordered')) = 'received'
        GROUP BY supplier_id
      ) ps ON s.id = ps.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount)::numeric(12,2) AS unused_credits
        FROM vendor_credits
        WHERE LOWER(status) = 'open'
        GROUP BY supplier_id
      ) vc ON s.id = vc.supplier_id
      WHERE s.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const vendor = result.rows[0];

    // Get contact persons
    const contactsResult = await db.query(
      'SELECT * FROM vendor_contact_persons WHERE vendor_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    vendor.contact_persons = contactsResult.rows;

    // Get vendor credits for this vendor (open status for statement)
    const creditsResult = await db.query(
      `SELECT id, credit_number, credit_date, total_amount, status
       FROM vendor_credits
       WHERE supplier_id = $1 AND LOWER(status) = 'open'
       ORDER BY credit_date DESC`,
      [req.params.id]
    );
    vendor.vendor_credits = creditsResult.rows;

    res.json(vendor);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

// Create supplier
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Use display_name or name as the primary name
    const nameValue = (body.display_name || body.name || '').trim();
    if (!nameValue) {
      return res.status(400).json({ error: 'Display name or supplier name is required' });
    }

    // Set name = display_name if not provided
    if (!body.name) body.name = nameValue;

    const db = database.getDb();

    // Build dynamic insert
    const columns = [];
    const placeholders = [];
    const values = [];
    let idx = 1;

    for (const field of VENDOR_FIELDS) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        columns.push(field);
        placeholders.push(`$${idx++}`);
        if (field === 'enable_portal') {
          values.push(body[field] === true || body[field] === 'true');
        } else {
          values.push(body[field]);
        }
      }
    }

    const query = `INSERT INTO suppliers (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await db.query(query, values);
    const vendor = result.rows[0];

    // Save contact persons if provided
    if (body.contact_persons && Array.isArray(body.contact_persons)) {
      for (const cp of body.contact_persons) {
        if (cp.first_name || cp.last_name || cp.email) {
          await db.query(
            `INSERT INTO vendor_contact_persons (vendor_id, salutation, first_name, last_name, email, phone)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [vendor.id, cp.salutation || null, cp.first_name || null, cp.last_name || null, cp.email || null, cp.phone || null]
          );
        }
      }
    }

    res.status(201).json(vendor);
  } catch (error) {
    console.error('Error creating supplier:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Supplier name already exists' });
    } else {
      res.status(500).json({ error: error.message || 'Failed to create supplier' });
    }
  }
});

// Update supplier
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;
    const db = database.getDb();

    const checkResult = await db.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of VENDOR_FIELDS) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        if (field === 'enable_portal') {
          values.push(body[field] === true || body[field] === 'true');
        } else {
          values.push(body[field] || null);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    const query = `UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await db.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating supplier:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'Supplier name already exists' });
    } else {
      res.status(500).json({ error: error.message || 'Failed to update supplier' });
    }
  }
});

// Delete supplier
router.delete('/:id', async (req, res) => {
  try {
    const db = database.getDb();

    const checkResult = await db.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Delete related contact persons first
    await db.query('DELETE FROM vendor_contact_persons WHERE vendor_id = $1', [req.params.id]);

    // Nullify supplier_id in purchases referencing this supplier
    await db.query('UPDATE purchases SET supplier_id = NULL WHERE supplier_id = $1', [req.params.id]);

    // Delete the supplier
    await db.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: error.message || 'Failed to delete supplier' });
  }
});

// ========== Vendor Contact Persons ==========

// Get contact persons for a vendor
router.get('/:id/contacts', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(
      'SELECT * FROM vendor_contact_persons WHERE vendor_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching vendor contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Add contact person to vendor
router.post('/:id/contacts', async (req, res) => {
  try {
    const { salutation, first_name, last_name, email, phone } = req.body;
    const db = database.getDb();
    const result = await db.query(
      `INSERT INTO vendor_contact_persons (vendor_id, salutation, first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, salutation || null, first_name || null, last_name || null, email || null, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding vendor contact:', error);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// Delete contact person
router.delete('/:id/contacts/:contactId', async (req, res) => {
  try {
    const db = database.getDb();
    await db.query('DELETE FROM vendor_contact_persons WHERE id = $1 AND vendor_id = $2', [req.params.contactId, req.params.id]);
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    console.error('Error deleting vendor contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

module.exports = router;
