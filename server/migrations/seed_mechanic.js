import pool from '../src/config/db.js';
import bcrypt from 'bcrypt';

const seedMechanic = async () => {
  try {
    const [garageRows] = await pool.query('SELECT id FROM garages ORDER BY id ASC LIMIT 1');
    if (garageRows.length === 0) {
      console.error('No garage found — run npm run migrate first.');
      process.exit(1);
    }
    const garageId = garageRows[0].id;

    const hashedPassword = await bcrypt.hash('mech123', 10);
    const [userRes] = await pool.query(
      'INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)',
      ['mechanic_bob', hashedPassword, 'mechanic', garageId]
    );
    const userId = userRes.insertId;

    await pool.query(
      'INSERT INTO mechanic_profiles (user_id, full_name, phone_number) VALUES (?, ?, ?)',
      [userId, 'Bob The Builder', '+971500000000']
    );

    console.log('Database seeded with a mechanic! (Username: mechanic_bob, Password: mech123)');
  } catch (error) {
    console.error('Seeding failed', error);
  } finally {
    process.exit();
  }
};

seedMechanic();

