import pool from '../config/db.js';

// Helper: unique quote number (per garage)
const generateQuoteNumber = async (garageId) => {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM quotations WHERE YEAR(quote_date) = ? AND garage_id = ?',
    [year, garageId]
  );
  const count = rows[0].count + 1;
  return `QUO-${year}-${String(count).padStart(4, '0')}`;
};

// @desc    Generate a quotation from a repair job
// @route   POST /api/quotes/generate
// @access  Private (Admin)
export const generateQuote = async (req, res, next) => {
  try {
    const { repair_job_id, discount, tax_rate, notes } = req.body;
    if (!repair_job_id) {
      return res.status(400).json({ status: 'error', message: 'repair_job_id is required' });
    }

    const [jobs] = await pool.query(
      `SELECT j.*, v.customer_id, v.registration_number, v.make, v.model
       FROM repair_jobs j
       JOIN vehicles v ON j.vehicle_id = v.id
       WHERE j.id = ? AND j.garage_id = ?`,
      [repair_job_id, req.user.garage_id]
    );
    if (jobs.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Repair job not found' });
    }
    const job = jobs[0];

    // Tax rate default from garage settings
    let effectiveTaxRate = tax_rate;
    if (effectiveTaxRate === undefined || effectiveTaxRate === null || effectiveTaxRate === '') {
      const [settingsRows] = await pool.query('SELECT tax_rate FROM garages WHERE id = ?', [req.user.garage_id]);
      effectiveTaxRate = settingsRows.length > 0 ? parseFloat(settingsRows[0].tax_rate) || 0 : 0;
    }

    const [parts] = await pool.query('SELECT * FROM repair_parts WHERE repair_job_id = ?', [job.id]);

    const items = [];
    let totalLabour = 0;
    let totalParts = 0;

    const labourCost = parseFloat(job.labour_cost) || 0;
    if (labourCost > 0) {
      totalLabour = labourCost;
      items.push({ item_type: 'labour', description: `${job.title} - Labour`, quantity: 1, unit_price: labourCost, total: labourCost });
    }
    for (const part of parts) {
      const partTotal = parseFloat(part.unit_price) * parseInt(part.quantity);
      totalParts += partTotal;
      items.push({
        item_type: 'part',
        description: `${part.part_name}${part.part_number ? ` (${part.part_number})` : ''}`,
        quantity: parseInt(part.quantity),
        unit_price: parseFloat(part.unit_price),
        total: partTotal
      });
    }

    const subtotal = totalLabour + totalParts;
    const discountAmount = parseFloat(discount) || 0;
    const taxAmount = ((subtotal - discountAmount) * (parseFloat(effectiveTaxRate) || 0)) / 100;
    const grandTotal = subtotal - discountAmount + taxAmount;

    const quoteNumber = await generateQuoteNumber(req.user.garage_id);

    const [result] = await pool.query(
      `INSERT INTO quotations (garage_id, quote_number, repair_job_id, vehicle_id, customer_id, total_labour, total_parts, subtotal, discount, tax, grand_total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.garage_id, quoteNumber, job.id, job.vehicle_id, job.customer_id, totalLabour, totalParts, subtotal, discountAmount, taxAmount, grandTotal, notes || null]
    );
    const quoteId = result.insertId;

    for (const item of items) {
      await pool.query(
        'INSERT INTO quotation_items (quotation_id, item_type, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)',
        [quoteId, item.item_type, item.description, item.quantity, item.unit_price, item.total]
      );
    }

    // Move job into the approval step of the workflow (with audit trail)
    const [upd] = await pool.query(
      "UPDATE repair_jobs SET status = 'Awaiting Approval' WHERE id = ? AND status IN ('Awaiting Diagnosis', 'Diagnosed')",
      [job.id]
    );
    if (upd.affectedRows > 0) {
      await pool.query(
        'INSERT INTO job_status_history (job_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)',
        [job.id, job.status, 'Awaiting Approval', req.user.id]
      );
    }

    res.status(201).json({ status: 'success', data: { id: quoteId, quote_number: quoteNumber, grand_total: grandTotal } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'Quote number already exists' });
    }
    next(error);
  }
};

// @desc    List quotations (optional vehicle/job filter)
// @route   GET /api/quotes
// @access  Private (Admin)
export const getQuotes = async (req, res, next) => {
  try {
    const { vehicle_id, repair_job_id, page, limit } = req.query;
    const pageRaw = parseInt(page, 10) || 0;
    const limitRaw = parseInt(limit, 10) || 0;
    const paginated = pageRaw > 0 && limitRaw > 0;
    const pageNum = Math.max(1, pageRaw);
    const limitNum = Math.min(100, Math.max(1, limitRaw));

    const baseFrom = `
      FROM quotations q
      JOIN vehicles v ON q.vehicle_id = v.id
      JOIN customers c ON q.customer_id = c.id
      JOIN repair_jobs j ON q.repair_job_id = j.id`;
    const where = ['q.garage_id = ?'];
    const params = [req.user.garage_id];
    if (vehicle_id) { where.push('q.vehicle_id = ?'); params.push(vehicle_id); }
    if (repair_job_id) { where.push('q.repair_job_id = ?'); params.push(repair_job_id); }
    const clause = ' WHERE ' + where.join(' AND ');

    let query = `
      SELECT q.*, v.registration_number, v.make, v.model, c.full_name AS customer_name, j.title AS job_title
       ${baseFrom}${clause}
       ORDER BY q.created_at DESC`;
    if (paginated) query += ' LIMIT ? OFFSET ?';

    const [quotes] = await pool.query(query, paginated ? [...params, limitNum, (pageNum - 1) * limitNum] : params);

    if (!paginated) {
      return res.json({ status: 'success', data: quotes });
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${baseFrom}${clause}`, params);
    const total = countRows[0].total;
    res.json({
      status: 'success',
      data: quotes,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Single quotation with items
// @route   GET /api/quotes/:id
// @access  Private
export const getQuoteById = async (req, res, next) => {
  try {
    const [quotes] = await pool.query(
      `SELECT q.*, v.registration_number, v.make, v.model, v.year, v.colour,
              c.full_name AS customer_name, c.mobile_number, c.whatsapp_number, c.email AS customer_email,
              j.title AS job_title, j.description AS job_description, j.status AS job_status
       FROM quotations q
       JOIN vehicles v ON q.vehicle_id = v.id
       JOIN customers c ON q.customer_id = c.id
       JOIN repair_jobs j ON q.repair_job_id = j.id
       WHERE q.id = ? AND q.garage_id = ?`,
      [req.params.id, req.user.garage_id]
    );
    if (quotes.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }
    const quote = quotes[0];
    const [items] = await pool.query('SELECT * FROM quotation_items WHERE quotation_id = ?', [quote.id]);
    quote.items = items;
    res.json({ status: 'success', data: quote });
  } catch (error) {
    next(error);
  }
};

// @desc    Update quotation status (approve/reject marks the job too)
// @route   PUT /api/quotes/:id/status
// @access  Private (Admin)
export const updateQuoteStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ status: 'error', message: `Status must be one of: ${allowed.join(', ')}` });
    }

    const [quotes] = await pool.query('SELECT * FROM quotations WHERE id = ? AND garage_id = ?', [req.params.id, req.user.garage_id]);
    if (quotes.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }

    await pool.query('UPDATE quotations SET status = ? WHERE id = ?', [status, req.params.id]);

    // Reflect approval on the job (with audit trail entry)
    const quote = quotes[0];
    if (status === 'Approved') {
      const [jobRows] = await pool.query('SELECT status FROM repair_jobs WHERE id = ?', [quote.repair_job_id]);
      const fromStatus = jobRows[0]?.status;
      await pool.query("UPDATE repair_jobs SET status = 'Awaiting Repair' WHERE id = ?", [quote.repair_job_id]);
      await pool.query(
        'INSERT INTO job_status_history (job_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)',
        [quote.repair_job_id, fromStatus, 'Awaiting Repair', req.user.id]
      );
    } else if (status === 'Rejected') {
      const [jobRows] = await pool.query('SELECT status FROM repair_jobs WHERE id = ?', [quote.repair_job_id]);
      const fromStatus = jobRows[0]?.status;
      await pool.query("UPDATE repair_jobs SET status = 'Diagnosed' WHERE id = ?", [quote.repair_job_id]);
      await pool.query(
        'INSERT INTO job_status_history (job_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)',
        [quote.repair_job_id, fromStatus, 'Diagnosed', req.user.id]
      );
    }

    res.json({ status: 'success', data: { id: quote.id, status } });
  } catch (error) {
    next(error);
  }
};

// @desc    WhatsApp click-to-chat link for a quotation
// @route   GET /api/quotes/:id/whatsapp
// @access  Private (Admin)
export const getQuoteWhatsApp = async (req, res, next) => {
  try {
    const [quotes] = await pool.query(
      `SELECT q.*, v.registration_number, c.full_name AS customer_name, c.whatsapp_number, c.mobile_number
       FROM quotations q
       JOIN vehicles v ON q.vehicle_id = v.id
       JOIN customers c ON q.customer_id = c.id
       WHERE q.id = ? AND q.garage_id = ?`,
      [req.params.id, req.user.garage_id]
    );
    if (quotes.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Quotation not found' });
    }
    const quote = quotes[0];
    const phone = quote.whatsapp_number || quote.mobile_number;
    if (!phone) {
      return res.status(400).json({ status: 'error', message: 'Customer does not have a WhatsApp or mobile number' });
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const [settingsRows] = await pool.query('SELECT * FROM garages WHERE id = ?', [quote.garage_id]);
    const currency = settingsRows[0]?.currency || 'AED';

    const message = `Hello ${quote.customer_name},\n\nHere is our quotation *${quote.quote_number}* for *${quote.registration_number}* (${quote.make} ${quote.model}).\n\nTotal: *${currency} ${parseFloat(quote.grand_total).toFixed(2)}*\n\nPlease reply *YES* to approve this quote or *NO* to decline, and we'll proceed accordingly.\n\nThank you.`;

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    await pool.query("UPDATE quotations SET status = 'Sent' WHERE id = ? AND status = 'Draft'", [quote.id]);

    res.json({ status: 'success', data: { whatsapp_url: whatsappUrl, phone: cleanPhone, message } });
  } catch (error) {
    next(error);
  }
};
