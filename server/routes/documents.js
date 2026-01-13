const express = require('express');
const router = express.Router();
const database = require('../database');

// ==================== FOLDERS ====================

// Get all folders
router.get('/folders', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('SELECT * FROM document_folders ORDER BY name');
        res.json(result.rows || []);
    } catch (error) {
        console.error('Error fetching folders:', error);
        res.status(500).json({ error: 'Failed to fetch folders', details: error.message });
    }
});

// Create folder
router.post('/folders', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        const db = database.getDb();

        // Check for duplicate name
        const existing = await db.query('SELECT id FROM document_folders WHERE name ILIKE $1', [name.trim()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Folder with this name already exists' });
        }

        const result = await db.query(
            'INSERT INTO document_folders (name) VALUES ($1) RETURNING *',
            [name.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ error: 'Failed to create folder', details: error.message });
    }
});

// Update folder
router.put('/folders/:id', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        const db = database.getDb();

        // Check for duplicate name (excluding current folder)
        const existing = await db.query(
            'SELECT id FROM document_folders WHERE name ILIKE $1 AND id != $2',
            [name.trim(), req.params.id]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Folder with this name already exists' });
        }

        const result = await db.query(
            'UPDATE document_folders SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [name.trim(), req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating folder:', error);
        res.status(500).json({ error: 'Failed to update folder', details: error.message });
    }
});

// Delete folder
router.delete('/folders/:id', async (req, res) => {
    try {
        const db = database.getDb();

        // First, unset folder_id for all documents in this folder
        await db.query('UPDATE documents SET folder_id = NULL WHERE folder_id = $1', [req.params.id]);

        // Then delete the folder
        const result = await db.query('DELETE FROM document_folders WHERE id = $1 RETURNING id', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        res.json({ message: 'Folder deleted successfully' });
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ error: 'Failed to delete folder', details: error.message });
    }
});

// ==================== DOCUMENTS ====================

// Get all documents (with optional filters)
router.get('/', async (req, res) => {
    try {
        const { folder_id, trashed, filter } = req.query;
        const db = database.getDb();

        let query = `
      SELECT d.*, df.name as folder_name 
      FROM documents d 
      LEFT JOIN document_folders df ON d.folder_id = df.id
    `;
        let conditions = [];
        let params = [];
        let paramIndex = 1;

        if (trashed === 'true') {
            conditions.push(`d.trashed = true`);
        } else if (trashed === 'false' || trashed === undefined) {
            conditions.push(`d.trashed = false`);
        }

        if (folder_id) {
            conditions.push(`d.folder_id = $${paramIndex}`);
            params.push(folder_id);
            paramIndex++;
        }

        if (filter === 'inbox') {
            conditions.push(`d.folder_id IS NULL`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY d.created_at DESC';

        const result = await db.query(query, params);
        res.json(result.rows || []);
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents', details: error.message });
    }
});

// Get single document by ID
router.get('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(`
      SELECT d.*, df.name as folder_name 
      FROM documents d 
      LEFT JOIN document_folders df ON d.folder_id = df.id
      WHERE d.id = $1
    `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ error: 'Failed to fetch document', details: error.message });
    }
});

// Create document (upload)
router.post('/', async (req, res) => {
    try {
        const { name, file_path, file_size, file_type, uploaded_by, folder_id, associated_to } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Document name is required' });
        }

        const db = database.getDb();
        const result = await db.query(`
      INSERT INTO documents (name, file_path, file_size, file_type, uploaded_by, folder_id, associated_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
            name.trim(),
            file_path || null,
            file_size || null,
            file_type || null,
            uploaded_by || 'Current User',
            folder_id || null,
            associated_to || null
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating document:', error);
        res.status(500).json({ error: 'Failed to create document', details: error.message });
    }
});

// Update document
router.put('/:id', async (req, res) => {
    try {
        const { name, folder_id, associated_to, trashed } = req.body;
        const db = database.getDb();

        const result = await db.query(`
      UPDATE documents 
      SET name = COALESCE($1, name),
          folder_id = $2,
          associated_to = $3,
          trashed = COALESCE($4, trashed),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [name, folder_id, associated_to, trashed, req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ error: 'Failed to update document', details: error.message });
    }
});

// Move document to trash
router.put('/:id/trash', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(
            'UPDATE documents SET trashed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error trashing document:', error);
        res.status(500).json({ error: 'Failed to trash document', details: error.message });
    }
});

// Restore document from trash
router.put('/:id/restore', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query(
            'UPDATE documents SET trashed = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error restoring document:', error);
        res.status(500).json({ error: 'Failed to restore document', details: error.message });
    }
});

// Delete document permanently
router.delete('/:id', async (req, res) => {
    try {
        const db = database.getDb();
        const result = await db.query('DELETE FROM documents WHERE id = $1 RETURNING id', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ error: 'Failed to delete document', details: error.message });
    }
});

module.exports = router;
