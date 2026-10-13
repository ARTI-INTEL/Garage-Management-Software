-- Create tables for Garage Management System (multi-tenant)

-- One row per garage (tenant). Also holds that garage's settings
-- (name, currency, tax rate, WhatsApp template), replacing the old
-- single-row garage_settings table.
CREATE TABLE IF NOT EXISTS garages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_name VARCHAR(100) NOT NULL,
    garage_code VARCHAR(30) NOT NULL UNIQUE,
    address TEXT,
    phone VARCHAR(20),
    logo_url VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'AED',
    tax_rate DECIMAL(5, 2) DEFAULT 0.00,
    whatsapp_template TEXT,
    -- 0 = temporarily disabled by the super admin: login and all API access
    -- for this garage's users are blocked, but no data is deleted.
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'mechanic', 'super_admin') NOT NULL DEFAULT 'mechanic',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_users_garage_username (garage_id, username),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mechanic_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    status ENUM('active', 'inactive') DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_customers_garage (garage_id),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    customer_id INT NOT NULL,
    registration_number VARCHAR(20) NOT NULL,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INT,
    colour VARCHAR(30),
    vehicle_type VARCHAR(50),
    vin VARCHAR(50),
    odometer INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_vehicles_garage_reg (garage_id, registration_number),
    KEY idx_vehicles_garage (garage_id),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS repair_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    diagnosis_notes TEXT,
    labour_cost DECIMAL(10, 2) DEFAULT 0.00,
    mechanic_id INT,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    status ENUM('Awaiting Diagnosis', 'Diagnosed', 'Awaiting Approval', 'Awaiting Repair', 'In Progress', 'Fixed', 'Unable to Fix') DEFAULT 'Awaiting Diagnosis',
    estimated_completion_date DATE,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_repair_jobs_garage (garage_id),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (mechanic_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS repair_parts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    repair_job_id INT NOT NULL,
    part_name VARCHAR(100) NOT NULL,
    part_number VARCHAR(50),
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10, 2) DEFAULT 0.00,
    notes TEXT,
    FOREIGN KEY (repair_job_id) REFERENCES repair_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    vehicle_id INT NOT NULL,
    customer_id INT NOT NULL,
    invoice_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_labour DECIMAL(10, 2) DEFAULT 0.00,
    total_parts DECIMAL(10, 2) DEFAULT 0.00,
    subtotal DECIMAL(10, 2) DEFAULT 0.00,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    tax DECIMAL(10, 2) DEFAULT 0.00,
    grand_total DECIMAL(10, 2) DEFAULT 0.00,
    payment_status ENUM('Unpaid', 'Partially Paid', 'Paid', 'Cancelled') DEFAULT 'Unpaid',
    payment_method VARCHAR(50),
    notes TEXT,
    UNIQUE KEY uniq_invoices_garage_number (garage_id, invoice_number),
    KEY idx_invoices_garage (garage_id),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    item_type ENUM('labour', 'part') NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10, 2) DEFAULT 0.00,
    total DECIMAL(10, 2) DEFAULT 0.00,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- ===== Parts catalog (inventory) =====
CREATE TABLE IF NOT EXISTS parts_catalog (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    part_number VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    cost_price DECIMAL(10, 2) DEFAULT 0.00,
    sell_price DECIMAL(10, 2) DEFAULT 0.00,
    qty_in_stock INT DEFAULT 0,
    low_stock_threshold INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_parts_garage_part_number (garage_id, part_number),
    KEY idx_parts_catalog_garage (garage_id),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE
);

-- ===== Job status audit trail =====
CREATE TABLE IF NOT EXISTS job_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by INT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES repair_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ===== Service history (odometer tracking) =====
CREATE TABLE IF NOT EXISTS service_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_id INT NOT NULL,
    repair_job_id INT,
    service_date DATE NOT NULL,
    odometer INT,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (repair_job_id) REFERENCES repair_jobs(id) ON DELETE SET NULL
);

-- ===== Quotations / estimates =====
CREATE TABLE IF NOT EXISTS quotations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    quote_number VARCHAR(50) NOT NULL,
    repair_job_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    customer_id INT NOT NULL,
    quote_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_labour DECIMAL(10, 2) DEFAULT 0.00,
    total_parts DECIMAL(10, 2) DEFAULT 0.00,
    subtotal DECIMAL(10, 2) DEFAULT 0.00,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    tax DECIMAL(10, 2) DEFAULT 0.00,
    grand_total DECIMAL(10, 2) DEFAULT 0.00,
    status ENUM('Draft', 'Sent', 'Approved', 'Rejected', 'Expired') DEFAULT 'Draft',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_quotations_garage_number (garage_id, quote_number),
    KEY idx_quotations_garage (garage_id),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE,
    FOREIGN KEY (repair_job_id) REFERENCES repair_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quotation_id INT NOT NULL,
    item_type ENUM('labour', 'part') NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity INT DEFAULT 1,
    unit_price DECIMAL(10, 2) DEFAULT 0.00,
    total DECIMAL(10, 2) DEFAULT 0.00,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

-- NOTE: The default admin user is seeded by migrations/run_migrations.js
-- with a properly bcrypt-hashed password (admin/admin123), attached to the
-- default garage. Do not insert users here — plaintext or placeholder
-- hashes cannot be logged into.

-- ===== Password reset (admin-issued one-time codes) =====
-- The app sends no email, so recovery works like this: a garage admin
-- issues a 6-digit code from the Users page, reads it out to the locked-out
-- user, who redeems it on the login page. Only a bcrypt hash of the code is
-- stored, codes expire after 15 minutes and are single-use.
CREATE TABLE IF NOT EXISTS password_reset_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    garage_id INT NOT NULL,
    user_id INT NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_reset_codes_user (user_id),
    FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
