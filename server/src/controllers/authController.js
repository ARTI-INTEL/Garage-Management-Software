import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { generateToken } from '../utils/generateToken.js';

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { username, password, garage_code } = req.body;

    if (!username || !password || !garage_code) {
      return res.status(400).json({ status: 'error', message: 'Username, password and garage code are required' });
    }

    // Usernames are unique per garage, so the garage code is always required
    // to identify which garage the account belongs to.
    const [users] = await pool.query(
      `SELECT u.*, g.garage_code AS garage_code, g.garage_name AS garage_name,
              g.is_active AS garage_is_active
       FROM users u
       JOIN garages g ON u.garage_id = g.id
       WHERE u.username = ? AND g.garage_code = ?`,
      [username, String(garage_code).toUpperCase().trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const user = users[0];

    if (user.is_active === 0) {
      return res.status(403).json({ status: 'error', message: 'This account has been deactivated. Contact the admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    // Temporarily disabled garage: valid credentials, but no access. Checked
    // only after the password matches so probing can't learn the garage state.
    if (Number(user.garage_is_active) === 0) {
      return res.status(403).json({
        status: 'error',
        message: 'This garage has been temporarily disabled. Contact the super admin.'
      });
    }

    const token = generateToken(user.id, user.role, user.garage_id);

    res.json({
      status: 'success',
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        garage: { id: user.garage_id, name: user.garage_name, code: user.garage_code },
        token
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Reset a password with an admin-issued one-time code
// @route   POST /api/auth/reset-password
// @access  Public (rate-limited in app.js)
//
// Every failure returns the same generic 400 so the endpoint can't be used
// to probe which usernames / garage codes / codes exist. The code itself is
// bcrypt-compared against the stored hash, expires in 15 minutes and works
// exactly once.
export const resetPassword = async (req, res, next) => {
  try {
    const { username, garage_code, code, new_password } = req.body;
    const invalid = () => res.status(400).json({
      status: 'error',
      message: 'Invalid or expired reset code. Ask your admin for a new one.'
    });

    const [users] = await pool.query(
      `SELECT u.*, g.is_active AS garage_is_active FROM users u
       JOIN garages g ON u.garage_id = g.id
       WHERE u.username = ? AND g.garage_code = ?`,
      [username, String(garage_code).toUpperCase().trim()]
    );
    if (users.length === 0 || users[0].is_active === 0 || Number(users[0].garage_is_active) === 0) {
      return invalid();
    }
    const user = users[0];

    const [codes] = await pool.query(
      `SELECT * FROM password_reset_codes
       WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    if (codes.length === 0) {
      return invalid();
    }

    const match = await bcrypt.compare(String(code).trim(), codes[0].code_hash);
    if (!match) {
      return invalid();
    }

    // Consume atomically: the used_at guard makes a replayed code fail
    const [consumed] = await pool.query(
      'UPDATE password_reset_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL',
      [codes[0].id]
    );
    if (consumed.affectedRows === 0) {
      return invalid();
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, user.id]);

    res.json({ status: 'success', message: 'Password reset. You can sign in now.' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.role, u.created_at, u.garage_id,
              g.garage_name, g.garage_code
       FROM users u
       JOIN garages g ON u.garage_id = g.id
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const row = users[0];
    res.json({
      status: 'success',
      data: {
        id: row.id,
        username: row.username,
        role: row.role,
        created_at: row.created_at,
        garage: { id: row.garage_id, name: row.garage_name, code: row.garage_code }
      }
    });
  } catch (error) {
    next(error);
  }
};
