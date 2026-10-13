import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../config/db.js';

// @desc    Get all users with mechanic profiles
// @route   GET /api/users
// @access  Private (Admin)
export const getUsers = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const pageRaw = parseInt(page, 10) || 0;
    const limitRaw = parseInt(limit, 10) || 0;
    const paginated = pageRaw > 0 && limitRaw > 0;
    const pageNum = Math.max(1, pageRaw);
    const limitNum = Math.min(100, Math.max(1, limitRaw));

    const baseFrom = `FROM users u
       LEFT JOIN mechanic_profiles m ON u.id = m.user_id
       WHERE u.garage_id = ?`;
    const params = [req.user.garage_id];

    let query = `SELECT u.id, u.username, u.role, u.is_active, u.created_at,
              m.full_name, m.phone_number, m.status AS profile_status
       ${baseFrom}
       ORDER BY u.created_at ASC`;
    if (paginated) query += ' LIMIT ? OFFSET ?';

    const [users] = await pool.query(query, paginated ? [...params, limitNum, (pageNum - 1) * limitNum] : params);

    if (!paginated) {
      return res.json({ status: 'success', data: users });
    }

    // DISTINCT: a user with duplicated mechanic_profiles rows (old DBs had no
    // unique key on user_id) must still count as one user.
    const [countRows] = await pool.query(`SELECT COUNT(DISTINCT u.id) AS total ${baseFrom}`, params);
    const total = countRows[0].total;
    res.json({
      status: 'success',
      data: users,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all mechanics (kept for backward compatibility)
// @route   GET /api/users/mechanics
// @access  Private (Admin)
export const getMechanics = async (req, res, next) => {
  try {
    const query = `
      SELECT u.id, u.username, m.full_name, m.phone_number, m.status
      FROM users u
      LEFT JOIN mechanic_profiles m ON u.id = m.user_id
      WHERE u.role = 'mechanic' AND u.garage_id = ?
    `;
    const [mechanics] = await pool.query(query, [req.user.garage_id]);
    res.json({ status: 'success', data: mechanics });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a user (admin or mechanic) + mechanic profile
// @route   POST /api/users
// @access  Private (Admin)
export const createUser = async (req, res, next) => {
  try {
    const { username, password, role, full_name, phone_number } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ status: 'error', message: 'Username, password and role are required' });
    }
    if (!['admin', 'mechanic'].includes(role)) {
      return res.status(400).json({ status: 'error', message: 'Role must be admin or mechanic' });
    }
    if (password.length < 6) {
      return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters' });
    }

    const [dupe] = await pool.query('SELECT id FROM users WHERE username = ? AND garage_id = ?', [username, req.user.garage_id]);
    if (dupe.length > 0) {
      return res.status(400).json({ status: 'error', message: 'Username already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, role, garage_id) VALUES (?, ?, ?, ?)',
      [username, hashed, role, req.user.garage_id]
    );

    if (role === 'mechanic') {
      await pool.query(
        'INSERT INTO mechanic_profiles (user_id, full_name, phone_number) VALUES (?, ?, ?)',
        [result.insertId, full_name || username, phone_number || null]
      );
    }

    const [newUser] = await pool.query(
      `SELECT u.id, u.username, u.role, u.is_active, m.full_name, m.phone_number
       FROM users u LEFT JOIN mechanic_profiles m ON u.id = m.user_id WHERE u.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ status: 'success', data: newUser[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user (role, active status, profile) + optional password reset
// @route   PUT /api/users/:id
// @access  Private (Admin)
export const updateUser = async (req, res, next) => {
  try {
    const { role, is_active, full_name, phone_number, new_password } = req.body;
    const userId = parseInt(req.params.id, 10);

    const [users] = await pool.query('SELECT * FROM users WHERE id = ? AND garage_id = ?', [userId, req.user.garage_id]);
    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const user = users[0];

    // Prevent an admin from locking themselves out or demoting themselves
    if (userId === req.user.id && (is_active === false || is_active === 0 || (role && role !== 'admin'))) {
      return res.status(400).json({ status: 'error', message: 'You cannot deactivate or demote your own account' });
    }

    if (role) {
      if (!['admin', 'mechanic'].includes(role)) {
        return res.status(400).json({ status: 'error', message: 'Role must be admin or mechanic' });
      }
      await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
      // Ensure a profile exists when becoming a mechanic
      if (role === 'mechanic') {
        const [prof] = await pool.query('SELECT id FROM mechanic_profiles WHERE user_id = ?', [userId]);
        if (prof.length === 0) {
          await pool.query('INSERT INTO mechanic_profiles (user_id, full_name) VALUES (?, ?)', [userId, user.username]);
        }
      }
    }

    if (is_active !== undefined) {
      await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, userId]);
      await pool.query('UPDATE mechanic_profiles SET status = ? WHERE user_id = ?', [is_active ? 'active' : 'inactive', userId]);
    }

    if (user.role === 'mechanic' || role === 'mechanic') {
      await pool.query(
        `INSERT INTO mechanic_profiles (user_id, full_name, phone_number) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE full_name = COALESCE(VALUES(full_name), full_name), phone_number = COALESCE(VALUES(phone_number), phone_number)`,
        [userId, full_name || null, phone_number || null]
      ).catch(async () => {
        // Fallback if no unique key on user_id: update or insert
        const [prof] = await pool.query('SELECT id FROM mechanic_profiles WHERE user_id = ?', [userId]);
        if (prof.length === 0) {
          await pool.query('INSERT INTO mechanic_profiles (user_id, full_name, phone_number) VALUES (?, ?, ?)', [userId, full_name || user.username, phone_number || null]);
        } else {
          await pool.query(
            'UPDATE mechanic_profiles SET full_name = COALESCE(?, full_name), phone_number = COALESCE(?, phone_number) WHERE user_id = ?',
            [full_name || null, phone_number || null, userId]
          );
        }
      });
    }

    if (new_password) {
      if (new_password.length < 6) {
        return res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters' });
      }
      const hashed = await bcrypt.hash(new_password, 10);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, userId]);
    }

    const [updated] = await pool.query(
      `SELECT u.id, u.username, u.role, u.is_active, m.full_name, m.phone_number, m.status AS profile_status
       FROM users u LEFT JOIN mechanic_profiles m ON u.id = m.user_id WHERE u.id = ?`,
      [userId]
    );
    res.json({ status: 'success', data: updated[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Issue a one-time password reset code for a user in this garage
// @route   POST /api/users/:id/reset-code
// @access  Private (Admin)
// The app has no email channel, so the admin reads this code out to the
// locked-out user, who redeems it at /api/auth/reset-password. Only the
// bcrypt hash is persisted; the plaintext is returned exactly once.
export const issueResetCode = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const [users] = await pool.query(
      'SELECT id, username FROM users WHERE id = ? AND garage_id = ?',
      [userId, req.user.garage_id]
    );
    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Any earlier unused code for this user is now dead
    await pool.query('DELETE FROM password_reset_codes WHERE user_id = ? AND used_at IS NULL', [userId]);
    await pool.query(
      'INSERT INTO password_reset_codes (garage_id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)',
      [req.user.garage_id, userId, codeHash, expiresAt]
    );

    res.status(201).json({
      status: 'success',
      data: {
        id: users[0].id,
        username: users[0].username,
        code,
        expires_in_minutes: 15
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change own password
// @route   PUT /api/users/me/password
// @access  Private
export const changeOwnPassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ status: 'error', message: 'Current and new password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ status: 'error', message: 'New password must be at least 6 characters' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const match = await bcrypt.compare(current_password, users[0].password_hash);
    if (!match) {
      return res.status(401).json({ status: 'error', message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ status: 'success', message: 'Password updated' });
  } catch (error) {
    next(error);
  }
};
