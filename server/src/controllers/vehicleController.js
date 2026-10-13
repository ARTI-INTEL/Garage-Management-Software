import pool from '../config/db.js';

// @desc    Get all vehicles (with optional search)
// @route   GET /api/vehicles
// @access  Private
export const getVehicles = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const pageRaw = parseInt(page, 10) || 0;
    const limitRaw = parseInt(limit, 10) || 0;
    const paginated = pageRaw > 0 && limitRaw > 0;
    const pageNum = Math.max(1, pageRaw);
    const limitNum = Math.min(100, Math.max(1, limitRaw));

    const selectClause = `
      SELECT v.*, c.full_name as owner_name, c.mobile_number, c.whatsapp_number
      FROM vehicles v
      JOIN customers c ON v.customer_id = c.id
    `;
    const countClause = `
      SELECT COUNT(*) AS total
      FROM vehicles v
      JOIN customers c ON v.customer_id = c.id
    `;
    const where = ['v.garage_id = ?'];
    const params = [req.user.garage_id];

    if (search) {
      where.push('(v.registration_number LIKE ? OR c.full_name LIKE ? OR c.mobile_number LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    let query = selectClause;
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY v.created_at DESC';
    if (paginated) query += ' LIMIT ? OFFSET ?';

    const [vehicles] = await pool.query(query, paginated ? [...params, limitNum, (pageNum - 1) * limitNum] : params);

    if (!paginated) {
      return res.json({ status: 'success', data: vehicles });
    }

    let countQuery = countClause;
    if (where.length) countQuery += ' WHERE ' + where.join(' AND ');
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;
    res.json({
      status: 'success',
      data: vehicles,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single vehicle by ID
// @route   GET /api/vehicles/:id
// @access  Private
export const getVehicleById = async (req, res, next) => {
  try {
    const query = `
      SELECT v.*, 
             c.full_name as owner_name, c.mobile_number, c.whatsapp_number, c.email as owner_email, c.address as owner_address
      FROM vehicles v
      JOIN customers c ON v.customer_id = c.id
      WHERE v.id = ? AND v.garage_id = ?
    `;
    const [vehicles] = await pool.query(query, [req.params.id, req.user.garage_id]);
    
    if (vehicles.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Vehicle not found' });
    }

    res.json({ status: 'success', data: vehicles[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new vehicle
// @route   POST /api/vehicles
// @access  Private (Admin)
export const createVehicle = async (req, res, next) => {
  try {
    const { customer_id, registration_number, make, model, year, colour, vehicle_type, vin, odometer, notes } = req.body;

    if (!customer_id || !registration_number || !make || !model) {
      return res.status(400).json({ status: 'error', message: 'Customer, registration number, make, and model are required' });
    }

    // The customer must belong to this garage
    const [cust] = await pool.query('SELECT id FROM customers WHERE id = ? AND garage_id = ?', [customer_id, req.user.garage_id]);
    if (cust.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Customer not found' });
    }

    const [result] = await pool.query(
      `INSERT INTO vehicles (garage_id, customer_id, registration_number, make, model, year, colour, vehicle_type, vin, odometer, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.garage_id, customer_id, registration_number.toUpperCase(), make, model, year || null, colour || null, vehicle_type || null, vin || null, odometer || null, notes || null]
    );

    const [newVehicle] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [result.insertId]);
    res.status(201).json({ status: 'success', data: newVehicle[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'Registration number already exists' });
    }
    next(error);
  }
};

// @desc    Update vehicle
// @route   PUT /api/vehicles/:id
// @access  Private (Admin)
export const updateVehicle = async (req, res, next) => {
  try {
    const { registration_number, make, model, year, colour, vehicle_type, vin, odometer, notes } = req.body;

    const [result] = await pool.query(
      `UPDATE vehicles 
       SET registration_number = ?, make = ?, model = ?, year = ?, colour = ?, vehicle_type = ?, vin = ?, odometer = ?, notes = ? 
       WHERE id = ? AND garage_id = ?`,
      [registration_number.toUpperCase(), make, model, year || null, colour || null, vehicle_type || null, vin || null, odometer || null, notes || null, req.params.id, req.user.garage_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Vehicle not found' });
    }

    const [updatedVehicle] = await pool.query('SELECT * FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ status: 'success', data: updatedVehicle[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'Registration number already exists' });
    }
    next(error);
  }
};

