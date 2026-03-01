-- Item groups table (must be created first)
CREATE TABLE IF NOT EXISTS item_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    unit VARCHAR(50) DEFAULT 'pcs',
    brand VARCHAR(255),
    manufacturer VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Items table
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE,
    selling_price NUMERIC(38,10) DEFAULT 0,
    purchase_cost NUMERIC(38,10) DEFAULT 0,
    stock_quantity NUMERIC(38,10) DEFAULT 0,
    reorder_point INTEGER DEFAULT 10,
    unit VARCHAR(50) DEFAULT 'pcs',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL CHECK(type IN ('IN', 'OUT', 'ADJUSTMENT')),
    quantity NUMERIC(38,10) NOT NULL,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(255),
    total_amount NUMERIC(38,10) NOT NULL DEFAULT 0,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    receipt_number VARCHAR(100) UNIQUE,
    payment_method VARCHAR(50),
    status VARCHAR(50) DEFAULT 'completed',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales items table
CREATE TABLE IF NOT EXISTS sales_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity NUMERIC(38,10) NOT NULL,
    unit_price NUMERIC(38,10) NOT NULL,
    total_price NUMERIC(38,10) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Suppliers table
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

-- Purchases table
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER,
    supplier_name VARCHAR(255),
    total_amount NUMERIC(38,10) NOT NULL DEFAULT 0,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    invoice_number VARCHAR(100) UNIQUE,
    po_number VARCHAR(100),
    expected_date DATE,
    received_date DATE,
    payment_terms VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ordered',
    notes TEXT,
    delivery_address TEXT,
    reference_number VARCHAR(100),
    discount_percent NUMERIC(10,2) DEFAULT 0,
    adjustment NUMERIC(12,2) DEFAULT 0,
    terms_conditions TEXT,
    shipment_preference VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

-- Purchase items table
CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name VARCHAR(255),
    quantity NUMERIC(38,10) NOT NULL,
    unit_price NUMERIC(38,10) NOT NULL,
    total_price NUMERIC(38,10) NOT NULL,
    selling_price NUMERIC(12,2),
    is_new BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Barcodes table (for barcode-item mapping)
CREATE TABLE IF NOT EXISTS barcodes (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    barcode VARCHAR(100) NOT NULL UNIQUE,
    format VARCHAR(50) DEFAULT 'CODE128',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- Document folders table
CREATE TABLE IF NOT EXISTS document_folders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000),
    file_size INTEGER,
    file_type VARCHAR(100),
    uploaded_by VARCHAR(255) DEFAULT 'Current User',
    folder_id INTEGER,
    associated_to VARCHAR(255),
    trashed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL
);

-- Manufacturers table
CREATE TABLE IF NOT EXISTS manufacturers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Brands table
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    customer_type VARCHAR(20) DEFAULT 'Business',
    salutation VARCHAR(10),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    company_name VARCHAR(255),
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    work_phone VARCHAR(50),
    mobile VARCHAR(50),
    website VARCHAR(255),
    payment_terms VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'PHP',
    tax_rate VARCHAR(50),
    billing_street TEXT,
    billing_city VARCHAR(255),
    billing_state VARCHAR(255),
    billing_zip VARCHAR(50),
    billing_country VARCHAR(255),
    shipping_street TEXT,
    shipping_city VARCHAR(255),
    shipping_state VARCHAR(255),
    shipping_zip VARCHAR(50),
    shipping_country VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer changes history
CREATE TABLE IF NOT EXISTS customer_changes (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Contact persons
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

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_id ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date ON inventory_transactions(date);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_items_sale_id ON sales_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_trashed ON documents(trashed);
CREATE INDEX IF NOT EXISTS idx_customers_display_name ON customers(display_name);
CREATE INDEX IF NOT EXISTS idx_customer_changes_customer_id ON customer_changes(customer_id);

-- Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE,
    order_date DATE DEFAULT CURRENT_DATE,
    reference_number VARCHAR(100),
    customer_id INTEGER,
    customer_name VARCHAR(255),
    salesperson_name VARCHAR(255),
    payment_terms VARCHAR(100),
    delivery_method VARCHAR(255),
    expected_shipment_date DATE,
    status VARCHAR(50) DEFAULT 'DRAFT',
    notes TEXT,
    sub_total DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    discount_type VARCHAR(10) DEFAULT '%',
    discount_value DECIMAL(12,2) DEFAULT 0,
    shipping_charges DECIMAL(12,2) DEFAULT 0,
    adjustment DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id SERIAL PRIMARY KEY,
    sales_order_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name VARCHAR(255),
    quantity DECIMAL(12,2) DEFAULT 1,
    rate DECIMAL(12,2) DEFAULT 0,
    tax VARCHAR(50),
    amount DECIMAL(12,2) DEFAULT 0,
    discounts JSONB DEFAULT '[]',
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS salespersons (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    password VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(order_date);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE,
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    order_number VARCHAR(100),
    customer_id INTEGER,
    customer_name VARCHAR(255),
    salesperson_name VARCHAR(255),
    payment_terms VARCHAR(100),
    subject TEXT,
    status VARCHAR(50) DEFAULT 'DRAFT',
    notes TEXT,
    terms_conditions TEXT,
    sub_total DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    discount_type VARCHAR(10) DEFAULT '%',
    discount_value DECIMAL(12,2) DEFAULT 0,
    shipping_charges DECIMAL(12,2) DEFAULT 0,
    adjustment DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    item_name VARCHAR(255),
    quantity DECIMAL(12,2) DEFAULT 1,
    rate DECIMAL(12,2) DEFAULT 0,
    tax VARCHAR(50),
    amount DECIMAL(12,2) DEFAULT 0,
    discounts JSONB DEFAULT '[]',
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);

-- Sales Receipts
CREATE TABLE IF NOT EXISTS sales_receipts (
    id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE,
    receipt_date DATE DEFAULT CURRENT_DATE,
    reference_number VARCHAR(100),
    customer_id INTEGER,
    customer_name VARCHAR(255),
    salesperson_name VARCHAR(255),
    payment_mode VARCHAR(100),
    deposit_to VARCHAR(255),
    status VARCHAR(50) DEFAULT 'DRAFT',
    notes TEXT,
    terms_conditions TEXT,
    sub_total DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    shipping_charges DECIMAL(12,2) DEFAULT 0,
    adjustment DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_receipt_items (
    id SERIAL PRIMARY KEY,
    sales_receipt_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name VARCHAR(255),
    quantity DECIMAL(12,2) DEFAULT 1,
    rate DECIMAL(12,2) DEFAULT 0,
    tax VARCHAR(50),
    amount DECIMAL(12,2) DEFAULT 0,
    discounts JSONB DEFAULT '[]',
    FOREIGN KEY (sales_receipt_id) REFERENCES sales_receipts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sales_receipts_status ON sales_receipts(status);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_date ON sales_receipts(receipt_date);

-- Add stock_deducted flag to sales_receipts (prevents double-deduction)
ALTER TABLE sales_receipts ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT FALSE;
ALTER TABLE sales_receipts ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Accounting entries table
CREATE TABLE IF NOT EXISTS accounting_entries (
    id SERIAL PRIMARY KEY,
    entry_date DATE DEFAULT CURRENT_DATE,
    entry_type VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    debit DECIMAL(12,2) DEFAULT 0,
    credit DECIMAL(12,2) DEFAULT 0,
    reference_number VARCHAR(100),
    reference_type VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounting_entries_ref ON accounting_entries(reference_number);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_type ON accounting_entries(entry_type);

-- Purchase receives table (tracks individual receive transactions against a PO)
CREATE TABLE IF NOT EXISTS purchase_receives (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER NOT NULL,
    receive_number VARCHAR(100),
    receive_date DATE DEFAULT CURRENT_DATE,
    supplier_id INTEGER,
    supplier_name VARCHAR(255),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

-- Purchase receive items table
CREATE TABLE IF NOT EXISTS purchase_receive_items (
    id SERIAL PRIMARY KEY,
    receive_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name VARCHAR(255),
    ordered_qty NUMERIC(38,10) DEFAULT 0,
    previously_received_qty NUMERIC(38,10) DEFAULT 0,
    quantity_to_receive NUMERIC(38,10) DEFAULT 0,
    FOREIGN KEY (receive_id) REFERENCES purchase_receives(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_receives_purchase_id ON purchase_receives(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receives_status ON purchase_receives(status);

-- Refunds table (tracks refund transactions from credit notes)
CREATE TABLE IF NOT EXISTS refunds (
    id SERIAL PRIMARY KEY,
    refund_number VARCHAR(50) UNIQUE,
    credit_note_id INTEGER,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    amount DECIMAL(12,2) DEFAULT 0,
    refund_date DATE DEFAULT CURRENT_DATE,
    payment_mode VARCHAR(100),
    from_account VARCHAR(255),
    reference VARCHAR(100),
    description TEXT,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE SET NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_refunds_credit_note_id ON refunds(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_refunds_customer_id ON refunds(customer_id);
