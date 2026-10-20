-- JENGAKWANZA Business Management System Database Schema
PRAGMA foreign_keys = ON;

-- System Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Users / Workers
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Cashier', -- Admin, Manager, Cashier, Storekeeper, Accountant
    phone TEXT,
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Daily Worker Shifts & Attendance ("know who was working in that specific day")
CREATE TABLE IF NOT EXISTS work_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    work_date TEXT NOT NULL, -- YYYY-MM-DD
    clock_in DATETIME DEFAULT CURRENT_TIMESTAMP,
    clock_out DATETIME,
    opening_cash REAL DEFAULT 0.0,
    closing_cash REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Customers & Debtors
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    credit_limit REAL DEFAULT 0.0,
    current_credit REAL DEFAULT 0.0, -- Current outstanding debt balance
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Product Inventory & Stock
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    barcode TEXT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    unit TEXT DEFAULT 'pcs', -- pcs, bags, kg, meters, rolls, boxes, litres
    cost_price REAL NOT NULL DEFAULT 0.0,
    selling_price REAL NOT NULL DEFAULT 0.0,
    stock_quantity REAL NOT NULL DEFAULT 0.0,
    min_alert_quantity REAL NOT NULL DEFAULT 5.0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stock Movement Logs (Audit Trail for stock in / stock out / adjustments)
CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_id INTEGER,
    movement_type TEXT NOT NULL, -- 'RESTOCK', 'SALE', 'RETURN', 'ADJUSTMENT', 'PO_RECEIVE', 'DAMAGED'
    quantity REAL NOT NULL,
    balance_after REAL NOT NULL,
    unit_cost REAL DEFAULT 0.0,
    reference_id TEXT, -- Order ID or PO ID
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Orders: POS Sales, Sales Invoices, Proforma Invoices
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL, -- e.g. JK-POS-0001, JK-INV-0001, JK-PRO-0001
    order_type TEXT NOT NULL, -- 'POS', 'INVOICE', 'PROFORMA'
    user_id INTEGER,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    subtotal REAL NOT NULL DEFAULT 0.0,
    discount REAL NOT NULL DEFAULT 0.0,
    tax REAL NOT NULL DEFAULT 0.0,
    total REAL NOT NULL DEFAULT 0.0,
    payment_method TEXT NOT NULL DEFAULT 'CASH', -- 'CASH', 'MPESA', 'TIGO_PESA', 'AIRTEL_MONEY', 'BANK', 'CREDIT'
    payment_status TEXT NOT NULL DEFAULT 'PAID', -- 'PAID', 'PARTIAL', 'UNPAID'
    amount_paid REAL NOT NULL DEFAULT 0.0,
    balance_due REAL NOT NULL DEFAULT 0.0,
    due_date TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    unit TEXT DEFAULT 'pcs',
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    cost_price REAL DEFAULT 0.0,
    total_price REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- Delivery Notes
CREATE TABLE IF NOT EXISTS delivery_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_number TEXT UNIQUE NOT NULL, -- e.g. JK-DN-0001
    order_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    delivery_address TEXT NOT NULL,
    transporter_name TEXT,
    vehicle_number TEXT,
    dispatched_by INTEGER,
    received_by_name TEXT,
    status TEXT DEFAULT 'DISPATCHED', -- 'DISPATCHED', 'DELIVERED', 'RETURNED'
    delivery_date TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
    FOREIGN KEY(dispatched_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Purchase Orders (POs)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL, -- e.g. JK-PO-0001
    supplier_id INTEGER NOT NULL,
    user_id INTEGER,
    subtotal REAL NOT NULL DEFAULT 0.0,
    tax REAL NOT NULL DEFAULT 0.0,
    total_amount REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'RECEIVED', 'CANCELLED'
    expected_date TEXT,
    received_date TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS po_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    unit TEXT DEFAULT 'pcs',
    quantity_ordered REAL NOT NULL,
    quantity_received REAL DEFAULT 0.0,
    cost_price REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY(po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- Daily Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_number TEXT UNIQUE NOT NULL, -- e.g. JK-EXP-0001
    user_id INTEGER,
    category TEXT NOT NULL, -- Rent, Transport, Utilities, Wages, Fuel, Repairs, Supplies, Miscellaneous
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH', -- CASH, BANK, MPESA, etc.
    description TEXT NOT NULL,
    expense_date TEXT NOT NULL, -- YYYY-MM-DD
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Debtor Payments / Installments (Collections on Customer Credit)
CREATE TABLE IF NOT EXISTS debtor_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_number TEXT UNIQUE NOT NULL, -- e.g. JK-PAY-0001
    customer_id INTEGER NOT NULL,
    user_id INTEGER,
    order_id INTEGER,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    payment_date TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- Capital & Cash Ledger (Tracks Capital Injections, Drawings, and Balances)
CREATE TABLE IF NOT EXISTS capital_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_type TEXT NOT NULL, -- 'CAPITAL_INJECTION', 'OWNER_DRAWING', 'INITIAL_CAPITAL', 'ADJUSTMENT'
    amount REAL NOT NULL,
    account TEXT NOT NULL DEFAULT 'CASH', -- 'CASH', 'BANK', 'MOBILE_MONEY'
    description TEXT NOT NULL,
    user_id INTEGER,
    entry_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
