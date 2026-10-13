import pool from '../config/db.js';
import { createGarageWithAdmin } from '../services/garageService.js';

// Normalises and validates a garage code (shared by create and update).
// Throws a 400-shaped error.
const validateGarageCode = (garage_code) => {
  const code = String(garage_code).toUpperCase().trim();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    const err = new Error('Garage code must be 3-30 characters (letters, numbers, - or _)');
    err.statusCode = 400;
    throw err;
  }
  return code;
};

// Validation shared by create endpoints. Throws a 400-shaped error.
const validateGarageInput = ({ garage_name, garage_code, username, password }) => {
  const fail = (message) => {
    const err = new Error(message);
    err.statusCode = 400;
    throw err;
  };

  if (!garage_name || !garage_code || !username || !password) {
    fail('Garage name, garage code, admin username and password are required');
  }
  const code = validateGarageCode(garage_code);
  if (password.length < 6) {
    fail('Password must be at least 6 characters');
  }
  return code;
};

// @desc    List all garages with basic usage stats
// @route   GET /api/garages
// @access  Private (Super Admin)
export const getGarages = async (req, res, next) => {
  try {
    const [garages] = await pool.query(
      `SELECT g.id, g.garage_name, g.garage_code, g.phone, g.address, g.currency, g.is_active, g.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.garage_id = g.id) AS user_count,
              (SELECT COUNT(*) FROM customers c WHERE c.garage_id = g.id) AS customer_count,
              (SELECT COUNT(*) FROM vehicles v WHERE v.garage_id = g.id) AS vehicle_count
       FROM garages g
       ORDER BY g.created_at ASC`
    );
    res.json({ status: 'success', data: garages });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a garage (with its admin user)
// @route   POST /api/garages
// @access  Private (Super Admin)
export const createGarage = async (req, res, next) => {
  try {
    const { garage_name, username, password, phone, address } = req.body;
    const code = validateGarageInput(req.body);

    const { garageId, userId } = await createGarageWithAdmin({
      garageName: garage_name,
      garageCode: code,
      username,
      password,
      phone,
      address
    });

    const [garages] = await pool.query('SELECT * FROM garages WHERE id = ?', [garageId]);
    res.status(201).json({ status: 'success', data: { garage: garages[0], admin_user_id: userId } });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    next(error);
  }
};

// @desc    Update a garage's info (name, code, phone, address)
// @route   PUT /api/garages/:id
// @access  Private (Super Admin)
export const updateGarage = async (req, res, next) => {
  try {
    const garageId = parseInt(req.params.id, 10);
    const { garage_name, garage_code, phone, address } = req.body;

    const [garages] = await pool.query('SELECT * FROM garages WHERE id = ?', [garageId]);
    if (garages.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Garage not found' });
    }
    const current = garages[0];

    let code = current.garage_code;
    if (garage_code !== undefined && String(garage_code).trim() !== '') {
      code = validateGarageCode(garage_code);
      if (code !== current.garage_code) {
        const [dupe] = await pool.query('SELECT id FROM garages WHERE garage_code = ? AND id <> ?', [code, garageId]);
        if (dupe.length > 0) {
          return res.status(400).json({ status: 'error', message: 'Garage code is already taken' });
        }
      }
    }

    // PUT semantics: fields present in the body replace the old values,
    // omitted fields keep what the garage already had.
    await pool.query(
      'UPDATE garages SET garage_name = ?, garage_code = ?, phone = ?, address = ? WHERE id = ?',
      [
        String(garage_name).trim(),
        code,
        phone === undefined ? current.phone : (phone || null),
        address === undefined ? current.address : (address || null),
        garageId
      ]
    );

    const [updated] = await pool.query('SELECT * FROM garages WHERE id = ?', [garageId]);
    res.json({
      status: 'success',
      message: `Garage "${updated[0].garage_name}" updated`,
      data: updated[0]
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ status: 'error', message: error.message });
    }
    next(error);
  }
};

// @desc    Temporarily disable / re-enable a garage without deleting anything
// @route   PATCH /api/garages/:id/status
// @access  Private (Super Admin)
export const setGarageStatus = async (req, res, next) => {
  try {
    const garageId = parseInt(req.params.id, 10);
    const isActive = [true, 1, '1', 'true'].includes(req.body.is_active);

    const [garages] = await pool.query('SELECT * FROM garages WHERE id = ?', [garageId]);
    if (garages.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Garage not found' });
    }
    const garage = garages[0];

    // Same self-lockout guard as delete: the operator must stay reachable.
    if (!isActive && garageId === req.user.garage_id) {
      return res.status(400).json({ status: 'error', message: 'You cannot disable the garage you belong to' });
    }

    await pool.query('UPDATE garages SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, garageId]);

    res.json({
      status: 'success',
      message: isActive
        ? `Garage "${garage.garage_name}" enabled — its users can sign in again`
        : `Garage "${garage.garage_name}" disabled — its users are blocked, no data was deleted`,
      data: { id: garageId, is_active: isActive ? 1 : 0 }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a garage and all of its data (cascade)
// @route   DELETE /api/garages/:id?confirm_code=XXXX
// @access  Private (Super Admin)
export const deleteGarage = async (req, res, next) => {
  try {
    const garageId = parseInt(req.params.id, 10);

    if (garageId === req.user.garage_id) {
      return res.status(400).json({ status: 'error', message: 'You cannot delete the garage you belong to' });
    }

    const [garages] = await pool.query('SELECT * FROM garages WHERE id = ?', [garageId]);
    if (garages.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Garage not found' });
    }
    const garage = garages[0];

    // Safety: require the garage code so a misclick can't wipe a garage
    const confirmCode = String(req.query.confirm_code || '').toUpperCase().trim();
    if (confirmCode !== garage.garage_code) {
      return res.status(400).json({
        status: 'error',
        message: 'Confirmation code does not match the garage code'
      });
    }

    await pool.query('DELETE FROM garages WHERE id = ?', [garageId]);
    res.json({
      status: 'success',
      message: `Garage "${garage.garage_name}" and all of its data deleted`
    });
  } catch (error) {
    next(error);
  }
};
