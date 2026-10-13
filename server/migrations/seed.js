import pool from '../src/config/db.js';

const seed = async () => {
  try {
    const [garageRows] = await pool.query('SELECT id FROM garages ORDER BY id ASC LIMIT 1');
    if (garageRows.length === 0) {
      console.error('No garage found — run npm run migrate first.');
      process.exit(1);
    }
    const garageId = garageRows[0].id;

    const [customerRes] = await pool.query(
      'INSERT INTO customers (garage_id, full_name, mobile_number, email) VALUES (?, ?, ?, ?)',
      [garageId, 'John Doe', '+971501234567', 'john@example.com']
    );
    const customerId = customerRes.insertId;

    await pool.query(
      'INSERT INTO vehicles (garage_id, customer_id, registration_number, make, model, year, colour) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [garageId, customerId, 'DXB-12345', 'Toyota', 'Camry', 2020, 'White']
    );

    await pool.query(
      'INSERT INTO vehicles (garage_id, customer_id, registration_number, make, model, year, colour) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [garageId, customerId, 'SHJ-98765', 'Nissan', 'Patrol', 2022, 'Black']
    );

    console.log('Database seeded with test customer and vehicles!');
  } catch (error) {
    console.error('Seeding failed', error);
  } finally {
    process.exit();
  }
};

seed();

