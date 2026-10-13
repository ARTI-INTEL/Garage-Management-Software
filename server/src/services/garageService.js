import bcrypt from 'bcrypt';
import pool from '../config/db.js';

// Create a garage together with its first admin user, atomically.
// Pass `conn` to reuse an existing connection (the caller releases it);
// otherwise this function takes its own connection and releases it.
// The transaction (begin/commit/rollback) is always managed here.
export const createGarageWithAdmin = async ({ garageName, garageCode, username, password, phone, address }, conn = null) => {
  const c = conn || await pool.getConnection();
  const owned = !conn;
  try {
    await c.beginTransaction();

    const [dupe] = await c.query('SELECT id FROM garages WHERE garage_code = ?', [garageCode]);
    if (dupe.length > 0) {
      const err = new Error('Garage code is already taken');
      err.statusCode = 400;
      throw err;
    }

    const [garageResult] = await c.query(
      'INSERT INTO garages (garage_name, garage_code, phone, address) VALUES (?, ?, ?, ?)',
      [garageName, garageCode, phone || null, address || null]
    );
    const garageId = garageResult.insertId;

    const hashed = await bcrypt.hash(password, 10);
    const [userResult] = await c.query(
      'INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)',
      [username, hashed, 'admin', garageId]
    );

    await c.commit();
    return { garageId, userId: userResult.insertId };
  } catch (error) {
    // Always roll back — including caller-provided connections, so a failed
    // create never leaves an open transaction on a pooled connection.
    await c.rollback().catch(() => {});
    throw error;
  } finally {
    if (owned) c.release();
  }
};
