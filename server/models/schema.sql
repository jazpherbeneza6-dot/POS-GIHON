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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

-- Purchase items table
CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER NOT NULL,
    item_id INTEGER,
    quantity NUMERIC(38,10) NOT NULL,
    unit_price NUMERIC(38,10) NOT NULL,
    total_price NUMERIC(38,10) NOT NULL,
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

