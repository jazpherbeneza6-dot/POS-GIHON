const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, './models/schema.sql');

// PostgreSQL connection pool
let pool = null;

// Initialize database connection
async function init() {
  // Get database configuration from environment variables or use defaults
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'inventory_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '123123123',
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  pool = new Pool(config);

  // Test connection
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL database');
    client.release();

    // Read and execute schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    await pool.query(schema);
    console.log('Database schema initialized');

    // Migration: Add missing columns to existing tables
    try {
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 10;
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS can_be_wholesale BOOLEAN DEFAULT FALSE;
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed';
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0;
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) DEFAULT 0;
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
      `);
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_address TEXT;
      `);
      // Add status column to purchases table
      await pool.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ordered';
      `);
      await pool.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_date TIMESTAMP;
      `);

      // Add missing columns to item_groups table
      await pool.query(`
        ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'pcs';
      `);
      await pool.query(`
        ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS brand VARCHAR(255);
      `);
      await pool.query(`
        ALTER TABLE item_groups ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);
      `);

      // Add suppliers table migration
      await pool.query(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          contact_person VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          address TEXT,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Add supplier_id column to purchases table
      await pool.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_id INTEGER;
      `);

      // Add foreign key constraint if it doesn't exist
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'purchases_supplier_id_fkey'
          ) THEN
            ALTER TABLE purchases ADD CONSTRAINT purchases_supplier_id_fkey 
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);

      // Backfill suppliers from existing purchases that have supplier_name but no supplier record yet
      await pool.query(`
        INSERT INTO suppliers (name)
        SELECT DISTINCT p.supplier_name
        FROM purchases p
        WHERE p.supplier_name IS NOT NULL
          AND p.supplier_name <> ''
          AND NOT EXISTS (
            SELECT 1 FROM suppliers s WHERE s.name = p.supplier_name
          );
      `);

      // Add other missing columns to purchases
      await pool.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);
      `);
      await pool.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS expected_date DATE;
      `);
      await pool.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50);
      `);

      // Create indexes if they don't exist
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON purchases(supplier_id);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
      `);

      // Add columns to purchase_items for storing new item details during ordered status
      await pool.query(`
        ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS item_name VARCHAR(255);
      `);
      await pool.query(`
        ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2);
      `);
      await pool.query(`
        ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE;
      `);

      // Make item_id nullable for new items in ordered purchases
      await pool.query(`
        ALTER TABLE purchase_items ALTER COLUMN item_id DROP NOT NULL;
      `);

      // Add image_url column to items table
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url TEXT;
      `);

      // Add barcode column to items table
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
      `);

      // Add group_id column to items table for item categorization
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS group_id INTEGER;
      `);

      // Add foreign key constraint for group_id if it doesn't exist
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'items_group_id_fkey'
          ) THEN
            ALTER TABLE items ADD CONSTRAINT items_group_id_fkey 
            FOREIGN KEY (group_id) REFERENCES item_groups(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);

      // Create index for group_id if it doesn't exist
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_items_group_id ON items(group_id);
      `);

      // High-precision NUMERIC(38,10) migration for existing columns
      // This upgrades INTEGER columns to support extremely large values (up to 10^38)
      console.log('Running high-precision NUMERIC migration...');

      // Items table - upgrade price and quantity columns
      await pool.query(`ALTER TABLE items ALTER COLUMN selling_price TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE items ALTER COLUMN purchase_cost TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE items ALTER COLUMN stock_quantity TYPE NUMERIC(38,10);`);

      // Sales table - upgrade total_amount
      await pool.query(`ALTER TABLE sales ALTER COLUMN total_amount TYPE NUMERIC(38,10);`);

      // Sales items table - upgrade quantity and price columns
      await pool.query(`ALTER TABLE sales_items ALTER COLUMN quantity TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE sales_items ALTER COLUMN unit_price TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE sales_items ALTER COLUMN total_price TYPE NUMERIC(38,10);`);

      // Purchases table - upgrade total_amount
      await pool.query(`ALTER TABLE purchases ALTER COLUMN total_amount TYPE NUMERIC(38,10);`);

      // Purchase items table - upgrade quantity and price columns
      await pool.query(`ALTER TABLE purchase_items ALTER COLUMN quantity TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE purchase_items ALTER COLUMN unit_price TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE purchase_items ALTER COLUMN total_price TYPE NUMERIC(38,10);`);

      // Inventory transactions table - upgrade quantity
      await pool.query(`ALTER TABLE inventory_transactions ALTER COLUMN quantity TYPE NUMERIC(38,10);`);

      // Also upgrade the NUMERIC(10,2) columns added in previous migrations
      await pool.query(`ALTER TABLE sales ALTER COLUMN discount_amount TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE sales ALTER COLUMN tax_amount TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE sales ALTER COLUMN subtotal TYPE NUMERIC(38,10);`);
      await pool.query(`ALTER TABLE purchase_items ALTER COLUMN selling_price TYPE NUMERIC(38,10);`);

      console.log('High-precision NUMERIC migration completed');

      // Create inventory_adjustments table for tracking manual stock adjustments
      await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory_adjustments (
          id SERIAL PRIMARY KEY,
          reference_number VARCHAR(100) UNIQUE,
          adjustment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          mode VARCHAR(20) NOT NULL CHECK(mode IN ('quantity', 'value')),
          reason VARCHAR(100),
          description TEXT,
          account VARCHAR(100),
          status VARCHAR(50) DEFAULT 'draft',
          total_quantity_change NUMERIC(38,10) DEFAULT 0,
          total_value_change NUMERIC(38,10) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create inventory_adjustment_items table for line items in each adjustment
      await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory_adjustment_items (
          id SERIAL PRIMARY KEY,
          adjustment_id INTEGER NOT NULL,
          item_id INTEGER NOT NULL,
          item_name VARCHAR(255),
          quantity_on_hand NUMERIC(38,10) DEFAULT 0,
          quantity_adjusted NUMERIC(38,10) DEFAULT 0,
          new_quantity NUMERIC(38,10) DEFAULT 0,
          unit_cost NUMERIC(38,10) DEFAULT 0,
          value_change NUMERIC(38,10) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (adjustment_id) REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
          FOREIGN KEY (item_id) REFERENCES items(id)
        );
      `);

      // Create indexes for inventory adjustments
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_date ON inventory_adjustments(adjustment_date);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_status ON inventory_adjustments(status);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_items_adjustment ON inventory_adjustment_items(adjustment_id);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_inventory_adjustment_items_item ON inventory_adjustment_items(item_id);
      `);

      console.log('Inventory adjustments tables created');
      console.log('Database migration completed');
    } catch (migrationError) {
      // Column might already exist, ignore error
      console.log('Migration note:', migrationError.message);
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Get database pool
function getDb() {
  if (!pool) {
    throw new Error('Database not initialized. Call init() first.');
  }
  return pool;
}

// Transaction helper
async function transaction(callback) {
  if (!pool) {
    throw new Error('Database not initialized. Call init() first.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Close database connection
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database connection closed');
  }
}

module.exports = {
  init,
  getDb,
  transaction,
  close
};
