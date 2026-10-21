import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load env directly since this runs outside normal app flow
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tables that carry a garage_id (tenant) column
const TENANT_TABLES = [
  'users',
  'customers',
  'vehicles',
  'repair_jobs',
  'invoices',
  'quotations',
  'parts_catalog'
];

// Tables whose old single-column unique key must become (garage_id, col)
const COMPOSITE_UNIQUES = [
  { table: 'users', index: 'uniq_users_garage_username', columns: ['garage_id', 'username'] },
  { table: 'vehicles', index: 'uniq_vehicles_garage_reg', columns: ['garage_id', 'registration_number'] },
  { table: 'invoices', index: 'uniq_invoices_garage_number', columns: ['garage_id', 'invoice_number'] },
  { table: 'quotations', index: 'uniq_quotations_garage_number', columns: ['garage_id', 'quote_number'] },
  { table: 'parts_catalog', index: 'uniq_parts_garage_part_number', columns: ['garage_id', 'part_number'] }
];

const runMigrations = async () => {
  let connection;
  try {
    // First connect without database to create it if it doesn't exist
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    const dbName = process.env.DB_NAME || 'gms_db';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`Database '${dbName}' created or already exists.`);

    await connection.query(`USE \`${dbName}\``);

    // Read and execute schema.sql (CREATE TABLE IF NOT EXISTS — no-op on existing tables)
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Remove line comments and split by semicolons
    const cleanSchema = schema.replace(/--.*$/gm, '');
    const statements = cleanSchema.split(';').map(s => s.trim()).filter(s => s.length > 0);

    for (let statement of statements) {
      await connection.query(statement);
    }
    console.log('Schema tables created successfully.');

    // Idempotent column/alter upgrades for DBs created before these features
    const ensureColumn = async (table, column, definition) => {
      const [cols] = await connection.query(
        'SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [dbName, table, column]
      );
      if (cols[0].c === 0) {
        await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
        console.log(`Added ${table}.${column}`);
      }
    };
    const ensureForeignKey = async (table, constraintName, definition) => {
      const [cons] = await connection.query(
        'SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
        [dbName, table, constraintName]
      );
      if (cons[0].c === 0) {
        await connection.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT ${constraintName} ${definition}`);
        console.log(`Added FK ${constraintName}`);
      }
    };

    await ensureColumn('users', 'is_active', "TINYINT(1) NOT NULL DEFAULT 1");
    // Temp-disable flag for a whole garage (super admin action). Keeps all
    // rows in place and only blocks login + API access for that tenant.
    await ensureColumn('garages', 'is_active', "TINYINT(1) NOT NULL DEFAULT 1");

    // Super-admin role (manages garages across the whole instance)
    const [roleCol] = await connection.query(
      `SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
      [dbName]
    );
    if (roleCol.length > 0 && !String(roleCol[0].ct).includes('super_admin')) {
      await connection.query(`ALTER TABLE users MODIFY role ENUM('admin', 'mechanic', 'super_admin') NOT NULL DEFAULT 'mechanic'`);
      console.log("Extended users.role enum with 'super_admin'");
    }
    await ensureColumn('repair_parts', 'catalog_part_id', 'INT NULL');
    await ensureForeignKey('repair_parts', 'fk_repair_parts_catalog',
      'FOREIGN KEY (catalog_part_id) REFERENCES parts_catalog(id) ON DELETE SET NULL');

    // ===== Multi-tenancy: garage_id on every tenant table =====

    // 1. Add the column as NULLABLE first (old DBs), so we can backfill
    for (const table of TENANT_TABLES) {
      await ensureColumn(table, 'garage_id', 'INT NULL');
    }

    // 2. Ensure the default garage exists (it also carries the settings)
    const [garageRows] = await connection.query('SELECT id FROM garages ORDER BY id ASC LIMIT 1');
    let defaultGarageId;
    if (garageRows.length === 0) {
      const [ins] = await connection.query(
        `INSERT INTO garages (garage_name, garage_code, address, phone, currency, tax_rate, whatsapp_template)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          process.env.GARAGE_NAME || 'My Auto Workshop',
          (process.env.GARAGE_CODE || 'ADMIN').toUpperCase(),
          process.env.GARAGE_ADDRESS || '123 Mechanic Street',
          process.env.GARAGE_PHONE || '+1234567890',
          process.env.CURRENCY || 'AED',
          parseFloat(process.env.TAX_RATE) || 0,
          'Hello {name}, your invoice {invoice_number} for vehicle {vehicle} is ready. Total: {currency} {total}. Thank you!'
        ]
      );
      defaultGarageId = ins.insertId;
      console.log(`Default garage created (id ${defaultGarageId}, code ${process.env.GARAGE_CODE || 'ADMIN'}).`);
    } else {
      defaultGarageId = garageRows[0].id;
    }

    // 3. Backfill existing rows to the default garage, then require NOT NULL
    for (const table of TENANT_TABLES) {
      await connection.query(`UPDATE \`${table}\` SET garage_id = ? WHERE garage_id IS NULL`, [defaultGarageId]);
      await connection.query(`ALTER TABLE \`${table}\` MODIFY garage_id INT NOT NULL`);
    }
    console.log('garage_id backfilled and set NOT NULL on all tenant tables.');

    // 4. Foreign keys to garages (fresh installs already have them via schema.sql)
    for (const table of TENANT_TABLES) {
      await ensureForeignKey(table, `fk_${table}_garage`,
        `FOREIGN KEY (garage_id) REFERENCES garages(id) ON DELETE CASCADE`);
    }

    // 4b. Cascade-safe invoice / quotation FKs.
    // invoices.vehicle_id, invoices.customer_id and quotations.customer_id were
    // created without ON DELETE CASCADE on older DBs, so `DELETE FROM garages`
    // could abort with "Cannot delete or update a parent row" when MySQL
    // cascaded to customers/vehicles before their invoices/quotations rows.
    // Drop any non-cascading FK on those columns and add a cascading one.
    const CASCADE_FKS = [
      { table: 'invoices', column: 'vehicle_id', refTable: 'vehicles' },
      { table: 'invoices', column: 'customer_id', refTable: 'customers' },
      { table: 'quotations', column: 'customer_id', refTable: 'customers' }
    ];
    for (const { table, column, refTable } of CASCADE_FKS) {
      const [fks] = await connection.query(
        `SELECT rc.CONSTRAINT_NAME AS name, rc.DELETE_RULE AS delete_rule
           FROM information_schema.KEY_COLUMN_USAGE kcu
           JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
             ON rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
            AND rc.TABLE_NAME = kcu.TABLE_NAME
            AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          WHERE kcu.TABLE_SCHEMA = ?
            AND kcu.TABLE_NAME = ?
            AND kcu.COLUMN_NAME = ?
            AND kcu.REFERENCED_TABLE_NAME = ?`,
        [dbName, table, column, refTable]
      );
      let needsCascade = fks.length > 0;
      for (const fk of fks) {
        if (String(fk.delete_rule).toUpperCase() === 'CASCADE') {
          needsCascade = false;
        } else {
          await connection.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.name}\``);
          console.log(`Dropped non-cascading FK ${fk.name} (${table}.${column})`);
        }
      }
      if (needsCascade) {
        await connection.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`fk_${table}_${column}_cascade\`
             FOREIGN KEY (${column}) REFERENCES ${refTable}(id) ON DELETE CASCADE`
        );
        console.log(`Added cascading FK fk_${table}_${column}_cascade`);
      }
    }

    // 5. Replace old global unique keys with (garage_id, col) composites
    for (const { table, index, columns } of COMPOSITE_UNIQUES) {
      // Drop existing unique indexes that overlap our tenant-scoped columns
      // but are not already the composite we want (e.g. UNIQUE(username)).
      const [indexes] = await connection.query(
        `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'`,
        [dbName, table]
      );
      for (const idx of indexes) {
        const [idxCols] = await connection.query(
          `SELECT COLUMN_NAME FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX`,
          [dbName, table, idx.INDEX_NAME]
        );
        const names = idxCols.map(c => c.COLUMN_NAME);
        const isTarget = names.length === columns.length && names.every((c, i) => c === columns[i]);
        const overlaps = names.some(c => columns.includes(c));
        if (overlaps && !isTarget) {
          await connection.query(`ALTER TABLE \`${table}\` DROP INDEX \`${idx.INDEX_NAME}\``);
          console.log(`Dropped old unique index ${table}.${idx.INDEX_NAME} (${names.join(',')})`);
        }
      }
      const [has] = await connection.query(
        `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [dbName, table, index]
      );
      if (has[0].c === 0) {
        await connection.query(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${index}\` (${columns.join(', ')})`);
        console.log(`Added unique index ${table}.${index}`);
      }
    }

    // 6. Move old single-row garage_settings into the default garage, then drop it
    const [gsExists] = await connection.query(
      'SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbName, 'garage_settings']
    );
    if (gsExists[0].c > 0) {
      const [gs] = await connection.query('SELECT * FROM garage_settings ORDER BY id ASC LIMIT 1');
      if (gs.length > 0) {
        const s = gs[0];
        await connection.query(
          `UPDATE garages SET
             garage_name = COALESCE(?, garage_name),
             address = COALESCE(?, address),
             phone = COALESCE(?, phone),
             logo_url = COALESCE(?, logo_url),
             currency = COALESCE(?, currency),
             tax_rate = COALESCE(?, tax_rate),
             whatsapp_template = COALESCE(?, whatsapp_template)
           WHERE id = ?`,
          [s.garage_name, s.address, s.phone, s.logo_url, s.currency, s.tax_rate, s.whatsapp_template, defaultGarageId]
        );
        console.log('Existing garage settings migrated into the default garage.');
      }
      await connection.query('DROP TABLE IF EXISTS garage_settings');
      console.log('Legacy garage_settings table dropped (data now lives on garages).');
    }

    // Seed Admin User (attached to the default garage)
    const [rows] = await connection.query('SELECT * FROM users WHERE username = ? AND garage_id = ?', ['admin', defaultGarageId]);
    if (rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)',
        ['admin', hashedPassword, 'admin', defaultGarageId]
      );
      console.log('Default admin user created. (Username: admin, Password: admin123)');
    } else {
      console.log('Admin user already exists.');
    }

    // The default garage's admin manages garages across the instance
    const [promoted] = await connection.query(
      `UPDATE users SET role = 'super_admin' WHERE username = 'admin' AND garage_id = ? AND role = 'admin'`,
      [defaultGarageId]
    );
    if (promoted.affectedRows > 0) {
      console.log('Default garage admin promoted to super_admin.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit();
  }
};

runMigrations();
