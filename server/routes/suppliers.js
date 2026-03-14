const express = require('express');
const router = express.Router();
const database = require('../database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure vendor contacts upload directory exists
const vendorContactUploadDir = path.join(__dirname, '../../public/uploads/vendor-contacts');
if (!fs.existsSync(vendorContactUploadDir)) {
  fs.mkdirSync(vendorContactUploadDir, { recursive: true });
}

const contactStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, vendorContactUploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const contactUpload = multer({
  storage: contactStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|bmp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

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
               SUM(p.total_amount)::numeric(12,3) AS total_spent
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
        sd.created_at,
        sd.updated_at,
        COALESCE(a.total_quantity, 0) AS total_quantity,
        COALESCE(a.total_spent, 0)::numeric(12,3) AS total_spent,
        COALESCE(ob.outstanding_fcy, 0)::numeric(12,3) AS payables,
        COALESCE(ob.outstanding_bcy, 0)::numeric(12,3) AS payables_bcy,
        COALESCE(uc.unused_credits_fcy, 0)::numeric(12,3) AS unused_credits,
        COALESCE(uc.unused_credits_bcy, 0)::numeric(12,3) AS unused_credits_bcy
      FROM supplier_details sd
      LEFT JOIN agg a ON a.norm_name = sd.norm_name
      LEFT JOIN (
        SELECT b.supplier_id,
          CASE WHEN ABS(SUM(b.total_amount) - COALESCE(SUM(tp.paid_fcy), 0)) < 0.001 THEN 0
               ELSE GREATEST(0, ROUND(SUM(b.total_amount) - COALESCE(SUM(tp.paid_fcy), 0), 3))
          END::numeric(12,3) AS outstanding_fcy,
          CASE WHEN ABS(SUM(b.total_amount * COALESCE(b.exchange_rate, 1)) - COALESCE(SUM(tp.paid_bcy), 0)) < 0.001 THEN 0
               ELSE GREATEST(0, ROUND(SUM(b.total_amount * COALESCE(b.exchange_rate, 1)) - COALESCE(SUM(tp.paid_bcy), 0), 3))
          END::numeric(12,3) AS outstanding_bcy
        FROM bills b
        LEFT JOIN (
          SELECT pm.bill_id,
            SUM(pm.amount_paid)::numeric(12,3) AS paid_fcy,
            SUM(ROUND(pm.amount_paid * COALESCE(bi.exchange_rate, 1), 3))::numeric(12,3) AS paid_bcy
          FROM payments_made pm
          JOIN bills bi ON pm.bill_id = bi.id
          WHERE UPPER(pm.status) = 'PAID'
          GROUP BY pm.bill_id
        ) tp ON tp.bill_id = b.id
        WHERE UPPER(COALESCE(b.status,'')) != 'DRAFT'
        GROUP BY b.supplier_id
      ) ob ON sd.id = ob.supplier_id
      LEFT JOIN (
        SELECT supplier_id,
          SUM(total_amount - COALESCE(refunded_amount, 0))::numeric(12,3) AS unused_credits_fcy,
          SUM((total_amount - COALESCE(refunded_amount, 0)) * COALESCE(exchange_rate, 1))::numeric(12,3) AS unused_credits_bcy
        FROM vendor_credits
        WHERE LOWER(status) = 'open'
        GROUP BY supplier_id
      ) uc ON sd.id = uc.supplier_id
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
             COALESCE(ps.total_spent, 0)::numeric(12,3) AS total_spent,
             COALESCE(vc.unused_credits, 0)::numeric(12,3) AS unused_credits,
             COALESCE(ob.outstanding, 0)::numeric(12,3) AS outstanding_payables
      FROM suppliers s
      LEFT JOIN (
        SELECT p.supplier_id, SUM(pi.quantity)::int AS total_quantity
        FROM purchases p
        JOIN purchase_items pi ON p.id = pi.purchase_id
        GROUP BY p.supplier_id
      ) q ON s.id = q.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount)::numeric(12,3) AS total_spent
        FROM purchases
        WHERE LOWER(COALESCE(status, 'ordered')) = 'received'
        GROUP BY supplier_id
      ) ps ON s.id = ps.supplier_id
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount - COALESCE(refunded_amount, 0))::numeric(12,3) AS unused_credits
        FROM vendor_credits
        WHERE LOWER(status) = 'open'
        GROUP BY supplier_id
      ) vc ON s.id = vc.supplier_id
      LEFT JOIN (
        SELECT b.supplier_id,
          CASE WHEN ABS(SUM(b.total_amount) - COALESCE(SUM(tp.paid), 0)) < 0.001 THEN 0
               ELSE GREATEST(0, ROUND(SUM(b.total_amount) - COALESCE(SUM(tp.paid), 0), 3))
          END::numeric(12,3) AS outstanding
        FROM bills b
        LEFT JOIN (
          SELECT pm.bill_id, SUM(pm.amount_paid)::numeric(12,3) AS paid
          FROM payments_made pm
          WHERE UPPER(pm.status) = 'PAID'
          GROUP BY pm.bill_id
        ) tp ON tp.bill_id = b.id
        WHERE UPPER(COALESCE(b.status,'')) != 'DRAFT'
        GROUP BY b.supplier_id
      ) ob ON s.id = ob.supplier_id
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

    // Get non-draft bills for this vendor (for statement) — HARD RULE: only Open, Overdue, Partially Paid
    const billsResult = await db.query(
      `SELECT id, bill_number, bill_date, total_amount, status,
              total_amount - COALESCE(
                (SELECT SUM(pm.amount_paid) FROM payments_made pm WHERE pm.bill_id = b.id AND UPPER(pm.status) = 'PAID'), 0
              ) AS balance_due
       FROM bills b
       WHERE supplier_id = $1 AND UPPER(COALESCE(status,'')) IN ('OPEN', 'OVERDUE', 'PARTIALLY PAID')
       ORDER BY bill_date ASC`,
      [req.params.id]
    );
    vendor.bills = billsResult.rows;

    // Get ALL bills (including drafts) for timeline display
    const allBillsResult = await db.query(
      `SELECT id, bill_number, bill_date, total_amount, status
       FROM bills
       WHERE supplier_id = $1
       ORDER BY bill_date ASC`,
      [req.params.id]
    );
    vendor.all_bills = allBillsResult.rows;

    // Get payments made for this vendor (for statement)
    const paymentsResult = await db.query(
      `SELECT id, payment_number, payment_date, amount_paid, reference_number, status
       FROM payments_made
       WHERE supplier_id = $1 AND UPPER(COALESCE(status,'')) = 'PAID'
       ORDER BY payment_date ASC`,
      [req.params.id]
    );
    vendor.payments_made = paymentsResult.rows;

    // Get vendor refunds for this vendor (for statement)
    const refundsResult = await db.query(
      `SELECT id, refund_number, refund_date, refund_amount, credit_number, payment_mode, deposit_to, status
       FROM vendor_refunds
       WHERE supplier_id = $1 AND UPPER(COALESCE(status,'')) = 'PAID'
       ORDER BY refund_date ASC`,
      [req.params.id]
    );
    vendor.refunds = refundsResult.rows;

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
    const { salutation, first_name, last_name, email, phone, profile_image } = req.body;
    const db = database.getDb();
    const result = await db.query(
      `INSERT INTO vendor_contact_persons (vendor_id, salutation, first_name, last_name, email, phone, profile_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, salutation || null, first_name || null, last_name || null, email || null, phone || null, profile_image || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding vendor contact:', error);
    res.status(500).json({ error: 'Failed to add contact' });
  }
});

// Upload contact person profile image
router.post('/:id/contacts/upload-image', contactUpload.single('profile_image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = '/uploads/vendor-contacts/' + req.file.filename;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Error uploading contact image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Update contact person
router.put('/:id/contacts/:contactId', async (req, res) => {
  try {
    const { salutation, first_name, last_name, email, phone, profile_image } = req.body;
    const db = database.getDb();
    const result = await db.query(
      `UPDATE vendor_contact_persons SET salutation=$1, first_name=$2, last_name=$3, email=$4, phone=$5, profile_image=$6
       WHERE id=$7 AND vendor_id=$8 RETURNING *`,
      [salutation || null, first_name || null, last_name || null, email || null, phone || null, profile_image || null, req.params.contactId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating vendor contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
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


// ========== Vendor Comments ==========

// GET comments for a vendor
router.get('/:id/comments', async (req, res) => {
  try {
    const db = database.getDb();
    const result = await db.query(
      'SELECT * FROM vendor_comments WHERE vendor_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching vendor comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST add a vendor comment
router.post('/:id/comments', async (req, res) => {
  try {
    const db = database.getDb();
    const { comment_html } = req.body;
    if (!comment_html || !comment_html.trim()) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }
    const result = await db.query(
      'INSERT INTO vendor_comments (vendor_id, comment_html) VALUES ($1, $2) RETURNING *',
      [req.params.id, comment_html]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding vendor comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// DELETE a vendor comment
router.delete('/:vendorId/comments/:commentId', async (req, res) => {
  try {
    const db = database.getDb();
    await db.query('DELETE FROM vendor_comments WHERE id = $1 AND vendor_id = $2', [req.params.commentId, req.params.vendorId]);
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Error deleting vendor comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
