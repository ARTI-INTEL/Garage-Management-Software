import pool from '../config/db.js';

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private (Admin)
export const getInvoices = async (req, res, next) => {
  try {
    const { payment_status, page, limit } = req.query;
    const pageRaw = parseInt(page, 10) || 0;
    const limitRaw = parseInt(limit, 10) || 0;
    const paginated = pageRaw > 0 && limitRaw > 0;
    const pageNum = Math.max(1, pageRaw);
    const limitNum = Math.min(100, Math.max(1, limitRaw));

    const fromClause = `
      FROM invoices i
      JOIN vehicles v ON i.vehicle_id = v.id
      JOIN customers c ON i.customer_id = c.id
    `;
    const where = ['i.garage_id = ?'];
    const params = [req.user.garage_id];
    if (payment_status) {
      where.push('i.payment_status = ?');
      params.push(payment_status);
    }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';

    let query = `SELECT i.*, v.registration_number, v.make, v.model, c.full_name as customer_name ${fromClause}${clause} ORDER BY i.invoice_date DESC`;
    if (paginated) query += ' LIMIT ? OFFSET ?';

    const [invoices] = await pool.query(query, paginated ? [...params, limitNum, (pageNum - 1) * limitNum] : params);

    if (!paginated) {
      return res.json({ status: 'success', data: invoices });
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${fromClause}${clause}`, params);
    const total = countRows[0].total;
    res.json({
      status: 'success',
      data: invoices,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single invoice with items
// @route   GET /api/invoices/:id
// @access  Private
export const getInvoiceById = async (req, res, next) => {
  try {
    const [invoices] = await pool.query(
      `SELECT i.*, v.registration_number, v.make, v.model, v.year, v.colour,
              c.full_name as customer_name, c.mobile_number, c.whatsapp_number, c.email as customer_email, c.address as customer_address
       FROM invoices i
       JOIN vehicles v ON i.vehicle_id = v.id
       JOIN customers c ON i.customer_id = c.id
       WHERE i.id = ? AND i.garage_id = ?`,
      [req.params.id, req.user.garage_id]
    );

    if (invoices.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }

    const invoice = invoices[0];

    // Get invoice items
    const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [invoice.id]);
    invoice.items = items;

    // Get payments
    const [payments] = await pool.query('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC', [invoice.id]);
    invoice.payments = payments;

    // Calculate amount paid
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    invoice.amount_paid = totalPaid;
    invoice.balance_due = parseFloat(invoice.grand_total) - totalPaid;

    res.json({ status: 'success', data: invoice });
  } catch (error) {
    next(error);
  }
};

// @desc    Get invoices for a specific vehicle
// @route   GET /api/invoices/vehicle/:vehicleId
// @access  Private
export const getInvoicesByVehicle = async (req, res, next) => {
  try {
    const [invoices] = await pool.query(
      `SELECT i.*, c.full_name as customer_name
       FROM invoices i
       JOIN customers c ON i.customer_id = c.id
       WHERE i.vehicle_id = ? AND i.garage_id = ?
       ORDER BY i.invoice_date DESC`,
      [req.params.vehicleId, req.user.garage_id]
    );
    res.json({ status: 'success', data: invoices });
  } catch (error) {
    next(error);
  }
};

// Helper: generate unique invoice number (per garage)
const generateInvoiceNumber = async (garageId) => {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    "SELECT COUNT(*) as count FROM invoices WHERE YEAR(invoice_date) = ? AND garage_id = ?",
    [year, garageId]
  );
  const count = rows[0].count + 1;
  return `INV-${year}-${String(count).padStart(4, '0')}`;
};

// @desc    Generate invoice from vehicle repair jobs
// @route   POST /api/invoices/generate
// @access  Private (Admin)
export const generateInvoice = async (req, res, next) => {
  try {
    const { vehicle_id, discount, tax_rate, notes } = req.body;

    if (!vehicle_id) {
      return res.status(400).json({ status: 'error', message: 'Vehicle ID is required' });
    }

    // Default tax rate from garage settings when the client doesn't send one
    let effectiveTaxRate = tax_rate;
    if (effectiveTaxRate === undefined || effectiveTaxRate === null || effectiveTaxRate === '') {
      const [settingsRows] = await pool.query('SELECT tax_rate FROM garages WHERE id = ?', [req.user.garage_id]);
      effectiveTaxRate = settingsRows.length > 0 ? parseFloat(settingsRows[0].tax_rate) || 0 : 0;
    }

    // Get vehicle + customer (must belong to this garage)
    const [vehicles] = await pool.query(
      'SELECT v.*, c.id as cust_id FROM vehicles v JOIN customers c ON v.customer_id = c.id WHERE v.id = ? AND v.garage_id = ?',
      [vehicle_id, req.user.garage_id]
    );

    if (vehicles.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Vehicle not found' });
    }

    const vehicle = vehicles[0];

    // Get all repair jobs for this vehicle (that haven't been invoiced yet or all)
    const [jobs] = await pool.query(
      'SELECT * FROM repair_jobs WHERE vehicle_id = ?',
      [vehicle_id]
    );

    if (jobs.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No repair jobs found for this vehicle' });
    }

    // Calculate totals from jobs and parts
    let totalLabour = 0;
    let totalParts = 0;
    const invoiceItems = [];

    for (const job of jobs) {
      // Labour item
      const labourCost = parseFloat(job.labour_cost) || 0;
      if (labourCost > 0) {
        totalLabour += labourCost;
        invoiceItems.push({
          item_type: 'labour',
          description: `${job.title} - Labour`,
          quantity: 1,
          unit_price: labourCost,
          total: labourCost
        });
      }

      // Parts
      const [parts] = await pool.query('SELECT * FROM repair_parts WHERE repair_job_id = ?', [job.id]);
      for (const part of parts) {
        const partTotal = parseFloat(part.unit_price) * parseInt(part.quantity);
        totalParts += partTotal;
        invoiceItems.push({
          item_type: 'part',
          description: `${part.part_name}${part.part_number ? ` (${part.part_number})` : ''}`,
          quantity: parseInt(part.quantity),
          unit_price: parseFloat(part.unit_price),
          total: partTotal
        });
      }
    }

    const subtotal = totalLabour + totalParts;
    const discountAmount = parseFloat(discount) || 0;
    const taxRateVal = parseFloat(effectiveTaxRate) || 0;
    const taxAmount = ((subtotal - discountAmount) * taxRateVal) / 100;
    const grandTotal = subtotal - discountAmount + taxAmount;

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(req.user.garage_id);

    // Insert invoice
    const [invoiceResult] = await pool.query(
      `INSERT INTO invoices (garage_id, invoice_number, vehicle_id, customer_id, total_labour, total_parts, subtotal, discount, tax, grand_total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.garage_id, invoiceNumber, vehicle_id, vehicle.cust_id, totalLabour, totalParts, subtotal, discountAmount, taxAmount, grandTotal, notes || null]
    );

    const invoiceId = invoiceResult.insertId;

    // Insert invoice items (snapshot)
    for (const item of invoiceItems) {
      await pool.query(
        'INSERT INTO invoice_items (invoice_id, item_type, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)',
        [invoiceId, item.item_type, item.description, item.quantity, item.unit_price, item.total]
      );
    }

    res.status(201).json({ status: 'success', data: { id: invoiceId, invoice_number: invoiceNumber } });
  } catch (error) {
    next(error);
  }
};

// @desc    Record a payment against an invoice
// @route   POST /api/invoices/:id/payments
// @access  Private (Admin)
export const recordPayment = async (req, res, next) => {
  try {
    const invoiceId = req.params.id;
    const { amount, payment_method } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ status: 'error', message: 'Valid payment amount is required' });
    }

    // Get current invoice
    const [invoices] = await pool.query('SELECT * FROM invoices WHERE id = ? AND garage_id = ?', [invoiceId, req.user.garage_id]);
    if (invoices.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Invoice not found' });
    }

    const invoice = invoices[0];

    // Get existing payments
    const [payments] = await pool.query('SELECT SUM(amount) as total_paid FROM payments WHERE invoice_id = ?', [invoiceId]);
    const totalPaid = parseFloat(payments[0].total_paid) || 0;
    const newTotalPaid = totalPaid + parseFloat(amount);

    // Insert payment
    await pool.query(
      'INSERT INTO payments (invoice_id, amount, payment_method) VALUES (?, ?, ?)',
      [invoiceId, parseFloat(amount), payment_method || null]
    );

    // Update invoice payment status
    let paymentStatus = 'Unpaid';
    if (newTotalPaid >= parseFloat(invoice.grand_total)) {
      paymentStatus = 'Paid';
    } else if (newTotalPaid > 0) {
      paymentStatus = 'Partially Paid';
    }

    await pool.query('UPDATE invoices SET payment_status = ?, payment_method = ? WHERE id = ?', [paymentStatus, payment_method, invoiceId]);

    res.status(201).json({ status: 'success', message: 'Payment recorded', data: { payment_status: paymentStatus } });
  } catch (error) {
    next(error);
  }
};

