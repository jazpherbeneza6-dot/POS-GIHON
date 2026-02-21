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

      // Add manufacturer and brand columns to items table
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS brand VARCHAR(255);
      `);

      // Add additional item fields (description, UPC, EAN, ISBN, dimensions, tax, account)
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT;
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS upc VARCHAR(100);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS ean VARCHAR(100);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS isbn VARCHAR(100);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS dimensions VARCHAR(255);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS tax_rate VARCHAR(100);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS account VARCHAR(255);
      `);

      // Add type, weight, purchase_account, purchase_description columns
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'goods';
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS weight VARCHAR(100);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_account VARCHAR(255);
      `);
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_description TEXT;
      `);

      // Add status column to items table for active/inactive filtering
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
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

      // Add tax_rate column to customers table
      await pool.query(`
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_rate VARCHAR(50);
      `);

      // Add address and website columns to customers table
      await pool.query(`
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS website VARCHAR(255);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_street TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_city VARCHAR(255);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_state VARCHAR(255);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_zip VARCHAR(50);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_country VARCHAR(255);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_street TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(255);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(255);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_zip VARCHAR(50);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_country VARCHAR(255);
      `);

      // Create customer_changes table for tracking edit history
      await pool.query(`
        CREATE TABLE IF NOT EXISTS customer_changes (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER NOT NULL,
          field_name VARCHAR(100) NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_customer_changes_customer_id ON customer_changes(customer_id);
      `);

      // Create contact_persons table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS contact_persons (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER NOT NULL,
          salutation VARCHAR(10),
          first_name VARCHAR(255),
          last_name VARCHAR(255),
          email VARCHAR(255),
          work_phone VARCHAR(50),
          mobile VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
      `);

      // ========== Vendor (Suppliers) table expansion ==========
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS salutation VARCHAR(10);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS work_phone VARCHAR(50);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS mobile VARCHAR(50);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'PHP';`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'due-on-receipt';`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_rate VARCHAR(50);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id_number VARCHAR(100);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS vendor_language VARCHAR(50) DEFAULT 'english';`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_attention VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_address TEXT;`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_city VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_state VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_zip VARCHAR(50);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_country VARCHAR(255) DEFAULT 'Philippines';`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_phone VARCHAR(50);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_attention VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_address TEXT;`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(255);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_zip VARCHAR(50);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_country VARCHAR(255) DEFAULT 'Philippines';`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shipping_phone VARCHAR(50);`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS remarks TEXT;`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);
      await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS enable_portal BOOLEAN DEFAULT FALSE;`);

      // Create vendor_contact_persons table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS vendor_contact_persons (
          id SERIAL PRIMARY KEY,
          vendor_id INTEGER NOT NULL,
          salutation VARCHAR(10),
          first_name VARCHAR(255),
          last_name VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (vendor_id) REFERENCES suppliers(id) ON DELETE CASCADE
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_vendor_contact_persons_vendor_id ON vendor_contact_persons(vendor_id);`);

      console.log('Vendor schema expansion completed');

      // ========== Payments Received table ==========
      await pool.query(`
        CREATE TABLE IF NOT EXISTS payments_received (
          id SERIAL PRIMARY KEY,
          payment_number VARCHAR(50),
          invoice_id INTEGER,
          invoice_number VARCHAR(50),
          customer_id INTEGER,
          customer_name VARCHAR(255),
          amount_received DECIMAL(12,2) DEFAULT 0,
          bank_charges DECIMAL(12,2) DEFAULT 0,
          tax_deducted BOOLEAN DEFAULT FALSE,
          payment_date DATE DEFAULT CURRENT_DATE,
          payment_received_on DATE,
          payment_mode VARCHAR(100) DEFAULT 'Cash',
          deposit_to VARCHAR(255) DEFAULT 'Petty Cash',
          location VARCHAR(255) DEFAULT 'Head Office',
          reference_number VARCHAR(100),
          notes TEXT,
          status VARCHAR(50) DEFAULT 'DRAFT',
          salesperson_name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_received_status ON payments_received(status);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_received_invoice ON payments_received(invoice_id);`);
      // Migration: add salesperson_name if missing
      await pool.query(`ALTER TABLE payments_received ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(255);`);
      console.log('Payments received table created');

      // Packages table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS packages (
          id SERIAL PRIMARY KEY,
          package_number VARCHAR(50),
          sales_order_id INTEGER REFERENCES sales_orders(id),
          sales_order_number VARCHAR(50),
          customer_name VARCHAR(255),
          package_date DATE DEFAULT CURRENT_DATE,
          internal_notes TEXT,
          status VARCHAR(50) DEFAULT 'NOT SHIPPED',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS package_items (
          id SERIAL PRIMARY KEY,
          package_id INTEGER REFERENCES packages(id),
          item_name VARCHAR(255),
          item_id INTEGER,
          ordered_quantity DECIMAL(12,2) DEFAULT 0,
          packed_quantity DECIMAL(12,2) DEFAULT 0,
          quantity_to_pack DECIMAL(12,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Packages table created');

      // Create shipments table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shipments (
          id SERIAL PRIMARY KEY,
          package_id INTEGER REFERENCES packages(id),
          sales_order_id INTEGER,
          shipment_order_number VARCHAR(50),
          ship_date DATE,
          carrier VARCHAR(100),
          tracking_number VARCHAR(255),
          tracking_url VARCHAR(500),
          shipping_charges DECIMAL(12,2) DEFAULT 0,
          notes TEXT,
          already_delivered BOOLEAN DEFAULT false,
          status VARCHAR(50) DEFAULT 'SHIPPED',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Shipments table created');

      // Sales Returns table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sales_returns (
          id SERIAL PRIMARY KEY,
          rma_number VARCHAR(50) UNIQUE NOT NULL,
          return_date DATE,
          warehouse_location VARCHAR(100) DEFAULT 'Head Office',
          reason TEXT,
          credit_only BOOLEAN DEFAULT false,
          sales_order_id INTEGER,
          sales_order_number VARCHAR(50),
          customer_name VARCHAR(255),
          status VARCHAR(50) DEFAULT 'DRAFT',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Sales Returns table created');

      // Sales Return Items table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sales_return_items (
          id SERIAL PRIMARY KEY,
          sales_return_id INTEGER REFERENCES sales_returns(id),
          item_name VARCHAR(255),
          item_id INTEGER,
          shipped_quantity DECIMAL(12,2) DEFAULT 0,
          returned_quantity DECIMAL(12,2) DEFAULT 0,
          return_quantity DECIMAL(12,2) DEFAULT 0,
          rate DECIMAL(12,2) DEFAULT 0,
          amount DECIMAL(12,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Sales Return Items table created');

      // Add rate/amount columns to sales_return_items if missing
      try {
        await pool.query('ALTER TABLE sales_return_items ADD COLUMN IF NOT EXISTS rate DECIMAL(12,2) DEFAULT 0');
        await pool.query('ALTER TABLE sales_return_items ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2) DEFAULT 0');
      } catch (e) { /* columns may already exist */ }

      console.log('Database migration completed');

      // ========== Bills tables ==========
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bills (
          id SERIAL PRIMARY KEY,
          bill_number VARCHAR(100),
          purchase_order_id INTEGER,
          supplier_id INTEGER,
          supplier_name VARCHAR(255),
          order_number VARCHAR(100),
          bill_date DATE DEFAULT CURRENT_DATE,
          due_date DATE,
          payment_terms VARCHAR(50) DEFAULT 'due-on-receipt',
          subject TEXT,
          notes TEXT,
          discount_percent NUMERIC(10,2) DEFAULT 0,
          adjustment NUMERIC(10,2) DEFAULT 0,
          sub_total NUMERIC(38,10) DEFAULT 0,
          total_amount NUMERIC(38,10) DEFAULT 0,
          status VARCHAR(50) DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bill_items (
          id SERIAL PRIMARY KEY,
          bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
          item_id INTEGER,
          item_name VARCHAR(255),
          account VARCHAR(100),
          account_type VARCHAR(50) DEFAULT 'inventory',
          quantity NUMERIC(38,10) DEFAULT 0,
          rate NUMERIC(38,10) DEFAULT 0,
          tax_percent NUMERIC(10,2) DEFAULT 0,
          amount NUMERIC(38,10) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_bills_po_id ON bills(purchase_order_id);`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);`);
      console.log('Bills tables created');

      // Migration: add account_type column to bill_items if missing
      try {
        await pool.query(`ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS account_type VARCHAR(50) DEFAULT 'inventory'`);
      } catch (e) { /* column may already exist */ }

      // Payments Made table (for bill payments)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS payments_made (
          id SERIAL PRIMARY KEY,
          payment_number VARCHAR(50),
          bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
          bill_number VARCHAR(50),
          supplier_id INTEGER,
          supplier_name VARCHAR(255),
          amount_paid NUMERIC(38,10) DEFAULT 0,
          bank_charges NUMERIC(38,10) DEFAULT 0,
          tax_deducted BOOLEAN DEFAULT false,
          payment_date DATE DEFAULT CURRENT_DATE,
          payment_made_on DATE,
          payment_mode VARCHAR(50) DEFAULT 'Cash',
          paid_through VARCHAR(100) DEFAULT 'Petty Cash',
          location VARCHAR(100) DEFAULT 'Head Office',
          reference_number VARCHAR(100),
          notes TEXT,
          status VARCHAR(50) DEFAULT 'DRAFT',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_made_bill_id ON payments_made(bill_id);`);
      console.log('Payments Made table created');

      // Vendor Credits tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS vendor_credits (
          id SERIAL PRIMARY KEY,
          credit_number VARCHAR(50),
          bill_id INTEGER,
          bill_number VARCHAR(50),
          supplier_id INTEGER,
          supplier_name VARCHAR(255),
          credit_date DATE DEFAULT CURRENT_DATE,
          reference VARCHAR(255),
          reason TEXT,
          discount_percent NUMERIC(10,2) DEFAULT 0,
          adjustment NUMERIC(38,10) DEFAULT 0,
          sub_total NUMERIC(38,10) DEFAULT 0,
          total_amount NUMERIC(38,10) DEFAULT 0,
          status VARCHAR(50) DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS vendor_credit_items (
          id SERIAL PRIMARY KEY,
          vendor_credit_id INTEGER REFERENCES vendor_credits(id) ON DELETE CASCADE,
          item_id INTEGER,
          item_name VARCHAR(255),
          account VARCHAR(100),
          account_type VARCHAR(50) DEFAULT 'inventory',
          quantity NUMERIC(38,10) DEFAULT 0,
          rate NUMERIC(38,10) DEFAULT 0,
          amount NUMERIC(38,10) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Vendor Credits tables created');
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
