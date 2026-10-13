import pool from '../config/db.js';
import { generateQuotePDF } from '../services/pdfService.js';

// @desc    Download quotation PDF
// @route   GET /api/quotes/:id/pdf
// @access  Private
export const getQuotePDF = async (req, res, next) => {
  try {
    const [quotes] = await pool.query(
      `SELECT q.*, v.registration_number, v.make, v.model, v.year,
              c.full_name AS customer_name, c.mobile_number, c.email AS customer_email,
              j.title AS job_title
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

    const [settingsRows] = await pool.query('SELECT * FROM garages WHERE id = ?', [quote.garage_id]);
    quote.settings = settingsRows[0] || null;

    const pdfBuffer = await generateQuotePDF(quote);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.quote_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};
