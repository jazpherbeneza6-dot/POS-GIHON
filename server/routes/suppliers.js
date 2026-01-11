const express = require('express');
const router = express.Router();
const database = require('../database');

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
               sn.display_name,
               s.id,
               s.name,
               s.contact_person,
               s.email,
               s.phone,
               s.address,
               s.notes
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
        COALESCE(sd.name, sd.display_name) AS name,
        sd.contact_person,
        sd.email,
        sd.phone,
        sd.address,
        sd.notes,
        COALESCE(a.total_quantity, 0) AS total_quantity,
        COALESCE(a.total_spent, 0)::numeric(12,2) AS total_spent
      FROM supplier_details sd
      LEFT JOIN agg a ON a.norm_name = sd.norm_name
      ORDER BY COALESCE(sd.name, sd.display_name) ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// Get single supplier by ID
router.get('/:id', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(`
      SELECT s.*,
             COALESCE(q.total_quantity, 0) AS total_quantity,
             COALESCE(ps.total_spent, 0)::numeric(12,2) AS total_spent
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
      WHERE s.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

// Create supplier
router.post('/', async (req, res) => {
  try {
    const { name, contact_person, email, phone, address, notes } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const db = database.getDb();
    const result = await db.query(`
      INSERT INTO suppliers (name, contact_person, email, phone, address, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name.trim(), contact_person || null, email || null, phone || null, address || null, notes || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating supplier:', error);
    if (error.code === '23505') { // PostgreSQL unique violation
      res.status(400).json({ error: 'Supplier name already exists' });
    } else {
      res.status(500).json({ error: error.message || 'Failed to create supplier' });
    }
  }
});

// Update supplier
router.put('/:id', async (req, res) => {
  try {
    const { name, contact_person, email, phone, address, notes } = req.body;
    const db = database.getDb();

    // Check if supplier exists
    const checkResult = await db.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }
    if (contact_person !== undefined) {
      updates.push(`contact_person = $${paramIndex++}`);
      values.push(contact_person || null);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email || null);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone || null);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(address || null);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes || null);
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
    if (error.code === '23505') { // PostgreSQL unique violation
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

    // Check if supplier exists
    const checkResult = await db.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Check if supplier has purchases
    const purchasesResult = await db.query('SELECT COUNT(*) as count FROM purchases WHERE supplier_id = $1', [req.params.id]);
    if (parseInt(purchasesResult.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete supplier with existing purchases. Remove purchases first or set supplier_id to null.' });
    }

    await db.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: error.message || 'Failed to delete supplier' });
  }
});

module.exports = router;

