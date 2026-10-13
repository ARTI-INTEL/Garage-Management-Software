import pool from '../config/db.js';

// @desc    List parts catalog (search + low-stock filter)
// @route   GET /api/parts
// @access  Private
export const getParts = async (req, res, next) => {
  try {
    const { search, low_stock, page, limit } = req.query;
    const pageRaw = parseInt(page, 10) || 0;
    const limitRaw = parseInt(limit, 10) || 0;
    const paginated = pageRaw > 0 && limitRaw > 0;
    const pageNum = Math.max(1, pageRaw);
    const limitNum = Math.min(100, Math.max(1, limitRaw));

    let countQuery = 'SELECT COUNT(*) AS total FROM parts_catalog';
    let query = 'SELECT *, (qty_in_stock <= low_stock_threshold) AS is_low_stock FROM parts_catalog';
    const where = ['garage_id = ?'];
    const params = [req.user.garage_id];

    if (search) {
      where.push('(name LIKE ? OR part_number LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (low_stock === '1') {
      where.push('qty_in_stock <= low_stock_threshold');
    }
    const clause = ' WHERE ' + where.join(' AND ');
    countQuery += clause;
    query += clause;
    query += ' ORDER BY name ASC';
    if (paginated) query += ' LIMIT ? OFFSET ?';

    const [parts] = await pool.query(query, paginated ? [...params, limitNum, (pageNum - 1) * limitNum] : params);

    if (!paginated) {
      return res.json({ status: 'success', data: parts });
    }

    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0].total;
    res.json({
      status: 'success',
      data: parts,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create catalog part
// @route   POST /api/parts
// @access  Private (Admin)
export const createPart = async (req, res, next) => {
  try {
    const { part_number, name, cost_price, sell_price, qty_in_stock, low_stock_threshold } = req.body;
    if (!part_number || !name) {
      return res.status(400).json({ status: 'error', message: 'Part number and name are required' });
    }
    const [result] = await pool.query(
      `INSERT INTO parts_catalog (garage_id, part_number, name, cost_price, sell_price, qty_in_stock, low_stock_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.garage_id, part_number, name, cost_price || 0, sell_price || 0, qty_in_stock || 0, low_stock_threshold ?? 5]
    );
    const [rows] = await pool.query('SELECT * FROM parts_catalog WHERE id = ?', [result.insertId]);
    res.status(201).json({ status: 'success', data: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'Part number already exists' });
    }
    next(error);
  }
};

// @desc    Update catalog part
// @route   PUT /api/parts/:id
// @access  Private (Admin)
export const updatePart = async (req, res, next) => {
  try {
    const { part_number, name, cost_price, sell_price, qty_in_stock, low_stock_threshold } = req.body;
    const [result] = await pool.query(
      `UPDATE parts_catalog SET part_number = ?, name = ?, cost_price = ?, sell_price = ?, qty_in_stock = ?, low_stock_threshold = ?
       WHERE id = ? AND garage_id = ?`,
      [part_number, name, cost_price || 0, sell_price || 0, qty_in_stock ?? 0, low_stock_threshold ?? 5, req.params.id, req.user.garage_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Part not found' });
    }
    const [rows] = await pool.query('SELECT * FROM parts_catalog WHERE id = ?', [req.params.id]);
    res.json({ status: 'success', data: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'Part number already exists' });
    }
    next(error);
  }
};

// @desc    Delete catalog part
// @route   DELETE /api/parts/:id
// @access  Private (Admin)
export const deletePart = async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM parts_catalog WHERE id = ? AND garage_id = ?', [req.params.id, req.user.garage_id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Part not found' });
    }
    res.json({ status: 'success', message: 'Part deleted' });
  } catch (error) {
    next(error);
  }
};
