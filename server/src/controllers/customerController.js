import pool from '../config/db.js';

// @desc    Get all customers (with optional search)
// @route   GET /api/customers
// @access  Private (Admin)
export const getCustomers = async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const pageRaw = parseInt(page, 10) || 0;
    const limitRaw = parseInt(limit, 10) || 0;
    const paginated = pageRaw > 0 && limitRaw > 0;
    const pageNum = Math.max(1, pageRaw);
    const limitNum = Math.min(100, Math.max(1, limitRaw));

    let countQuery = 'SELECT COUNT(*) AS total FROM customers';
    let query = 'SELECT * FROM customers';
    const where = ['garage_id = ?'];
    const params = [req.user.garage_id];

    if (search) {
      where.push('(full_name LIKE ? OR mobile_number LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (where.length) {
      const clause = ' WHERE ' + where.join(' AND ');
      countQuery += clause;
      query += clause;
    }
    query += ' ORDER BY created_at DESC';
    if (paginated) query += ' LIMIT ? OFFSET ?';

    const [customers] = await pool.query(query, paginated ? [...params, limitNum, (pageNum - 1) * limitNum] : params);

    if (!paginated) {
      return res.json({ status: 'success', data: customers });
    }

    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;
    res.json({
      status: 'success',
      data: customers,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private (Admin)
export const getCustomerById = async (req, res, next) => {
  try {
    const [customers] = await pool.query('SELECT * FROM customers WHERE id = ? AND garage_id = ?', [req.params.id, req.user.garage_id]);
    
    if (customers.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    res.json({ status: 'success', data: customers[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new customer
// @route   POST /api/customers
// @access  Private (Admin)
export const createCustomer = async (req, res, next) => {
  try {
    const { full_name, mobile_number, whatsapp_number, email, address, notes } = req.body;

    if (!full_name || !mobile_number) {
      return res.status(400).json({ status: 'error', message: 'Full name and mobile number are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO customers (garage_id, full_name, mobile_number, whatsapp_number, email, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.garage_id, full_name, mobile_number, whatsapp_number || null, email || null, address || null, notes || null]
    );

    const [newCustomer] = await pool.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);

    res.status(201).json({ status: 'success', data: newCustomer[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private (Admin)
export const updateCustomer = async (req, res, next) => {
  try {
    const { full_name, mobile_number, whatsapp_number, email, address, notes } = req.body;

    const [result] = await pool.query(
      'UPDATE customers SET full_name = ?, mobile_number = ?, whatsapp_number = ?, email = ?, address = ?, notes = ? WHERE id = ? AND garage_id = ?',
      [full_name, mobile_number, whatsapp_number || null, email || null, address || null, notes || null, req.params.id, req.user.garage_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    const [updatedCustomer] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json({ status: 'success', data: updatedCustomer[0] });
  } catch (error) {
    next(error);
  }
};

