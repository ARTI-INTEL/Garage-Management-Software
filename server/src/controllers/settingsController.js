import pool from '../config/db.js';

// @desc    Get garage settings (returns defaults if the garage has no row yet)
// @route   GET /api/settings
// @access  Private
export const getSettings = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM garages WHERE id = ?', [req.user.garage_id]);

    if (rows.length === 0) {
      return res.json({
        status: 'success',
        data: {
          id: null,
          garage_name: 'My Auto Workshop',
          address: '',
          phone: '',
          logo_url: '',
          currency: 'AED',
          tax_rate: 0,
          whatsapp_template: ''
        }
      });
    }

    res.json({ status: 'success', data: rows[0] });
  } catch (error) {
    next(error);
  }
};

// @desc    Update (upsert) garage settings for the logged-in user's garage
// @route   PUT /api/settings
// @access  Private (Admin)
export const updateSettings = async (req, res, next) => {
  try {
    const { garage_name, address, phone, logo_url, currency, tax_rate, whatsapp_template } = req.body;

    if (!garage_name) {
      return res.status(400).json({ status: 'error', message: 'Garage name is required' });
    }

    await pool.query(
      `UPDATE garages
       SET garage_name = ?, address = ?, phone = ?, logo_url = ?, currency = ?, tax_rate = ?, whatsapp_template = ?
       WHERE id = ?`,
      [garage_name, address || null, phone || null, logo_url || null, currency || 'AED', parseFloat(tax_rate) || 0, whatsapp_template || null, req.user.garage_id]
    );

    const [updated] = await pool.query('SELECT * FROM garages WHERE id = ?', [req.user.garage_id]);
    res.json({ status: 'success', data: updated[0] });
  } catch (error) {
    next(error);
  }
};
